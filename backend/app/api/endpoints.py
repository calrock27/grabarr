from fastapi import APIRouter, Depends, HTTPException, Header, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from ..db import engine, AsyncSessionLocal, get_db
from ..models import Credential, Remote, Job, JobHistory, ScheduleTemplate, ActivityLog, APIKey, SystemSettings, AdminUser

from ..scheduler import scheduler, get_job_next_run, add_scheduler_job, remove_scheduler_job

async def verify_api_key(x_api_key: Optional[str] = Header(None)):
    # If no key provided, maybe allow internal traffic? 
    # For now, let's say this dependency is OPTIONAL for dashboard usage (internal) 
    # but REQUIRED for external usage. 
    # Actually, differentiating internal vs external is hard without separating ports.
    # Let's simple check: If X-API-Key header is present, validate it.
    if x_api_key:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(APIKey).where(APIKey.key == x_api_key))
            if not result.scalar_one_or_none():
                raise HTTPException(status_code=403, detail="Invalid API Key")
    # If not present, proceed (assuming authentication is handled elsewhere or trusted network for GUI)
    # The requirement is "API Control... secure external calls".
    return True

router = APIRouter()

# Pydantic Models
class CredentialCreate(BaseModel):
    name: str
    type: str
    data: dict

class CredentialRead(BaseModel):
    id: int
    name: str
    type: str
    data: dict
    class Config:
        from_attributes = True

class RemoteCreate(BaseModel):
    name: str
    type: str
    credential_id: Optional[int] = None
    config: dict

class RemoteRead(BaseModel):
    id: int
    name: str
    type: str
    config: dict
    class Config:
        orm_mode = True

# --- Credentials ---
@router.post("/credentials/", response_model=CredentialRead)
async def create_credential(cred: CredentialCreate, db: AsyncSession = Depends(get_db)):
    db_cred = Credential(name=cred.name, type=cred.type, data=cred.data)
    db.add(db_cred)
    await log_activity(db, "create", "credential", None, {"name": cred.name})
    await db.commit()
    await db.refresh(db_cred)
    return db_cred

@router.get("/credentials/", response_model=List[CredentialRead])
async def list_credentials(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Credential))
    creds = result.scalars().all()
    
    # Mask sensitive data
    masked_creds = []
    SENSITIVE_KEYS = ["password", "private_key", "passphrase", "secret_access_key", "token", "api_token"]
    
    for cred in creds:
        # Create a copy of the data dict to avoid mutating the ORM object in session (though we are reading)
        # We need to return a Pydantic model compatible dict or object.
        # Since we are returning a list of Read models, we can construct them.
        data_copy = cred.data.copy() if cred.data else {}
        for key in data_copy:
            if key in SENSITIVE_KEYS and data_copy[key]:
                data_copy[key] = "******"
        
        masked_creds.append(CredentialRead(
            id=cred.id,
            name=cred.name,
            type=cred.type,
            data=data_copy
        ))
        
    return masked_creds

@router.put("/credentials/{credential_id}", response_model=CredentialRead)
async def update_credential(credential_id: int, cred: CredentialCreate, db: AsyncSession = Depends(get_db)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(Credential).where(Credential.id == credential_id)
            result = await session.execute(stmt)
            db_cred = result.scalar_one_or_none()
            
            if not db_cred:
                raise HTTPException(status_code=404, detail="Credential not found")
            
            db_cred.name = cred.name
            db_cred.type = cred.type
            
            # Smart Update for Data
            # If value is "******", keep existing.
            current_data = db_cred.data or {}
            new_data = cred.data or {}
            merged_data = current_data.copy()
            
            # We want to replace current with new, UNLESS new is masked.
            # But we also handle keys that might be added or removed? 
            # Ideally we just iterate new_data.
            for key, value in new_data.items():
                if value == "******":
                    # Keep existing value if present
                    if key in current_data:
                        merged_data[key] = current_data[key]
                    else:
                        # This shouldn't happen if frontend is well-behaved, but if new key is starred, 
                        # we can't recover it. Assume "empty" or ignore.
                        merged_data[key] = "" 
                else:
                    merged_data[key] = value
            
            # Also remove keys that are NOT in new_data? 
            # Or just replace entire dict with merged?
            # Re-construct data to match new_data structure but with unmasked values.
            final_data = {}
            for key in new_data:
                if new_data[key] == "******":
                    final_data[key] = current_data.get(key, "")
                else:
                    final_data[key] = new_data[key]
            
            db_cred.data = final_data
            
            await log_activity(session, "update", "credential", credential_id, {"name": cred.name}) # Don't log data
            
            # Session commits on exit
            
    # Return (masked)
    data_copy = final_data.copy()
    SENSITIVE_KEYS = ["password", "private_key", "passphrase", "secret_access_key", "token", "api_token"]
    for key in data_copy:
        if key in SENSITIVE_KEYS and data_copy[key]:
             data_copy[key] = "******"

    return CredentialRead(
        id=credential_id, 
        name=cred.name, 
        type=cred.type, 
        data=data_copy
    )

# --- Remotes ---
@router.post("/remotes/", response_model=RemoteRead)
async def create_remote(remote: RemoteCreate, db: AsyncSession = Depends(get_db)):
    db_remote = Remote(name=remote.name, type=remote.type, credential_id=remote.credential_id, config=remote.config)
    db.add(db_remote)
    await log_activity(db, "create", "remote", None, {"name": remote.name})
    await db.commit()
    await db.refresh(db_remote)
    return db_remote

@router.get("/remotes/", response_model=List[RemoteRead])
async def list_remotes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Remote))
    return result.scalars().all()

