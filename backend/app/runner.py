import logging
from datetime import datetime, timezone
from .db import AsyncSessionLocal
from .models import Job, Remote, Credential, ScheduleTemplate, SystemSettings, JobHistory, JobAction, Action
from .rclone import rclone_manager
from .events import event_manager
from .crypto import decrypt_credential_data
from sqlalchemy import select, delete, func
from sqlalchemy.orm import selectinload
import asyncio
import json
import httpx
import re
import shlex


logger = logging.getLogger(__name__)

class JobRunner:
    def __init__(self):
        self.active_jobs = {} # db_job_id -> rclone_job_id
        self.job_totals = {} # db_job_id -> total_bytes
        self.job_snapshots = {} # db_job_id -> job config at start time
        self.job_start_times = {} # db_job_id -> start datetime
        self.active_job_counts = {} # db_job_id -> count of running instances
        self.last_failure_times = {} # db_job_id -> last failure timestamp
        self.job_transferred_files = {} # db_job_id -> set of transferred file names
        self.job_final_stats = {} # db_job_id -> last known stats before completion

    async def _get_system_setting(self, key: str, default=None):
        """Get a system setting value."""
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(SystemSettings).where(SystemSettings.key == key)
                )
                setting = result.scalars().first()
                if setting and setting.value is not None:
                    # Handle JSON-stored values
                    try:
                        return int(setting.value) if isinstance(setting.value, str) else setting.value
                    except (ValueError, TypeError):
                        return setting.value
                return default
        except Exception as e:
            logger.error(f"Failed to get system setting {key}: {e}")
            return default

    def _get_active_count(self, job_id: int) -> int:
        """Get the number of currently running instances of a job."""
        return self.active_job_counts.get(job_id, 0)

    def _increment_active_count(self, job_id: int):
        """Increment the running instance count for a job."""
        self.active_job_counts[job_id] = self.active_job_counts.get(job_id, 0) + 1

    def _decrement_active_count(self, job_id: int):
        """Decrement the running instance count for a job."""
        if job_id in self.active_job_counts:
            self.active_job_counts[job_id] = max(0, self.active_job_counts[job_id] - 1)
            if self.active_job_counts[job_id] == 0:
                del self.active_job_counts[job_id]


    async def stop_job(self, job_id: int):
        if job_id in self.active_jobs:
            rclone_job_id = self.active_jobs[job_id]
            logger.info(f"Stopping job {job_id} (rclone id: {rclone_job_id})")
            try:
                await rclone_manager.call("job/stop", {"jobid": rclone_job_id})
            except Exception as e:
                logger.error(f"Failed to stop job {job_id}: {e}")
            # We don't remove from active_jobs here immediately, let the monitor loop detect failure/stop and clean up? 
            # Or remove it? Monitor loop might crash if we don't handle "job not found".
            # Actually rclone job/stop just requests stop. Monitor loop sees it finished.

            # Actually rclone job/stop just requests stop. Monitor loop sees it finished.

    async def _execute_actions(self, db_session, job: Job, trigger: str, context: dict):
        """Execute actions for a specific trigger."""
        try:
            # Fetch actions if not already loaded available
            # We fetch them freshly to ensure we have the Action object
            stmt = (
                select(JobAction)
                .where(JobAction.job_id == job.id, JobAction.trigger == trigger)
                .order_by(JobAction.order)
                .options(selectinload(JobAction.action))
            )
            result = await db_session.execute(stmt)
            job_actions = result.scalars().all()

            if not job_actions:
                return

            logger.info(f"Executing {len(job_actions)} {trigger} actions for job {job.id}")

            for ja in job_actions:
                if not ja.action:
                    continue
                
                try:
                    await self._process_action(ja.action, context)
                except Exception as e:
                    logger.error(f"Action {ja.action.name} (ID: {ja.action.id}) failed: {e}")
                    # TODO: Check if we should abort job on pre-run failure
                    # if trigger == 'pre' and ja.abort_on_error: raise e

        except Exception as e:
            logger.error(f"Failed to execute actions for trigger {trigger}: {e}")

    async def _process_action(self, action: Action, context: dict):
        """Process a single action."""
        logger.info(f"Running action: {action.name} ({action.type})")
        
        # Variable Substitution Helper
        def substitute(text: str) -> str:
            if not text or not isinstance(text, str): return text
            for key, value in context.items():
                # Handle nested keys e.g. job.name
                if isinstance(value, dict):
                    for subkey, subval in value.items():
                        text = text.replace(f"{{{{ {key}.{subkey} }}}}", str(subval))
                        text = text.replace(f"{{{{{key}.{subkey}}}}}", str(subval)) # handle no spaces
                else:
                    text = text.replace(f"{{{{ {key} }}}}", str(value))
                    text = text.replace(f"{{{{{key}}}}}", str(value))
            return text

        config = action.config
        
        if action.type == 'webhook':
            url = substitute(config.get('url'))
            method = config.get('method', 'POST')
            body = substitute(config.get('body', '{}'))
            headers = {'Content-Type': 'application/json', 'User-Agent': 'Grabarr/1.0'}
            
            async with httpx.AsyncClient() as client:
                resp = await client.request(method, url, content=body, headers=headers, timeout=10)
                resp.raise_for_status()
                
        elif action.type == 'command':
            # SECURITY: Command execution has been disabled due to command injection risks.
            # Use webhooks, Docker actions, or rclone actions instead.
            raise Exception("Command actions are disabled for security reasons. Use webhook, docker, or rclone actions instead.")

        elif action.type == 'delay':
            seconds = int(config.get('seconds', 60))
            logger.info(f"Action sleeping for {seconds}s")
            await asyncio.sleep(seconds)

        elif action.type == 'rclone':
            # Execute raw RC command
            cmd = substitute(config.get('command'))
            params_str = substitute(config.get('params', '{}'))
            params = json.loads(params_str)
            await rclone_manager.call(cmd, params)

        elif action.type == 'docker':
            from .docker_client import docker_client
            if not docker_client.is_available():
                raise Exception("Docker execution unavailable")

            container_ref = substitute(config.get('container_id'))
            docker_cmd = config.get('action', 'restart')
            
            try:
                # get() supports both ID and Name
                container = docker_client.client.containers.get(container_ref)
                
                logger.info(f"Executing docker {docker_cmd} on {container.name} ({container.id})")
                
                if docker_cmd == 'start':
                    container.start()
                elif docker_cmd == 'stop':
                    container.stop()
                elif docker_cmd == 'restart':
                    container.restart()
                else:
                    raise ValueError(f"Unknown docker action: {docker_cmd}")

            except Exception as e:
                # Catch docker.errors.NotFound etc
                raise Exception(f"Docker action failed: {str(e)}")

        # Notification logic can be added here later
        elif action.type == 'notification':
            # Basic webhook implementation for notification type if webhook_url is present
            webhook_url = substitute(config.get('webhook_url'))
            if webhook_url:
                message = substitute(config.get('message', 'Job Finished'))
                # Simple POST
                async with httpx.AsyncClient() as client:
                    await client.post(webhook_url, json={"content": message, "title": "Grabarr Notification"})

    async def run_job(self, job_id: int, execution_type: str = "manual"):
        """Run a job. execution_type can be: 'schedule', 'manual', or 'api'"""
        logger.info(f"Starting job {job_id} (execution_type: {execution_type})")
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Job).where(Job.id == job_id))
            job = result.scalars().first()
            
            if not job:
                logger.error(f"Job {job_id} not found")
                raise ValueError(f"Job {job_id} not found")

            # Check concurrency limits
            current_count = self._get_active_count(job_id)
            if not job.allow_concurrent_runs and current_count > 0:
                logger.info(f"Job {job_id} skipped: already running and concurrent runs disabled")
                return  # Silently skip, don't log as failure
            
            max_concurrent = job.max_concurrent_runs or 1
            if job.allow_concurrent_runs and current_count >= max_concurrent:
                logger.info(f"Job {job_id} skipped: max concurrent runs ({max_concurrent}) reached")
                return  # Silently skip

            # Check failure cooldown
            cooldown_seconds = await self._get_system_setting('failure_cooldown_seconds', 60)
            if job_id in self.last_failure_times:
                elapsed = (datetime.now(timezone.utc) - self.last_failure_times[job_id]).total_seconds()
                if elapsed < cooldown_seconds:
                    logger.info(f"Job {job_id} skipped: in failure cooldown ({cooldown_seconds - elapsed:.0f}s remaining)")
                    return  # Skip during cooldown

            # Fetch full objects with credentials to be safe
            stmt_source = select(Remote).where(Remote.id == job.source_remote_id)
            source = (await db.execute(stmt_source)).scalars().first()
            
            stmt_dest = select(Remote).where(Remote.id == job.dest_remote_id)
            dest = (await db.execute(stmt_dest)).scalars().first()
            
            if not source or not dest:
                 logger.error("Source or Dest remote not found")
                 await self._log_history(job_id, "failed", {"error": "Source or Dest remote not found"})
                 raise ValueError("Source or Dest remote not found")

            # Fetch credentials manually if lazy loading is not async friendly in this context
            source_cred = None
            if source.credential_id:
                source_cred = (await db.execute(select(Credential).where(Credential.id == source.credential_id))).scalars().first()

            dest_cred = None
            if dest.credential_id:
                dest_cred = (await db.execute(select(Credential).where(Credential.id == dest.credential_id))).scalars().first()

            try:
                src_fs = await self.get_fs_string(source, source_cred)
                dst_fs = await self.get_fs_string(dest, dest_cred)
            except Exception as e:
                await self._log_history(job_id, "failed", {"error": str(e)})
                raise e
            
            # Apply Job-specific Source Path
            if job.source_path:
                # Ensure clean join. src_fs usually ends in 'path' or ':' or '/'
                # rclone handles // fine usually, but let's be clean.
                src_fs = f"{src_fs.rstrip('/')}/{job.source_path.strip('/')}"
            
            # Apply Job-specific Dest Path
            if job.dest_path:
                dst_fs = f"{dst_fs.rstrip('/')}/{job.dest_path.strip('/')}"
            
            # Context for actions
            action_context = {
                "job": {
                    "id": job.id,
                    "name": job.name,
                    "operation": job.operation,
                    "source_path": job.source_path,
                    "dest_path": job.dest_path
                },
                "source": { "name": source.name, "type": source.type },
                "dest": { "name": dest.name, "type": dest.type }
            }

            # EXECUTE PRE-RUN ACTIONS
            await self._execute_actions(db, job, 'pre', action_context)

            # Handle copy_mode: 
            # 'contents' means add trailing slash to copy only contents (rclone default usually)
            # 'folder' means we want to copy the folder itself, so we append the folder name to destination
            if job.copy_mode == 'contents':
                src_fs = src_fs.rstrip('/') + '/'
            elif job.copy_mode == 'folder' and job.source_path:
                folder_name = job.source_path.strip('/').split('/')[-1]
                if folder_name:
                    dst_fs = f"{dst_fs.rstrip('/')}/{folder_name}"
            
            logger.info(f"Transferring from {src_fs} to {dst_fs} using {job.operation}")
            
            # Default performance settings from global config
            default_transfers = await self._get_system_setting('default_transfers', 16)
            default_checkers = await self._get_system_setting('default_checkers', 32)
            default_buffer_size = await self._get_system_setting('default_buffer_size', 128)
            default_multi_thread_streams = await self._get_system_setting('default_multi_thread_streams', 16)
            default_multi_thread_cutoff = await self._get_system_setting('default_multi_thread_cutoff', 10)
            
            # SFTP-specific performance settings (critical for gigabit speeds)
            sftp_chunk_size = await self._get_system_setting('sftp_chunk_size', 255)  # KB
            sftp_concurrency = await self._get_system_setting('sftp_concurrency', 64)

            # Map operation to rclone command
            # copy -> sync/copy, sync -> sync/sync, move -> sync/move
            cmd = f"sync/{job.operation}"
            
            params = {
                "srcFs": src_fs,
                "dstFs": dst_fs,
                "_async": True, # Run in background on rclone side
                "_config": {
                    "Transfers": default_transfers,
                    "Checkers": default_checkers,
                    "BufferSize": f"{default_buffer_size}M",
                    "MultiThreadStreams": default_multi_thread_streams,
                    "MultiThreadCutoff": f"{default_multi_thread_cutoff}M"
                }
            }
            
            # SFTP-specific tuning is now applied in get_fs_string via connection string params
            # (chunk_size, concurrency) - those options are backend-specific and must be in the FS string
            
            # Handle transfer method: proxy = disable server-side copy (force data through client)
            if job.transfer_method == 'proxy':
                params["_config"]["ServerSideAcrossConfigs"] = False
            
            # Apply checksum verification mode
            if job.use_checksum:
                if "_config" not in params:
                    params["_config"] = {}
                params["_config"]["CheckSum"] = True
            
            # Apply sequential transfer mode (one file at a time)
            if job.sequential_transfer:
                if "_config" not in params:
                    params["_config"] = {}
                params["_config"]["Transfers"] = 1
                params["_config"]["Checkers"] = 1
            
            # Apply metadata preservation
            if job.preserve_metadata:
                if "_config" not in params:
                    params["_config"] = {}
                params["_config"]["Metadata"] = True
            
            # Apply Excludes
            if job.excludes:
                # rclone rc expects filters in _filter parameter
                # Structure: { "ExcludeRule": ["pattern1", "pattern2"] }
                params["_filter"] = {
                    "ExcludeRule": job.excludes
                }
            
            debug_msg = f"Executing Rclone Command: {cmd}\nParams: {json.dumps(params, default=str)}\n"
            logger.info(debug_msg)

            # Pre-calculate total size for progress tracking
            try:
                # Use same exclusions for size calculation
                size_params = {
                    "fs": src_fs,
                    # operations/size doesn't take 'remote' in the same way for root, use fs
                }
                if job.excludes:
                    size_params["_filter"] = { "ExcludeRule": job.excludes }
                
                logger.info(f"Calculating total size for job {job_id}...")
                size_res = await rclone_manager.call("operations/size", size_params)
                if size_res and "bytes" in size_res:
                    self.job_totals[job_id] = size_res["bytes"]
                    logger.info(f"Total size for job {job_id}: {size_res['bytes']} bytes")
            except Exception as e:
                logger.error(f"Failed to calculate size: {e}")
                # Don't fail the job, just proceed without total size
                pass

            try:
                result = await rclone_manager.call(cmd, params)
                msg = f"Rclone job started: {result}\n"
                logger.info(msg)
                
                # Start monitoring task
                if 'jobid' in result:
                     self.active_jobs[job_id] = result['jobid']
                     
                     # Update job status to running in DB
                     job.last_status = 'running'
                     job.last_run = datetime.now(timezone.utc)
                     job.last_error = None
                     await db.commit()
                     
                     # Emit running event
                     await event_manager.publish(json.dumps({
                         "type": "job_update",
                         "job_id": job_id,
                         "status": "running"
                     }))
                     # Capture job snapshot for history
                     # Lookup schedule template name if schedule is a cron expression
                     schedule_name = "Manual"
                     schedule_id = None
                     if job.schedule:
                         # Try to find matching schedule template
                         schedule_result = await db.execute(
                             select(ScheduleTemplate).where(ScheduleTemplate.name == job.schedule)
                         )
                         schedule_template = schedule_result.scalars().first()
                         if schedule_template:
                             schedule_name = schedule_template.name
                             schedule_id = schedule_template.id
                         else:
                             # It's a raw cron, use as-is
                             schedule_name = job.schedule
                     
                     job_snapshot = {
                         "name": job.name,
                         "operation": job.operation,
                         "source_remote_id": job.source_remote_id,
                         "source_remote_name": source.name if source else "Unknown",
                         "dest_remote_id": job.dest_remote_id,
                         "dest_remote_name": dest.name if dest else "Unknown",
                         "source_path": job.source_path,
                         "dest_path": job.dest_path,
                         "transfer_method": job.transfer_method,
                         "copy_mode": job.copy_mode,
                         "excludes": job.excludes,
                         "schedule_name": schedule_name,
                         "schedule_id": schedule_id,
                         "allow_concurrent_runs": job.allow_concurrent_runs,
                         "max_concurrent_runs": job.max_concurrent_runs,
                         "use_checksum": job.use_checksum,
                         "sequential_transfer": job.sequential_transfer,
                         "preserve_metadata": job.preserve_metadata,
                         "execution_type": execution_type,
                     }


                     self.job_snapshots[job_id] = job_snapshot
                     self.job_start_times[job_id] = datetime.now(timezone.utc)
                     self._increment_active_count(job_id)
                     
                     asyncio.create_task(self._monitor_job(result['jobid'], job_id))

            except Exception as e:
                logger.error(f"Failed to start rclone job: {e}")
                await self._log_history(job_id, "failed", {"error": str(e)})
                raise e

    async def _log_history(self, db_job_id: int, status: str, details: dict, 
                           avg_speed: int = None, files_transferred: list = None, 
                           job_snapshot: dict = None, started_at: datetime = None,
                           completed_at: datetime = None):
        try:
            from .models import JobHistory
            async with AsyncSessionLocal() as db:
                 history = JobHistory(
                     job_id=db_job_id, 
                     status=status, 
                     details=details,
                     avg_speed=avg_speed,
                     files_transferred=files_transferred,
                     job_snapshot=job_snapshot,
                     started_at=started_at,
                     completed_at=completed_at or datetime.now(timezone.utc)
                 )
                 db.add(history)
                 await db.commit()
                 
                 # Prune old history entries
                 await self._prune_history(db_job_id)
        except Exception as e:
            logger.error(f"Failed to write job history: {e}")

    async def _prune_history(self, job_id: int = None):
        """Prune history entries based on max_history_entries setting."""
        try:
            max_entries = await self._get_system_setting('max_history_entries', 50)
            async with AsyncSessionLocal() as db:
                # Get count of entries
                count_result = await db.execute(
                    select(func.count(JobHistory.id))
                )
                total_count = count_result.scalar()
                
                if total_count > max_entries:
                    # Get IDs to delete (oldest entries beyond max)
                    entries_to_delete = total_count - max_entries
                    subquery = select(JobHistory.id).order_by(JobHistory.timestamp.asc()).limit(entries_to_delete)
                    result = await db.execute(subquery)
                    ids_to_delete = [row[0] for row in result.fetchall()]
                    
                    if ids_to_delete:
                        await db.execute(
                            delete(JobHistory).where(JobHistory.id.in_(ids_to_delete))
                        )
                        await db.commit()
                        logger.info(f"Pruned {len(ids_to_delete)} old history entries")
        except Exception as e:
            logger.error(f"Failed to prune history: {e}")

    async def _monitor_job(self, rclone_job_id: int, db_job_id: int):
        logger.info(f"Monitoring rclone job {rclone_job_id}")
        while True:
            try:
                # Poll job status
                status = await rclone_manager.call("job/status", {"jobid": rclone_job_id})
                if status['finished']:
                    # Cleanup tracking
                    if db_job_id in self.active_jobs:
                        del self.active_jobs[db_job_id]
                    if db_job_id in self.job_totals:
                        del self.job_totals[db_job_id]
                    
                    # Decrement active count
                    self._decrement_active_count(db_job_id)

                    final_status = "success" if status['success'] else "failed"
                    error_msg = status.get('error', '')
                    
                    # Track failure time for cooldown
                    if final_status == "failed":
                        self.last_failure_times[db_job_id] = datetime.now(timezone.utc)
                    elif db_job_id in self.last_failure_times:
                        # Clear failure on success
                        del self.last_failure_times[db_job_id]


                    
                    # Update job status in DB
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(select(Job).where(Job.id == db_job_id))
                        job = result.scalars().first()
                        if job:
                            job.last_status = final_status
                            job.last_error = error_msg if error_msg else None
                            await db.commit()
                    
                    # Get tracked transferred files
                    files_list = list(self.job_transferred_files.get(db_job_id, set()))
                    if db_job_id in self.job_transferred_files:
                        del self.job_transferred_files[db_job_id]
                    
                    # Get average speed from tracked final stats
                    final_stats = self.job_final_stats.get(db_job_id, {})
                    avg_speed = final_stats.get('speed', 0)
                    if not avg_speed and final_stats.get('bytes') and final_stats.get('elapsedTime'):
                        elapsed = final_stats.get('elapsedTime', 1)
                        if elapsed > 0:
                            avg_speed = int(final_stats.get('bytes', 0) / elapsed)
                    if db_job_id in self.job_final_stats:
                        del self.job_final_stats[db_job_id]
                    
                    # Get job snapshot
                    job_snapshot = self.job_snapshots.get(db_job_id)
                    if db_job_id in self.job_snapshots:
                        del self.job_snapshots[db_job_id]
                    # Get job start time
                    started_at = self.job_start_times.get(db_job_id)
                    if db_job_id in self.job_start_times:
                        del self.job_start_times[db_job_id]
                    
                    # Log to DB with new fields
                    await self._log_history(
                        db_job_id, 
                        final_status, 
                        status,
                        avg_speed=int(avg_speed) if avg_speed else None,
                        files_transferred=files_list if files_list else None,
                        job_snapshot=job_snapshot,
                        started_at=started_at,
                        completed_at=datetime.now(timezone.utc)
                    )
                    

                    
                    # ACTION CONTEXT UPDATE
                    action_context = {
                        "job": { "id": db_job_id }, # Partial context as we are in monitor loop
                        "stats": {
                            "status": final_status,
                            "error": error_msg,
                            "transferred_files": len(files_list) if files_list else 0,
                            "total_bytes": stats.get('totalBytes', 0) if stats else 0
                        }
                    }

                    # EXECUTE POST-RUN ACTIONS
                    # We need a fresh DB session for actions as we are in a loop
                    async with AsyncSessionLocal() as action_db:
                         # Re-fetch job to get actions
                         job_res = await action_db.execute(select(Job).where(Job.id == db_job_id))
                         job_obj = job_res.scalars().first()
                         if job_obj:
                             # Enrich context
                             action_context["job"]["name"] = job_obj.name
                             
                             # Always run 'post_always'
                             await self._execute_actions(action_db, job_obj, 'post_always', action_context)
                             
                             if final_status == "success":
                                 await self._execute_actions(action_db, job_obj, 'post_success', action_context)
                             else:
                                 await self._execute_actions(action_db, job_obj, 'post_fail', action_context)

                    await event_manager.publish(json.dumps({

                        "type": "job_update",
                        "job_id": db_job_id,
                        "status": final_status,
                        "error": error_msg
                    }))
                    break
                
                # Poll core/stats for this specific job's progress
                # Use rclone's auto-assigned group 'job/{rclone_job_id}' for per-job stats
                stats = await rclone_manager.call("core/stats", {"group": f"job/{rclone_job_id}"})
                
                # Send progress update (always send stats, even if no active transfers)
                if stats:
                     # Inject totalBytes if available and missing
                    if db_job_id in self.job_totals:
                        # If rclone doesn't report totalBytes or reports 0 (common in some modes), use our calc
                        if not stats.get('totalBytes'):
                             stats['totalBytes'] = self.job_totals[db_job_id]
                    
                    # Track transferred files (accumulate during job)
                    if db_job_id not in self.job_transferred_files:
                        self.job_transferred_files[db_job_id] = set()
                    
                    # Add files from 'transferring' array (currently active)
                    for t in stats.get('transferring', []):
                        if t.get('name'):
                            self.job_transferred_files[db_job_id].add(t['name'])
                    
                    # Add lastFile if present (just completed)
                    if stats.get('lastFile'):
                        self.job_transferred_files[db_job_id].add(stats['lastFile'])
                    
                    # Save stats for use at completion (includes speed, bytes, etc)
                    self.job_final_stats[db_job_id] = stats
                    
                    await event_manager.publish(json.dumps({
                        "type": "progress",
                        "job_id": db_job_id,
                        "stats": stats
                    }))
                
                await asyncio.sleep(0.5) # Poll every 0.5 seconds
            except Exception as e:
                logger.error(f"Error monitoring job {rclone_job_id}: {e}")
                break
        
        # Cleanup
        if db_job_id in self.active_jobs and self.active_jobs[db_job_id] == rclone_job_id:
            del self.active_jobs[db_job_id]

    async def _obscure(self, password: str) -> str:
        if not password:
            return ""
        try:
             res = await rclone_manager.call("core/obscure", {"clear": password})
             return res.get("obscured", "")
        except Exception as e:
             logger.error(f"Failed to obscure password: {e}")
             # Fallback? Or raise? 
             # If obscure fails, rclone won't work anyway.
             raise e

    async def get_fs_string(self, remote: Remote, credential: Credential = None) -> str:
        if remote.type == "local":
            return remote.config.get("path", "/") 
        elif remote.type == "s3":
            # Construct connection string for S3-compatible storage
            # :s3,provider=AWS,access_key_id=...,secret_access_key=...,endpoint=...,region=...:bucket
            
            provider = remote.config.get('provider', 'AWS')
            endpoint = remote.config.get('endpoint', '')
            region = remote.config.get('region', '')
            bucket = remote.config.get('bucket', '')
            
            params = [f"provider={provider}"]
            
            if credential:
                # Decrypt credential data
                data = decrypt_credential_data(credential.data)
                access = data.get('access_key_id', '')
                secret = data.get('secret_access_key', '')
                if access:
                    params.append(f"access_key_id='{access}'")
                if secret:
                    params.append(f"secret_access_key='{secret}'")
            else:
                params.append("env_auth=false")
            
            if endpoint:
                params.append(f"endpoint='{endpoint}'")
            
            if region:
                params.append(f"region='{region}'")
            
            # Force path style for non-AWS providers (MinIO, R2, etc.)
            if provider not in ['AWS']:
                params.append("force_path_style=true")
            
            return f":s3,{','.join(params)}:{bucket}"
        
        elif remote.type == "http":
            # HTTP uses 'url' config
            url = remote.config.get("url", "")
            if not url:
                raise ValueError("HTTP remote requires a URL")
            
            params = [f"url='{url}'"]
            
            # Default no_head to false to allow file size detection for multi-threading
            # Only enable if explicitly set to 'true'
            no_head = remote.config.get("no_head", "false")
            if no_head == "true":
                params.append("no_head='true'")
                
            return f":http,{','.join(params)}:"
        
        elif remote.type == "webdav":
            # WebDAV uses 'url' and optionally user/pass
            url = remote.config.get("url", "")
            vendor = remote.config.get("vendor", "other")
            if not url:
                raise ValueError("WebDAV remote requires a URL")
            
            params = [f"url='{url}'", f"vendor='{vendor}'"]
            
            if credential:
                cred_data = decrypt_credential_data(credential.data)
                user = cred_data.get("user", "") or cred_data.get("username", "")
                password = cred_data.get("password", "")
                
                if user:
                    params.append(f"user='{user}'")
                
                obs_pass = await self._obscure(password)
                if obs_pass:
                    params.append(f"pass='{obs_pass}'")

            return f":webdav,{','.join(params)}:"
        
        # Generic helper for connection strings (sftp, ftp, smb)
        params = []
        host = remote.config.get("host", "")
        params.append(f"host=\"{host}\"")
        
        # Port
        # standard ports: ftp 21, sftp 22, smb 445
        default_port = "21"
        if remote.type == "sftp": default_port = "22"
        if remote.type == "smb": default_port = "445"
        
        port = remote.config.get("port", default_port)
        params.append(f"port=\"{port}\"")

        # User/Pass
        if credential:
            # Decrypt credential data
            cred_data = decrypt_credential_data(credential.data)
            user = cred_data.get("user", "") or cred_data.get("username", "")
            password = cred_data.get("password", "")
            if user:
                 params.append(f"user=\"{user}\"")
            
            # Only append pass if we have one (obscured)
            obs_pass = await self._obscure(password)
            if obs_pass:
                 params.append(f"pass=\"{obs_pass}\"")
        
        # SFTP-specific performance tuning (these MUST be in the connection string)
        # These settings are critical for achieving gigabit speeds over SFTP
        if remote.type == "sftp":
            sftp_chunk_size = await self._get_system_setting('sftp_chunk_size', 255)  # KB
            sftp_concurrency = await self._get_system_setting('sftp_concurrency', 64)
            params.append(f"chunk_size=\"{sftp_chunk_size}k\"")
            params.append(f"concurrency=\"{sftp_concurrency}\"")
        

        # Construct Base
        # :type,params:
        base = f":{remote.type},{','.join(params)}:"
        
        # Append Path
        path = remote.config.get("path", "")
        if remote.type == "smb":
            share = remote.config.get("share", "").strip("/")
            path = remote.config.get("path", "").strip("/")
            # smb: share/path
            full_path = f"{share}/{path}" if path else share
            return f"{base}{full_path}"
        else:
            # sftp/ftp: path
            path = remote.config.get("path", "")
            if not path:
                path = "/"
            return f"{base}{path}"

        raise ValueError(f"Unsupported remote type: {remote.type}")

job_runner = JobRunner()