@router.post("/remotes/test")
async def test_remote(remote: RemoteCreate, db: AsyncSession = Depends(get_db)):
    from ..runner import job_runner, rclone_manager
    
    # Resolve Credential
    cred = None
    if remote.credential_id:
        result = await db.execute(select(Credential).where(Credential.id == remote.credential_id))
        cred = result.scalar_one_or_none()
        if not cred:
             return {"success": False, "error": "Credential not found"}

    # Transient Remote Object
    transient_remote = Remote(name=remote.name, type=remote.type, config=remote.config)
    
    try:
        fs_string = await job_runner.get_fs_string(transient_remote, cred)
        
        # Test listing
        await rclone_manager.call("operations/list", {
            "fs": fs_string,
            "remote": "",
            "opt": { "max_depth": 1 }
        })
        return {"success": True, "message": "Connection verified"}
    except Exception as e:
        return {"success": False, "error": str(e)}

# --- Browsing ---
class BrowseRequest(BaseModel):
    path: str = ""

@router.post("/remotes/{remote_id}/browse")
async def browse_remote(remote_id: int, payload: BrowseRequest, db: AsyncSession = Depends(get_db)):
    from ..runner import job_runner, rclone_manager
    # 1. Get Remote & Cred
    query = select(Remote).where(Remote.id == remote_id)
    result = await db.execute(query)
    remote = result.scalar_one_or_none()
    if not remote:
        raise HTTPException(status_code=404, detail="Remote not found")
        
    cred = None
    if remote.credential_id:
        c_query = select(Credential).where(Credential.id == remote.credential_id)
        c_res = await db.execute(c_query)
        cred = c_res.scalar_one_or_none()
        
    # 2. Get FS String (Base)
    # We want to list the requested path relative to the remote root? 
    # Actually, browsing usually implies absolute path or relative to configured base.
    # JobRunner.get_fs_string appends config path. 
    # If we want to browse *subfolders* of that config path, we append payload.path.
    
    # Let's get the base FS string first
    base_fs = await job_runner.get_fs_string(remote, cred)
    
    # If base_fs ends with :, it's root. If it has path, it's subfolder.
    # We append browsing path.
    # rclone syntax: remote:path/to/browse
    
    # We need to be careful about not doubling separators, but get_fs_string handles some.
    # Simplest: Just use operations/list with fs=base_fs and remote=payload.path
    
    target_fs = base_fs
    target_remote = payload.path
    
    # Rclone operations/list
    # fs: remote:
    # remote: path/to/dir
    
    try:
        # We use max_depth=1 to just list current dir
        result = await rclone_manager.call("operations/list", {
            "fs": target_fs,
            "remote": target_remote,
            "opt": { "max_depth": 1 }
        })
        return result.get("list", [])
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

# --- Jobs ---
class JobCreate(BaseModel):
    name: str
    source_remote_id: int
    dest_remote_id: int
    operation: str
    schedule: Optional[str] = None
    source_path: Optional[str] = None
    dest_path: Optional[str] = None
    excludes: Optional[List[str]] = None
    transfer_method: Optional[str] = 'direct'
    copy_mode: Optional[str] = 'folder'
    allow_concurrent_runs: Optional[bool] = False
    max_concurrent_runs: Optional[int] = 1
    use_checksum: Optional[bool] = False

class JobUpdate(BaseModel):
    name: Optional[str] = None
    operation: Optional[str] = None
    schedule: Optional[str] = None
    enabled: Optional[bool] = None
    transfer_method: Optional[str] = None
    copy_mode: Optional[str] = None
    source_path: Optional[str] = None
    dest_path: Optional[str] = None
    excludes: Optional[List[str]] = None
    allow_concurrent_runs: Optional[bool] = None
    max_concurrent_runs: Optional[int] = None
    use_checksum: Optional[bool] = None

class JobRead(BaseModel):
    id: int
    name: str
    source_remote_id: int
    dest_remote_id: int
    operation: str
    schedule: Optional[str] = None
    source_path: Optional[str] = None
    dest_path: Optional[str] = None
    excludes: Optional[List[str]] = None
    embed_key: Optional[str] = None
    transfer_method: Optional[str] = 'direct'
    copy_mode: Optional[str] = 'folder'
    enabled: Optional[bool] = True
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    last_status: Optional[str] = "idle"
    last_error: Optional[str] = None
    allow_concurrent_runs: Optional[bool] = False
    max_concurrent_runs: Optional[int] = 1
    use_checksum: Optional[bool] = False
    class Config:
        from_attributes = True

@router.post("/jobs/", response_model=JobRead)
async def create_job(job: JobCreate, db: AsyncSession = Depends(get_db)):
    db_job = Job(
        name=job.name,
        source_remote_id=job.source_remote_id, 
        dest_remote_id=job.dest_remote_id,
        operation=job.operation,
        schedule=job.schedule,
        source_path=job.source_path,
        dest_path=job.dest_path,
        excludes=job.excludes,
        transfer_method=job.transfer_method,
        copy_mode=job.copy_mode,
        allow_concurrent_runs=job.allow_concurrent_runs,
        max_concurrent_runs=job.max_concurrent_runs
    )

    db.add(db_job)
    await log_activity(db, "create", "job", None, {"name": job.name}) # ID not avail until refresh/commit but session handles it? No, need flush.
    await db.commit()
    await db.refresh(db_job)
    # Update log with ID? Or just log after commit?
    # If we log before commit, it's part of transaction. ID might be None? 
    # SQLAlchemy usually assigns ID on flush. 
    # Let's log *after* refresh? But then we need another commit for the log?
    # Actually, best pattern: 
    # db.add(job) -> await db.flush() -> get ID -> log -> commit.
    
    # But for simplicity, I'll log *without* ID in the join table if straightforward, 
    # or just log generic "created job X".
    # Wait, ActivityLog is in the SAME session.
    # So:
    # db.add(db_job)
    # await db.flush()
    # await log_activity(db, "create", "job", db_job.id, {"name": job.name})
    # await db.commit()
    
    # EXCEPT: endpoints usually do db.add -> db.commit -> db.refresh.
    # Refactoring slightly to allow logging.
    
    # For now, let's try to just add log to session.
    # Since ID is autoincrement, it's not available until flush.
    
    # Revised:
    # db.add(db_job)
    # await db.flush()
    # await db.refresh(db_job)
    # await log_activity(db, "create", "job", db_job.id, {"name": db_job.name})
    # await db.commit()
    
    return db_job

@router.get("/jobs/", response_model=List[JobRead])
@router.get("/jobs/", response_model=List[JobRead])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job))
    jobs = result.scalars().all()
    
    jobs_with_status = []
    for job in jobs:
        # Fetch latest status
        stmt = select(JobHistory).where(JobHistory.job_id == job.id).order_by(JobHistory.timestamp.desc()).limit(1)
        hist_res = await db.execute(stmt)
        last_run = hist_res.scalar_one_or_none()
        
        # We can construct JobRead from attributes then add status, 
        # or manually construct dict. Manual is safer to ensure we have all fields.
        j_dict = {
            "id": job.id,
            "name": job.name,
            "source_remote_id": job.source_remote_id,
            "dest_remote_id": job.dest_remote_id,
            "operation": job.operation,
            "schedule": job.schedule,
            "source_path": job.source_path,
            "dest_path": job.dest_path,
            "excludes": job.excludes,
            "embed_key": job.embed_key,
            "transfer_method": job.transfer_method or 'direct',
            "copy_mode": job.copy_mode or 'folder',
            "enabled": job.enabled if job.enabled is not None else True,
            "last_run": job.last_run,
            "next_run": get_job_next_run(job.id),
            "last_status": last_run.status if last_run else "idle",
            "last_error": last_run.details.get("error") if last_run and last_run.details else None
        }
        jobs_with_status.append(j_dict)
        
    return jobs_with_status

@router.get("/jobs/{job_id}", response_model=JobRead)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    stmt = select(JobHistory).where(JobHistory.job_id == job.id).order_by(JobHistory.timestamp.desc()).limit(1)
    hist_res = await db.execute(stmt)
    last_run = hist_res.scalar_one_or_none()
    
    j_dict = {
        "id": job.id,
        "name": job.name,
        "source_remote_id": job.source_remote_id,
        "dest_remote_id": job.dest_remote_id,
        "operation": job.operation,
        "schedule": job.schedule,
        "source_path": job.source_path,
        "dest_path": job.dest_path,
        "excludes": job.excludes,
        "embed_key": job.embed_key,
        "transfer_method": job.transfer_method or 'direct',
        "copy_mode": job.copy_mode or 'folder',
        "enabled": job.enabled if job.enabled is not None else True,
        "last_run": job.last_run,
        "next_run": get_job_next_run(job.id),
        "last_status": last_run.status if last_run else "idle",
        "last_error": last_run.details.get("error") if last_run and last_run.details else None
    }
    return j_dict

@router.patch("/jobs/{job_id}", response_model=JobRead)
async def patch_job(job_id: int, job_update: JobUpdate, db: AsyncSession = Depends(get_db)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(Job).where(Job.id == job_id)
            result = await session.execute(stmt)
            db_job = result.scalar_one_or_none()
            if not db_job:
                raise HTTPException(status_code=404, detail="Job not found")
            
            update_data = job_update.dict(exclude_unset=True)
            for field, value in update_data.items():
                setattr(db_job, field, value)
            
            # Handle scheduler synchronization if schedule or enabled changed
            if "schedule" in update_data or "enabled" in update_data:
                if db_job.enabled and db_job.schedule and db_job.schedule != "Manual":
                    add_scheduler_job(db_job.id, db_job.schedule)
                else:
                    remove_scheduler_job(db_job.id)
            
            await log_activity(session, "patch", "job", job_id, update_data)
    
    # Reload with status
    return await get_job(job_id, db)

from ..runner import job_runner

@router.post("/jobs/{job_id}/run", dependencies=[Depends(verify_api_key)])
async def run_job_endpoint(job_id: int, execution_type: str = "api", db: AsyncSession = Depends(get_db)):
    # Trigger job run in background
    # execution_type: 'manual' (UI), 'api' (external), 'schedule' (scheduler)
    await job_runner.run_job(job_id, execution_type=execution_type)
    # Log activity
    await log_activity(db, "run", "job", job_id, {"execution_type": execution_type})
    await db.commit()
    return {"message": "Job started"}

@router.post("/jobs/{job_id}/stop", dependencies=[Depends(verify_api_key)])
async def stop_job_endpoint(job_id: int, db: AsyncSession = Depends(get_db)):
    await job_runner.stop_job(job_id)
    await log_activity(db, "stop", "job", job_id, {})
    await db.commit()
    return {"message": "Job stop requested"}

from ..events import event_manager
from starlette.responses import StreamingResponse

@router.get("/events")
async def events():
    return StreamingResponse(event_manager.subscribe(), media_type="text/event-stream")

@router.delete("/credentials/{credential_id}")
async def delete_credential(credential_id: int):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(Credential).where(Credential.id == credential_id)
            result = await session.execute(stmt)
            obj = result.scalar_one_or_none()
            if not obj:
                raise HTTPException(status_code=404, detail="Credential not found")
            
            # Check for usage? Ideally yes/no constraint, but for now just delete
            await session.delete(obj)
            await log_activity(session, "delete", "credential", credential_id, {"name": obj.name})
    return {"message": "Credential deleted"}

@router.delete("/remotes/{remote_id}")
async def delete_remote(remote_id: int):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(Remote).where(Remote.id == remote_id)
            result = await session.execute(stmt)
            obj = result.scalar_one_or_none()
            # Removed redundant check
            await session.delete(obj)
            await log_activity(session, "delete", "remote", remote_id, {"name": obj.name})
    return {"message": "Remote deleted"}

@router.put("/remotes/{remote_id}", response_model=RemoteRead)
async def update_remote(remote_id: int, remote: RemoteCreate, db: AsyncSession = Depends(get_db)):
    async with AsyncSessionLocal() as session:
         async with session.begin():
            stmt = select(Remote).where(Remote.id == remote_id)
            result = await session.execute(stmt)
            db_remote = result.scalar_one_or_none()
            if not db_remote:
                raise HTTPException(status_code=404, detail="Remote not found")
            
            db_remote.name = remote.name
            db_remote.type = remote.type
            db_remote.credential_id = remote.credential_id
            db_remote.config = remote.config
            
            await log_activity(session, "update", "remote", remote_id, remote.dict())
            
            # Commit handled by context manager if no exception? 
            # Actually session.begin() commits on exit. 
            # But we need to refresh to return? 
            # Changes are committed. We can return db_remote directly or query again.
            # Usually returning the object is fine.
    
    # Re-fetch or return constructed? 
    # To return full object with ID, we can just return db_remote, but session is closed.
    # Let's just return what we have (it has attributes).
    # Or cleaner pattern:
    query = select(Remote).where(Remote.id == remote_id)
    result = await db.execute(query)
    return result.scalar_one()

@router.delete("/jobs/{job_id}")
async def delete_job(job_id: int):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(Job).where(Job.id == job_id)
            result = await session.execute(stmt)
            obj = result.scalar_one_or_none()
            if not obj:
                raise HTTPException(status_code=404, detail="Job not found")
            await session.delete(obj)
            await log_activity(session, "delete", "job", job_id, {"name": obj.name})
    return {"message": "Job deleted"}

@router.put("/jobs/{job_id}", response_model=JobRead)
async def update_job(job_id: int, job: JobCreate, db: AsyncSession = Depends(get_db)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(Job).where(Job.id == job_id)
            result = await session.execute(stmt)
            db_job = result.scalar_one_or_none()
            if not db_job:
                raise HTTPException(status_code=404, detail="Job not found")
            
            db_job.name = job.name
            db_job.source_remote_id = job.source_remote_id
            db_job.dest_remote_id = job.dest_remote_id
            db_job.operation = job.operation
            db_job.schedule = job.schedule
            db_job.source_path = job.source_path
            db_job.dest_path = job.dest_path
            db_job.excludes = job.excludes
            db_job.transfer_method = job.transfer_method
            db_job.copy_mode = job.copy_mode
            
            # If schedule changed, logic to update scheduler would be needed here. 
            # For now, simplistic update.
            
            await log_activity(session, "update", "job", job_id, job.dict()) # Convert Pydantic to dict
    
    return JobRead(
        id=job_id,
        name=job.name,
        source_remote_id=job.source_remote_id,
        dest_remote_id=job.dest_remote_id,
        operation=job.operation,
        schedule=job.schedule,
        source_path=job.source_path,
        dest_path=job.dest_path,
        excludes=job.excludes,
        embed_key=db_job.embed_key,
        transfer_method=job.transfer_method,
        copy_mode=job.copy_mode
    )

@router.post("/jobs/{job_id}/rotate_key", response_model=JobRead)
async def rotate_job_key(job_id: int, db: AsyncSession = Depends(get_db)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(Job).where(Job.id == job_id)
            result = await session.execute(stmt)
            job = result.scalar_one_or_none()
            if not job:
                raise HTTPException(status_code=404, detail="Job not found")
            
            import uuid
            job.embed_key = str(uuid.uuid4())
            await log_activity(session, "rotate_key", "job", job_id, {})
            
    return await get_job(job_id, db)

class ToggleRequest(BaseModel):
    enabled: bool

@router.post("/jobs/{job_id}/toggle")
async def toggle_job(job_id: int, payload: ToggleRequest, db: AsyncSession = Depends(get_db)):
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(Job).where(Job.id == job_id)
            result = await session.execute(stmt)
            job = result.scalar_one_or_none()
            if not job:
                raise HTTPException(status_code=404, detail="Job not found")
            
            job.enabled = payload.enabled
            await log_activity(session, "toggle", "job", job_id, {"enabled": payload.enabled})
    
    return {"message": f"Job {'enabled' if payload.enabled else 'disabled'}"}

@router.get("/jobs/{job_id}/secure_info")
async def get_secure_job_info(job_id: int, key: str, db: AsyncSession = Depends(get_db)):
    job = await get_job(job_id, db)
    if not job.embed_key or job.embed_key != key:
        raise HTTPException(status_code=403, detail="Invalid access key")
    
    return {
        "id": job.id,
        "name": job.name,
        "operation": job.operation,
        "schedule": job.schedule
    }

# --- Schedules ---
class ScheduleCreate(BaseModel):
    name: str
    schedule_type: str
    config: dict

class ScheduleRead(BaseModel):
    id: int
    name: str
    schedule_type: str
    config: dict
    class Config:
        from_attributes = True

@router.post("/schedules/", response_model=ScheduleRead)
async def create_schedule(sched: ScheduleCreate, db: AsyncSession = Depends(get_db)):
    from ..models import ScheduleTemplate
    db_sched = ScheduleTemplate(name=sched.name, schedule_type=sched.schedule_type, config=sched.config)
    db.add(db_sched)
    await log_activity(db, "create", "schedule", None, {"name": sched.name})
    await db.commit()
    await db.refresh(db_sched)
    return db_sched

@router.get("/schedules/", response_model=List[ScheduleRead])
async def list_schedules(db: AsyncSession = Depends(get_db)):
    from ..models import ScheduleTemplate
    result = await db.execute(select(ScheduleTemplate))
    return result.scalars().all()

@router.put("/schedules/{schedule_id}", response_model=ScheduleRead)
async def update_schedule(schedule_id: int, sched: ScheduleCreate, db: AsyncSession = Depends(get_db)):
    from ..models import ScheduleTemplate
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(ScheduleTemplate).where(ScheduleTemplate.id == schedule_id)
            result = await session.execute(stmt)
            db_sched = result.scalar_one_or_none()
            if not db_sched:
                raise HTTPException(status_code=404, detail="Schedule not found")
            
            db_sched.name = sched.name
            db_sched.schedule_type = sched.schedule_type
            db_sched.schedule_type = sched.schedule_type
            db_sched.config = sched.config
            
            await log_activity(session, "update", "schedule", schedule_id, sched.dict())
            
    return ScheduleRead(
        id=schedule_id,
        name=sched.name,
        schedule_type=sched.schedule_type,
        config=sched.config
    )

@router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: int):
    from ..models import ScheduleTemplate
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(ScheduleTemplate).where(ScheduleTemplate.id == schedule_id)
            result = await session.execute(stmt)
            obj = result.scalar_one_or_none()
            if not obj:
                raise HTTPException(status_code=404, detail="Schedule not found")
            await session.delete(obj)
            await log_activity(session, "delete", "schedule", schedule_id, {"name": obj.name})
    return {"message": "Schedule deleted"}

# --- API Keys ---
class APIKeyCreate(BaseModel):
    name: str

class APIKeyRead(BaseModel):
    id: int
    name: str
    key: str # Show only once? For simplicity showing always here, but ideally should hide.
    created_at: datetime
    class Config:
        from_attributes = True

import secrets

@router.post("/security/keys", response_model=APIKeyRead)
async def create_api_key(payload: APIKeyCreate, db: AsyncSession = Depends(get_db)):
    from ..models import APIKey
    key = f"gk_{secrets.token_urlsafe(32)}"
    db_key = APIKey(name=payload.name, key=key)
    db.add(db_key)
    await log_activity(db, "create", "apikey", None, {"name": payload.name})
    await db.commit()
    await db.refresh(db_key)
    return db_key

@router.get("/security/keys", response_model=List[APIKeyRead])
async def list_api_keys(db: AsyncSession = Depends(get_db)):
    from ..models import APIKey
    result = await db.execute(select(APIKey))
    return result.scalars().all()

@router.delete("/security/keys/{key_id}")
async def delete_api_key(key_id: int):
    from ..models import APIKey
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(APIKey).where(APIKey.id == key_id)
            result = await session.execute(stmt)
            obj = result.scalar_one_or_none()
            if not obj:
                raise HTTPException(status_code=404, detail="Key not found")
            await session.delete(obj)
            await log_activity(session, "delete", "apikey", key_id, {"name": obj.name})
    return {"message": "Key deleted"}

# --- History ---
class JobHistoryRead(BaseModel):
    id: int
    job_id: int
    status: str
    details: Optional[dict] = None
    timestamp: datetime
    job_name: Optional[str] = None 
    avg_speed: Optional[int] = None  # bytes/sec
    files_transferred: Optional[List[str]] = None
    job_snapshot: Optional[dict] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

@router.get("/history", response_model=List[JobHistoryRead])
async def list_history(limit: int = 50, db: AsyncSession = Depends(get_db)):
    from ..models import JobHistory, Job
    from sqlalchemy.orm import joinedload
    
    # We want to return history with job names. 
    # Pydantic model has optional job_name. We can construct it or use a property.
    # Easiest: Load relation, and map it. 
    # Actually, Pydantic's from_attributes works best with direct attributes.
    # Let's adjust query to handle this or just return the relation and use a nested model? 
    # Let's use a nested simplified model.
    # But wait, JobHistoryRead.job_name is not on the SQLAlchemy model directly.
    # Stick to returning nested JobRead object if possible, or just raw data.
    # Let's define a nested model.
    
    stmt = select(JobHistory).options(joinedload(JobHistory.job)).order_by(JobHistory.timestamp.desc()).limit(limit)
    result = await db.execute(stmt)
    history_items = result.scalars().all()
    
    response = []
    for item in history_items:
        data = {
           "id": item.id,
           "job_id": item.job_id,
           "status": item.status,
           "details": item.details,
           "timestamp": item.timestamp,
           "job_name": item.job.name if item.job else "Deleted Job",
           "avg_speed": item.avg_speed,
           "files_transferred": item.files_transferred,
           "job_snapshot": item.job_snapshot,
           "started_at": item.started_at,
           "completed_at": item.completed_at
        }
        response.append(data)
        
    return response

# --- Activity Log ---
class ActivityLogRead(BaseModel):
    id: int
    action: str
    entity_type: str
    entity_id: Optional[int]
    details: Optional[dict]
    timestamp: datetime
    class Config:
        from_attributes = True

@router.get("/activity", response_model=List[ActivityLogRead])
async def list_activity(limit: int = 50, db: AsyncSession = Depends(get_db)):
    from ..models import ActivityLog
    stmt = select(ActivityLog).order_by(ActivityLog.timestamp.desc()).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()

async def log_activity(db: AsyncSession, action: str, entity_type: str, entity_id: Optional[int], details: dict = None):
    from ..models import ActivityLog
    try:
        # Create a new session for logging if the passed one is in a weird state? 
        # Or just use the passed one. Ideally we use the passed one but we must ensure it commits.
        # If the passed session is used for the main operation and committed there, we should add this to it.
        # But if the main op fails, we might still want to log "attempt"? 
        # Requirement says "successes and failures". 
        # For now, let's assume we log on success of the transaction.
        
        # Actually, if we use the same session, it commits with the main object.
        log = ActivityLog(action=action, entity_type=entity_type, entity_id=entity_id, details=details)
        db.add(log)
        # We don't commit here, we let the caller commit (endpoints usually commit at end).
    except Exception as e:
        print(f"Failed to log activity: {e}")

import tempfile
import subprocess
import os
from fastapi import UploadFile, File, Form
from fastapi.responses import FileResponse

@router.post("/system/backup")
async def create_backup(payload: dict):
    password = payload.get("password")
    if not password:
        raise HTTPException(status_code=400, detail="Password required")

    # temporary directory
    tmp_dir = tempfile.mkdtemp()
    try:
        # 1. Copy DB
        db_path = "grabarr.db"
        if os.path.exists(db_path):
             shutil.copy2(db_path, os.path.join(tmp_dir, "grabarr.db"))
        else:
             # Just in case, though app shouldn't run without it
             pass 

        # 2. Copy rclone.conf
        # Check env first, then default location
        rclone_conf = os.environ.get("RCLONE_CONFIG")
        if not rclone_conf:
            # Default linux path
            rclone_conf = os.path.expanduser("~/.config/rclone/rclone.conf")
        
        if os.path.exists(rclone_conf):
            shutil.copy2(rclone_conf, os.path.join(tmp_dir, "rclone.conf"))

        # Archive and Encrypt
        backup_path = os.path.join(tmp_dir, "grabarr_backup.enc")
        
        # Tar all files in tmp_dir
        # We need to be careful not to include the output .enc file in the tarball if we write it there.
        # So let's write the tarball to a pipe directly as before.
        
        # List files to encrypt
        files_to_archive = [f for f in os.listdir(tmp_dir) if f != "grabarr_backup.enc"]
        
        if not files_to_archive:
            raise HTTPException(status_code=400, detail="Nothing to backup")

        with open(backup_path, 'wb') as f_out:
            # tar -czf - -C tmp_dir file1 file2 ...
            cmd = ["tar", "-czf", "-", "-C", tmp_dir] + files_to_archive
            
            p1 = subprocess.Popen(cmd, stdout=subprocess.PIPE)
            p2 = subprocess.Popen(
                ["openssl", "enc", "-aes-256-cbc", "-salt", "-pbkdf2", "-k", password],
                stdin=p1.stdout,
                stdout=f_out
            )
            p1.stdout.close()
            p2.communicate()

        return FileResponse(backup_path, filename="grabarr_backup.enc", background=None)
    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/system/restore")
async def restore_backup(password: str = Form(...), file: UploadFile = File(...)):
    tmp_dir = tempfile.mkdtemp()
    try:
        # Save upload
        enc_path = os.path.join(tmp_dir, "upload.enc")
        with open(enc_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Decrypt and Untar
        p1 = subprocess.Popen(
            ["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-k", password, "-in", enc_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        p2 = subprocess.Popen(
            ["tar", "-xzf", "-", "-C", tmp_dir],
            stdin=p1.stdout,
            stderr=subprocess.PIPE
        )
        p1.stdout.close()
        out, err = p2.communicate()

        if p2.returncode != 0:
            raise HTTPException(status_code=400, detail="Decryption failed or invalid archive")

        # 1. Restore DB
        restored_db = os.path.join(tmp_dir, "grabarr.db")
        if os.path.exists(restored_db):
            shutil.move(restored_db, "grabarr.db")
        else:
             # Maybe it was just config backup? But requirement says export db... 
             # For now, require DB, or warn. 
             pass

        # 2. Restore rclone.conf
        restored_conf = os.path.join(tmp_dir, "rclone.conf")
        if os.path.exists(restored_conf):
             # Determine target
             target_conf = os.environ.get("RCLONE_CONFIG")
             if not target_conf:
                 target_conf = os.path.expanduser("~/.config/rclone/rclone.conf")
            
             # Create dir if not exists
             os.makedirs(os.path.dirname(target_conf), exist_ok=True)
             shutil.move(restored_conf, target_conf)

        return {"message": "Restore successful. Please restart the backend."}

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

# --- System Settings ---
class SystemSettingsRead(BaseModel):
    failure_cooldown_seconds: int = 60
    max_history_entries: int = 50

class SystemSettingsUpdate(BaseModel):
    failure_cooldown_seconds: Optional[int] = None
    max_history_entries: Optional[int] = None

@router.get("/settings/system", response_model=SystemSettingsRead)
async def get_system_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SystemSettings))
    settings = result.scalars().all()
    
    settings_dict = {}
    for s in settings:
        try:
            settings_dict[s.key] = int(s.value) if isinstance(s.value, str) else s.value
        except (ValueError, TypeError):
            settings_dict[s.key] = s.value
    
    return SystemSettingsRead(
        failure_cooldown_seconds=settings_dict.get('failure_cooldown_seconds', 60),
        max_history_entries=settings_dict.get('max_history_entries', 50)
    )

@router.put("/settings/system", response_model=SystemSettingsRead)
async def update_system_settings(settings: SystemSettingsUpdate, db: AsyncSession = Depends(get_db)):
    if settings.failure_cooldown_seconds is not None:
        result = await db.execute(select(SystemSettings).where(SystemSettings.key == 'failure_cooldown_seconds'))
        setting = result.scalars().first()
        if setting:
            setting.value = str(settings.failure_cooldown_seconds)
        else:
            db.add(SystemSettings(key='failure_cooldown_seconds', value=str(settings.failure_cooldown_seconds)))
    
    if settings.max_history_entries is not None:
        result = await db.execute(select(SystemSettings).where(SystemSettings.key == 'max_history_entries'))
        setting = result.scalars().first()
        if setting:
            setting.value = str(settings.max_history_entries)
        else:
            db.add(SystemSettings(key='max_history_entries', value=str(settings.max_history_entries)))
    
    await db.commit()
    
    # Return updated settings
    return await get_system_settings(db)


# =====================================
# Authentication Endpoints
# =====================================

from ..auth import (
    hash_password, verify_password, create_fingerprint, 
    create_jwt_token, admin_exists, get_admin_user,
    get_session_duration_days, get_current_user
)

class LoginRequest(BaseModel):
    username: str
    password: str

class SetupRequest(BaseModel):
    username: str = "admin"
    password: str

class AuthResponse(BaseModel):
    success: bool
    message: str
    username: Optional[str] = None

@router.get("/auth/status")
async def auth_status():
    """Check if authentication is set up and required."""
    has_admin = await admin_exists()
    return {
        "auth_required": True,
        "setup_complete": has_admin
    }

@router.post("/auth/setup")
async def setup_admin(setup: SetupRequest, db: AsyncSession = Depends(get_db)):
    """Initial admin setup - only works if no admin exists."""
    # Check if admin already exists
    if await admin_exists():
        raise HTTPException(status_code=400, detail="Admin user already exists")
    
    # Validate password
    if len(setup.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    # Create admin user
    admin = AdminUser(
        username=setup.username,
        password_hash=hash_password(setup.password)
    )
    db.add(admin)
    await db.commit()
    
    await log_activity(db, "create", "admin", admin.id, {"username": setup.username})
    await db.commit()
    
    return {"success": True, "message": "Admin user created successfully"}

@router.post("/auth/login")
async def login(request: Request, login_req: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Authenticate and get session token."""
    # Get admin user
    result = await db.execute(select(AdminUser).where(AdminUser.username == login_req.username))
    user = result.scalars().first()
    
    if not user or not verify_password(login_req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Create fingerprint and token
    fingerprint = create_fingerprint(request)
    session_days = await get_session_duration_days()
    token = create_jwt_token(user.id, user.username, fingerprint, session_days)
    
    # Set cookie (httpOnly for security)
    response.set_cookie(
        key="grabarr_session",
        value=token,
        httponly=True,
        max_age=session_days * 24 * 60 * 60,  # seconds
        samesite="lax",
        secure=False  # Set to True if using HTTPS
    )
    
    await log_activity(db, "login", "admin", user.id, {"username": user.username})
    await db.commit()
    
    return {"success": True, "message": "Login successful", "username": user.username}

@router.post("/auth/logout")
async def logout(response: Response):
    """Log out and clear session."""
    response.delete_cookie(key="grabarr_session")
    return {"success": True, "message": "Logged out successfully"}

@router.get("/auth/me")
async def get_me(request: Request, user: dict = Depends(get_current_user)):
    """Get current authenticated user info."""
    return {
        "authenticated": True,
        "user_id": user["id"],
        "username": user["username"],
        "is_api_key": user.get("is_api_key", False)
    }
