from fastapi import APIRouter, Depends, HTTPException, Header, Response, Request, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from sqlalchemy import delete
from ..db import engine, AsyncSessionLocal, get_db, get_database_path
from ..models import Credential, Remote, Job, JobHistory, ScheduleTemplate, ActivityLog, APIKey, SystemSettings, AdminUser, Action, JobAction, EmbedWidget
from ..crypto import encrypt_credential_data, decrypt_credential_data, get_key_file_path
from ..list_params import apply_list_params

from ..scheduler import scheduler, get_job_next_run, add_scheduler_job, remove_scheduler_job
from ..auth import get_current_user

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

# SECURITY: All routes require authentication by default
# Public routes are explicitly excluded using separate routers
router = APIRouter(dependencies=[Depends(get_current_user)])

# Public router for unauthenticated routes (auth, embed widgets public view)
public_router = APIRouter()

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
    credential_id: Optional[int] = None
    config: dict
    class Config:
        orm_mode = True

# --- Credentials ---
@router.post("/credentials", response_model=CredentialRead)
async def create_credential(cred: CredentialCreate, db: AsyncSession = Depends(get_db)):
    # Encrypt credential data before storing
    encrypted_data = encrypt_credential_data(cred.data)
    db_cred = Credential(name=cred.name, type=cred.type, data=encrypted_data)
    db.add(db_cred)
    await log_activity(db, "create", "credential", None, {"name": cred.name})
    await db.commit()
    await db.refresh(db_cred)
    return CredentialRead(id=db_cred.id, name=db_cred.name, type=db_cred.type, data={})

@router.get("/credentials", response_model=List[CredentialRead])
async def list_credentials(
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = "asc",
    db: AsyncSession = Depends(get_db)
):
    query = select(Credential)
    query = apply_list_params(query, Credential, search, sort_by, sort_order, ["name", "type"])
    result = await db.execute(query)
    creds = result.scalars().all()
    
    # Mask sensitive data
    masked_creds = []
    SENSITIVE_KEYS = ["password", "private_key", "passphrase", "secret_access_key", "token", "api_token"]
    
    for cred in creds:
        # Decrypt credential data
        decrypted_data = decrypt_credential_data(cred.data)
        data_copy = decrypted_data.copy() if decrypted_data else {}
        
        # Mask sensitive fields
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
            
            # Decrypt existing data for comparison
            current_data = decrypt_credential_data(db_cred.data)
            new_data = cred.data or {}
            
            # Smart Update for Data - If value is "******", keep existing.
            final_data = {}
            for key in new_data:
                if new_data[key] == "******":
                    # Keep existing value if present
                    final_data[key] = current_data.get(key, "")
                else:
                    final_data[key] = new_data[key]
            
            # Encrypt and store
            db_cred.data = encrypt_credential_data(final_data)
            
            await log_activity(session, "update", "credential", credential_id, {"name": cred.name})
            
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
@router.post("/remotes", response_model=RemoteRead)
async def create_remote(remote: RemoteCreate, db: AsyncSession = Depends(get_db)):
    db_remote = Remote(name=remote.name, type=remote.type, credential_id=remote.credential_id, config=remote.config)
    db.add(db_remote)
    await log_activity(db, "create", "remote", None, {"name": remote.name})
    await db.commit()
    await db.refresh(db_remote)
    return db_remote

@router.get("/remotes", response_model=List[RemoteRead])
async def list_remotes(
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = "asc",
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import or_, cast, String
    from sqlalchemy.orm import joinedload
    
    query = select(Remote).options(joinedload(Remote.credential))
    
    # Comprehensive search across all visible columns
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Remote.name.ilike(search_term),
                Remote.type.ilike(search_term),
                # Search host, endpoint, provider, bucket from config JSON
                cast(Remote.config, String).ilike(search_term),
                # Search credential name via relationship
                Remote.credential.has(Credential.name.ilike(search_term))
            )
        )
    
    # Apply sorting only
    query = apply_list_params(query, Remote, None, sort_by, sort_order, [])
    result = await db.execute(query)
    return result.scalars().unique().all()

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

@router.post("/remotes/{remote_id}/test")
async def test_remote_by_id(remote_id: int, db: AsyncSession = Depends(get_db)):
    """Test an existing saved remote by its ID."""
    from ..runner import job_runner, rclone_manager
    
    # Get the remote
    result = await db.execute(select(Remote).where(Remote.id == remote_id))
    remote = result.scalar_one_or_none()
    if not remote:
        raise HTTPException(status_code=404, detail="Remote not found")
    
    # Get associated credential if any
    cred = None
    if remote.credential_id:
        cred_result = await db.execute(select(Credential).where(Credential.id == remote.credential_id))
        cred = cred_result.scalar_one_or_none()
    
    try:
        fs_string = await job_runner.get_fs_string(remote, cred)
        
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
    session_id: Optional[str] = None  # Optional session for connection pooling

class BrowseSessionStartRequest(BaseModel):
    remote_id: int

class BrowseSessionResponse(BaseModel):
    session_id: str
    remote_id: int
    remote_type: str

@router.post("/browse/start", response_model=BrowseSessionResponse)
async def start_browse_session(payload: BrowseSessionStartRequest, db: AsyncSession = Depends(get_db)):
    """Start a persistent browse session for efficient directory navigation."""
    from ..browse_sessions import browse_session_manager
    
    # Get remote and credential
    result = await db.execute(select(Remote).where(Remote.id == payload.remote_id))
    remote = result.scalar_one_or_none()
    if not remote:
        raise HTTPException(status_code=404, detail="Remote not found")
    
    # Get credential if linked
    credential_data = None
    if remote.credential_id:
        cred_result = await db.execute(select(Credential).where(Credential.id == remote.credential_id))
        cred = cred_result.scalar_one_or_none()
        if cred:
            credential_data = decrypt_credential_data(cred.data)
    
    try:
        session_id = await browse_session_manager.create_session(
            remote_id=remote.id,
            remote_type=remote.type,
            remote_config=remote.config,
            credential_data=credential_data
        )
        
        return BrowseSessionResponse(
            session_id=session_id,
            remote_id=remote.id,
            remote_type=remote.type
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start browse session: {str(e)}")

@router.post("/browse/{session_id}")
async def browse_with_session(session_id: str, payload: BrowseRequest):
    """Browse a path using an existing session (connection pooled)."""
    from ..browse_sessions import browse_session_manager
    
    try:
        items = await browse_session_manager.browse(session_id, payload.path)
        return items
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/browse/end/{session_id}")
async def end_browse_session(session_id: str):
    """End a browse session and cleanup resources."""
    from ..browse_sessions import browse_session_manager
    
    await browse_session_manager.end_session(session_id)
    return {"ok": True}

@router.post("/remotes/{remote_id}/browse")
async def browse_remote(remote_id: int, payload: BrowseRequest, db: AsyncSession = Depends(get_db)):
    """
    Browse a remote path. 
    
    If session_id is provided, uses the existing session (faster).
    Otherwise, creates a one-off connection (backward compatible).
    """
    from ..runner import job_runner, rclone_manager
    from ..browse_sessions import browse_session_manager
    
    # If session_id provided, use session-based browsing
    if payload.session_id:
        try:
            items = await browse_session_manager.browse(payload.session_id, payload.path)
            return items
        except ValueError:
            # Session not found, fall through to legacy behavior
            pass
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    # Legacy: Create one-off connection (backward compatible)
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
        
    base_fs = await job_runner.get_fs_string(remote, cred)
    target_fs = base_fs
    target_remote = payload.path
    
    try:
        result = await rclone_manager.call("operations/list", {
            "fs": target_fs,
            "remote": target_remote,
            "opt": { "max_depth": 1 }
        })
        return result.get("list", [])
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

# --- Actions ---
class ActionCreate(BaseModel):
    name: str
    type: str 
    config: dict

class ActionUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    config: Optional[dict] = None

class ActionRead(BaseModel):
    id: int
    name: str
    type: str
    config: dict
    class Config:
        from_attributes = True

@router.post("/actions/", response_model=ActionRead)
async def create_action(action: ActionCreate, db: AsyncSession = Depends(get_db)):
    db_action = Action(name=action.name, type=action.type, config=action.config)
    db.add(db_action)
    await log_activity(db, "create", "action", None, {"name": action.name})
    await db.commit()
    await db.refresh(db_action)
    return db_action

@router.get("/actions/", response_model=List[ActionRead])
async def list_actions(
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = "asc",
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import or_, cast, String
    
    query = select(Action)
    
    # Comprehensive search including config JSON for details
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Action.name.ilike(search_term),
                Action.type.ilike(search_term),
                # Search details from config JSON (command, url, webhook_url, etc.)
                cast(Action.config, String).ilike(search_term)
            )
        )
    
    # Apply sorting only
    query = apply_list_params(query, Action, None, sort_by, sort_order, [])
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/actions/{action_id}", response_model=ActionRead)
async def get_action(action_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Action).where(Action.id == action_id))
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return action

@router.put("/actions/{action_id}", response_model=ActionRead)
async def update_action(action_id: int, action: ActionUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Action).where(Action.id == action_id))
    db_action = result.scalar_one_or_none()
    if not db_action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    if action.name: db_action.name = action.name
    if action.type: db_action.type = action.type
    if action.config: db_action.config = action.config
    
    await log_activity(db, "update", "action", action_id, {"name": db_action.name})
    await db.commit()
    await db.refresh(db_action)
    return db_action

@router.delete("/actions/{action_id}")
async def delete_action(action_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Action).where(Action.id == action_id))
    db_action = result.scalar_one_or_none()
    if not db_action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    await db.delete(db_action)
    await log_activity(db, "delete", "action", action_id, {"name": db_action.name})
    await db.commit()
    return {"ok": True}

# --- Jobs ---
class JobActionCreate(BaseModel):
    action_id: int
    trigger: str 
    order: Optional[int] = 0

class JobActionRead(BaseModel):
    id: int
    action_id: int
    trigger: str
    order: int
    action: ActionRead # Include nested action details
    class Config:
        from_attributes = True

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
    actions: Optional[List[JobActionCreate]] = []

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
    actions: Optional[List[JobActionCreate]] = None

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
    actions: List[JobActionRead] = []
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
    await db.flush() # flush to get ID
    
    if job.actions:
        for action in job.actions:
            db.add(JobAction(job_id=db_job.id, action_id=action.action_id, trigger=action.trigger, order=action.order))
            
    await log_activity(db, "create", "job", db_job.id, {"name": job.name})
    await db.commit()
    await db.refresh(db_job) 
    
    # Eager load actions for response
    # Actually refresh might not load eager, but let's trust default lazy loading or explicit query if failing
    # For simplicity, returning db_job. Since lazy loading is async in async session, we might need select with options.
    # But usually refresh works enough for simple cases. Let's see. 
    # To be safe for `response_model`, we should verify `actions` are loaded.
    # AsyncSQLAlchemy relationships require explicit loading often.
    # Let's simple return db_job and if actions missing, we add selectinload.
    # Ideally:
    # stmt = select(Job).options(selectinload(Job.actions).selectinload(JobAction.action)).where(Job.id == db_job.id)
    # But let's try basic first or do a reload query.
    
    # Reload with actions
    from sqlalchemy.orm import selectinload
    stmt = select(Job).options(selectinload(Job.actions).selectinload(JobAction.action)).where(Job.id == db_job.id)
    result = await db.execute(stmt)
    db_job_loaded = result.scalar_one()
    
    return db_job_loaded

@router.get("/jobs/", response_model=List[JobRead])
async def list_jobs(
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = "asc",
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy.orm import selectinload
    from sqlalchemy import or_, cast, String, func
    from sqlalchemy.orm import aliased
    
    # Create subquery to get latest history entry per job
    hist_subq = (
        select(JobHistory.job_id, func.max(JobHistory.id).label("max_id"))
        .group_by(JobHistory.job_id)
        .subquery()
    )
    LatestHistory = aliased(JobHistory)
    
    # Main query with optional history join for status search
    query = (
        select(Job)
        .options(selectinload(Job.actions).selectinload(JobAction.action))
        .outerjoin(hist_subq, Job.id == hist_subq.c.job_id)
        .outerjoin(LatestHistory, LatestHistory.id == hist_subq.c.max_id)
    )
    
    # Custom search across all visible columns including derived status
    if search:
        search_term = f"%{search}%"
        search_lower = search.lower()
        
        # Build search conditions
        conditions = [
            Job.name.ilike(search_term),
            Job.operation.ilike(search_term),
            Job.schedule.ilike(search_term),
            Job.transfer_method.ilike(search_term),
            cast(Job.last_run, String).ilike(search_term),
            cast(Job.next_run, String).ilike(search_term),
            # Search actual status from history
            LatestHistory.status.ilike(search_term),
        ]
        
        # Special case: if searching for "idle", include jobs with NO history
        if "idle" in search_lower:
            conditions.append(hist_subq.c.max_id == None)
        
        query = query.where(or_(*conditions))
    
    # Apply sorting only
    query = apply_list_params(query, Job, None, sort_by, sort_order, [])
    result = await db.execute(query)
    jobs = result.scalars().unique().all()
    
    if not jobs:
        return []

    # 2. Fetch latest history entry for each job in one query
    # We use a subquery to get the max ID for each job_id, then join back
    subq = select(JobHistory.job_id, func.max(JobHistory.id).label("max_id")).group_by(JobHistory.job_id).subquery()
    hist_stmt = select(JobHistory).join(subq, JobHistory.id == subq.c.max_id)
    hist_res = await db.execute(hist_stmt)
    latest_histories = {h.job_id: h for h in hist_res.scalars().all()}
    
    jobs_with_status = []
    for job in jobs:
        last_run = latest_histories.get(job.id)
        
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
            "last_error": last_run.details.get("error") if last_run and last_run.details else None,
            "allow_concurrent_runs": job.allow_concurrent_runs,
            "max_concurrent_runs": job.max_concurrent_runs,
            "use_checksum": job.use_checksum,
            "actions": job.actions # Actions are loaded via selectinload
        }
        jobs_with_status.append(j_dict)
        
    return jobs_with_status

@router.get("/jobs/{job_id}", response_model=JobRead)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import selectinload
    result = await db.execute(select(Job).options(selectinload(Job.actions).selectinload(JobAction.action)).where(Job.id == job_id))
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
        "last_error": last_run.details.get("error") if last_run and last_run.details else None,
        "allow_concurrent_runs": job.allow_concurrent_runs,
        "max_concurrent_runs": job.max_concurrent_runs,
        "use_checksum": job.use_checksum,
        "actions": job.actions # Actions are loaded via selectinload
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
                if field == "actions":
                    continue # Handle actions separately
                setattr(db_job, field, value)
            
            # Handle actions
            if job_update.actions is not None:
                # Delete existing actions
                await session.execute(delete(JobAction).where(JobAction.job_id == job_id))
                # Add new ones
                for action in job_update.actions:
                    session.add(JobAction(job_id=job_id, action_id=action.action_id, trigger=action.trigger, order=action.order))
            
            # Handle scheduler synchronization if schedule or enabled changed
            if "schedule" in update_data or "enabled" in update_data:
                if db_job.enabled and db_job.schedule and db_job.schedule != "Manual":
                    add_scheduler_job(db_job.id, db_job.schedule)
                else:
                    remove_scheduler_job(db_job.id)
            
            await log_activity(session, "patch", "job", job_id, update_data)
    
    # Reload with status and actions
    from sqlalchemy.orm import selectinload
    stmt = select(Job).options(selectinload(Job.actions).selectinload(JobAction.action)).where(Job.id == job_id)
    result = await db.execute(stmt)
    db_job_loaded = result.scalar_one()
    
    # Re-fetch history for status
    stmt_hist = select(JobHistory).where(JobHistory.job_id == db_job_loaded.id).order_by(JobHistory.timestamp.desc()).limit(1)
    hist_res = await db.execute(stmt_hist)
    last_run = hist_res.scalar_one_or_none()

    return JobRead(
        id=db_job_loaded.id,
        name=db_job_loaded.name,
        source_remote_id=db_job_loaded.source_remote_id,
        dest_remote_id=db_job_loaded.dest_remote_id,
        operation=db_job_loaded.operation,
        schedule=db_job_loaded.schedule,
        source_path=db_job_loaded.source_path,
        dest_path=db_job_loaded.dest_path,
        excludes=db_job_loaded.excludes,
        embed_key=db_job_loaded.embed_key,
        transfer_method=db_job_loaded.transfer_method or 'direct',
        copy_mode=db_job_loaded.copy_mode or 'folder',
        enabled=db_job_loaded.enabled if db_job_loaded.enabled is not None else True,
        last_run=db_job_loaded.last_run,
        next_run=get_job_next_run(db_job_loaded.id),
        last_status=last_run.status if last_run else "idle",
        last_error=last_run.details.get("error") if last_run and last_run.details else None,
        allow_concurrent_runs=db_job_loaded.allow_concurrent_runs,
        max_concurrent_runs=db_job_loaded.max_concurrent_runs,
        use_checksum=db_job_loaded.use_checksum,
        actions=db_job_loaded.actions
    )

from ..runner import job_runner
from ..docker_client import docker_client

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

# SSE endpoint must be public - EventSource doesn't send auth cookies
@public_router.get("/events")
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
            if not obj: # Added missing check
                raise HTTPException(status_code=404, detail="Remote not found")
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
            db_job.allow_concurrent_runs = job.allow_concurrent_runs
            db_job.max_concurrent_runs = job.max_concurrent_runs
            db_job.use_checksum = job.use_checksum
            
            # If schedule changed, logic to update scheduler would be needed here. 
            # For now, simplistic update.
            
            if job.actions is not None:
                # Delete existing actions
                await session.execute(delete(JobAction).where(JobAction.job_id == job_id))
                # Add new ones
                for action in job.actions:
                    session.add(JobAction(job_id=job_id, action_id=action.action_id, trigger=action.trigger, order=action.order))
            
            await log_activity(session, "update", "job", job_id, job.dict()) # Convert Pydantic to dict
    
    # Reload with actions
    from sqlalchemy.orm import selectinload
    stmt = select(Job).options(selectinload(Job.actions).selectinload(JobAction.action)).where(Job.id == job_id)
    result = await db.execute(stmt)
    db_job_loaded = result.scalar_one()

    # Re-fetch history for status
    stmt_hist = select(JobHistory).where(JobHistory.job_id == db_job_loaded.id).order_by(JobHistory.timestamp.desc()).limit(1)
    hist_res = await db.execute(stmt_hist)
    last_run = hist_res.scalar_one_or_none()
    
    return JobRead(
        id=db_job_loaded.id,
        name=db_job_loaded.name,
        source_remote_id=db_job_loaded.source_remote_id,
        dest_remote_id=db_job_loaded.dest_remote_id,
        operation=db_job_loaded.operation,
        schedule=db_job_loaded.schedule,
        source_path=db_job_loaded.source_path,
        dest_path=db_job_loaded.dest_path,
        excludes=db_job_loaded.excludes,
        embed_key=db_job_loaded.embed_key,
        transfer_method=db_job_loaded.transfer_method or 'direct',
        copy_mode=db_job_loaded.copy_mode or 'folder',
        enabled=db_job_loaded.enabled if db_job_loaded.enabled is not None else True,
        last_run=db_job_loaded.last_run,
        next_run=get_job_next_run(db_job_loaded.id),
        last_status=last_run.status if last_run else "idle",
        last_error=last_run.details.get("error") if last_run and last_run.details else None,
        allow_concurrent_runs=db_job_loaded.allow_concurrent_runs,
        max_concurrent_runs=db_job_loaded.max_concurrent_runs,
        use_checksum=db_job_loaded.use_checksum,
        actions=db_job_loaded.actions
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
async def list_schedules(
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = "asc",
    db: AsyncSession = Depends(get_db)
):
    from ..models import ScheduleTemplate
    from sqlalchemy import or_, cast, String
    
    query = select(ScheduleTemplate)
    
    # Comprehensive search including config JSON for cron expression
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                ScheduleTemplate.name.ilike(search_term),
                ScheduleTemplate.schedule_type.ilike(search_term),
                # Search cron expression from config JSON
                cast(ScheduleTemplate.config, String).ilike(search_term)
            )
        )
    
    # Apply sorting only
    query = apply_list_params(query, ScheduleTemplate, None, sort_by, sort_order, [])
    result = await db.execute(query)
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
async def list_history(
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = "desc",
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    from ..models import JobHistory, Job
    from sqlalchemy.orm import joinedload
    from sqlalchemy import or_, cast, String
    
    stmt = select(JobHistory).options(joinedload(JobHistory.job))
    
    # Apply comprehensive search filter across all visible columns
    if search:
        search_term = f"%{search}%"
        stmt = stmt.where(
            or_(
                JobHistory.status.ilike(search_term),
                JobHistory.job.has(Job.name.ilike(search_term)),
                cast(JobHistory.started_at, String).ilike(search_term),
                cast(JobHistory.completed_at, String).ilike(search_term),
                cast(JobHistory.avg_speed, String).ilike(search_term),
                # Search trigger from job_snapshot JSON (execution_type field)
                cast(JobHistory.job_snapshot, String).ilike(search_term)
            )
        )
    
    # Apply sorting
    if sort_by and hasattr(JobHistory, sort_by):
        column = getattr(JobHistory, sort_by)
        if sort_order == "asc":
            stmt = stmt.order_by(column.asc())
        else:
            stmt = stmt.order_by(column.desc())
    else:
        stmt = stmt.order_by(JobHistory.timestamp.desc())
    
    stmt = stmt.limit(limit).offset(offset)
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
async def list_activity(
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = "desc",
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    from ..models import ActivityLog
    query = select(ActivityLog)
    
    # Apply search filter
    if search:
        from sqlalchemy import or_
        search_term = f"%{search}%"
        query = query.where(
            or_(
                ActivityLog.action.ilike(search_term),
                ActivityLog.entity_type.ilike(search_term)
            )
        )
    
    # Apply sorting
    if sort_by and hasattr(ActivityLog, sort_by):
        column = getattr(ActivityLog, sort_by)
        if sort_order == "asc":
            query = query.order_by(column.asc())
        else:
            query = query.order_by(column.desc())
    else:
        query = query.order_by(ActivityLog.timestamp.desc())
    
    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
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
        db_path = get_database_path()
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

        # 3. Copy encryption key file
        key_file = get_key_file_path()
        if os.path.exists(key_file):
            shutil.copy2(key_file, os.path.join(tmp_dir, ".grabarr_key"))

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
            # SECURITY: Use -pass stdin to avoid password exposure in process list
            p2 = subprocess.Popen(
                ["openssl", "enc", "-aes-256-cbc", "-salt", "-pbkdf2", "-pass", "stdin"],
                stdin=subprocess.PIPE,
                stdout=f_out
            )
            # Write password to stdin, then pipe tar output
            p2.stdin.write(password.encode() + b"\n")
            # Now pipe the tar output through
            for chunk in iter(lambda: p1.stdout.read(8192), b""):
                p2.stdin.write(chunk)
            p1.stdout.close()
            p2.stdin.close()
            p2.wait()

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

        # Decrypt and Untar - SECURITY: Use -pass stdin to avoid password exposure
        # First read the encrypted file
        with open(enc_path, 'rb') as enc_file:
            enc_data = enc_file.read()
        
        p1 = subprocess.Popen(
            ["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-pass", "stdin"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        # Write password followed by newline, then the encrypted data
        decrypted_data, p1_err = p1.communicate(input=password.encode() + b"\n" + enc_data)
        
        if p1.returncode != 0:
            raise HTTPException(status_code=400, detail="Decryption failed - wrong password or corrupt file")
        
        p2 = subprocess.Popen(
            ["tar", "-xzf", "-", "-C", tmp_dir],
            stdin=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        out, err = p2.communicate(input=decrypted_data)
        if p2.returncode != 0:
            raise HTTPException(status_code=400, detail="Invalid archive format")

        # 1. Restore DB
        restored_db = os.path.join(tmp_dir, "grabarr.db")
        if os.path.exists(restored_db):
            db_target = get_database_path()
            db_dir = os.path.dirname(db_target)
            if db_dir:
                os.makedirs(db_dir, exist_ok=True)
            shutil.move(restored_db, db_target)
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

        # 3. Restore encryption key file
        restored_key = os.path.join(tmp_dir, ".grabarr_key")
        if os.path.exists(restored_key):
            key_target = get_key_file_path()
            key_dir = os.path.dirname(key_target)
            if key_dir:
                os.makedirs(key_dir, exist_ok=True)
            shutil.move(restored_key, key_target)
            # Set restrictive permissions
            try:
                os.chmod(key_target, 0o600)
            except OSError:
                pass

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


@router.post("/system/restart")
async def restart_system(background_tasks: BackgroundTasks):
    """
    Triggers a system restart. 
    Attempts to use supervisorctl if available, otherwise exits the process.
    """
    import os
    import subprocess
    
    def perform_restart():
        # Give some time for the response to be sent
        import time
        time.sleep(2)
        
        # Check if we are running under supervisor
        try:
            # supervisorctl restart all
            subprocess.run(["supervisorctl", "restart", "all"], check=True)
            return
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass
            
        # Fallback: Just exit and let the process manager restart us
        # Note: This only works if there's an external process manager (e.g. Docker restart policy, systemd)
        os._exit(0)

    background_tasks.add_task(perform_restart)
    return {"message": "Restart initiated"}


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

@public_router.get("/auth/status")
async def auth_status():
    """Check if authentication is set up and required."""
    has_admin = await admin_exists()
    return {
        "auth_required": True,
        "setup_complete": has_admin
    }

@public_router.post("/auth/setup")
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

@public_router.post("/auth/login")
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

@public_router.post("/auth/logout")
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

# --- Embed Widgets ---
class EmbedWidgetCreate(BaseModel):
    job_id: int
    name: Optional[str] = "Default Widget"
    width: Optional[int] = 350
    height: Optional[int] = 150
    config: Optional[dict] = None

class EmbedWidgetUpdate(BaseModel):
    name: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    config: Optional[dict] = None

class JobBasicRead(BaseModel):
    id: int
    name: str
    operation: Optional[str] = None
    class Config:
        from_attributes = True

class EmbedWidgetRead(BaseModel):
    id: int
    job_id: int
    embed_key: str
    name: str
    width: int
    height: int
    config: Optional[dict] = None
    job: Optional[JobBasicRead] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

@router.get("/widgets", response_model=List[EmbedWidgetRead])
async def list_widgets(
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = "asc",
    db: AsyncSession = Depends(get_db)
):
    """List all embed widgets."""
    from sqlalchemy.orm import joinedload
    from sqlalchemy import or_, cast, String
    query = select(EmbedWidget).options(joinedload(EmbedWidget.job))
    
    # Custom search that includes job name and dimensions
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                EmbedWidget.name.ilike(search_term),
                EmbedWidget.job.has(Job.name.ilike(search_term)),
                cast(EmbedWidget.width, String).ilike(search_term),
                cast(EmbedWidget.height, String).ilike(search_term)
            )
        )
    # Apply sorting only (search already handled)
    query = apply_list_params(query, EmbedWidget, None, sort_by, sort_order, [])
    result = await db.execute(query)
    return result.scalars().unique().all()

@router.get("/widgets/{widget_id}", response_model=EmbedWidgetRead)
async def get_widget(widget_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific widget by ID."""
    from sqlalchemy.orm import joinedload
    result = await db.execute(
        select(EmbedWidget).options(joinedload(EmbedWidget.job)).where(EmbedWidget.id == widget_id)
    )
    widget = result.scalar_one_or_none()
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    return widget

@public_router.get("/widgets/by-key/{embed_key}")
async def get_widget_by_key(embed_key: str, db: AsyncSession = Depends(get_db)):
    """Get widget by its embed key (used by embed pages)."""
    result = await db.execute(select(EmbedWidget).where(EmbedWidget.embed_key == embed_key))
    widget = result.scalar_one_or_none()
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    
    # Also fetch job info for the embed
    job_result = await db.execute(select(Job).where(Job.id == widget.job_id))
    job = job_result.scalar_one_or_none()
    
    return {
        "id": widget.id,
        "job_id": widget.job_id,
        "embed_key": widget.embed_key,
        "name": widget.name,
        "width": widget.width,
        "height": widget.height,
        "config": widget.config,
        "job": {
            "id": job.id,
            "name": job.name,
            "operation": job.operation
        } if job else None
    }

@router.post("/widgets", response_model=EmbedWidgetRead)
async def create_widget(widget: EmbedWidgetCreate, db: AsyncSession = Depends(get_db)):
    """Create a new embed widget."""
    # Verify job exists
    job_result = await db.execute(select(Job).where(Job.id == widget.job_id))
    if not job_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Job not found")
    
    db_widget = EmbedWidget(
        job_id=widget.job_id,
        name=widget.name,
        width=widget.width,
        height=widget.height,
        config=widget.config or {
            "fields": {
                "jobName": {"enabled": True, "order": 0},
                "statusIndicator": {"enabled": True, "order": 1},
                "progressBar": {"enabled": True, "order": 2},
                "speed": {"enabled": True, "order": 3},
                "bytesTransferred": {"enabled": True, "order": 4},
                "eta": {"enabled": False, "order": 5},
                "filesTransferred": {"enabled": False, "order": 6},
                "currentFile": {"enabled": False, "order": 7},
                "operationType": {"enabled": False, "order": 8}
            },
            "style": {
                "backgroundColor": "#111827",
                "backgroundOpacity": 1.0,
                "textColor": "#ffffff",
                "secondaryTextColor": "#9ca3af",
                "accentColor": "#8b5cf6",
                "borderRadius": 8,
                "borderColor": "#374151",
                "borderWidth": 1,
                "fontSize": 14,
                "theme": "dark"
            },
            "layout": "vertical"
        }
    )
    db.add(db_widget)
    await log_activity(db, "create", "widget", None, {"job_id": widget.job_id, "name": widget.name})
    await db.commit()
    await db.refresh(db_widget)
    
    # Reload with job relationship for response
    from sqlalchemy.orm import joinedload
    result = await db.execute(
        select(EmbedWidget).options(joinedload(EmbedWidget.job)).where(EmbedWidget.id == db_widget.id)
    )
    return result.scalar_one()

@router.put("/widgets/{widget_id}", response_model=EmbedWidgetRead)
async def update_widget(widget_id: int, widget: EmbedWidgetUpdate, db: AsyncSession = Depends(get_db)):
    """Update an existing widget."""
    result = await db.execute(select(EmbedWidget).where(EmbedWidget.id == widget_id))
    db_widget = result.scalar_one_or_none()
    if not db_widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    
    update_data = widget.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_widget, field, value)
    
    await log_activity(db, "update", "widget", widget_id, update_data)
    await db.commit()
    await db.refresh(db_widget)
    
    # Reload with job relationship for response
    from sqlalchemy.orm import joinedload
    result = await db.execute(
        select(EmbedWidget).options(joinedload(EmbedWidget.job)).where(EmbedWidget.id == widget_id)
    )
    return result.scalar_one()

@router.delete("/widgets/{widget_id}")
async def delete_widget(widget_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a widget."""
    result = await db.execute(select(EmbedWidget).where(EmbedWidget.id == widget_id))
    db_widget = result.scalar_one_or_none()
    if not db_widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    
    await db.delete(db_widget)
    await log_activity(db, "delete", "widget", widget_id, {"name": db_widget.name})
    await db.commit()
    return {"ok": True}

@router.post("/widgets/{widget_id}/rotate-key", response_model=EmbedWidgetRead)
async def rotate_widget_key(widget_id: int, db: AsyncSession = Depends(get_db)):
    """Rotate the embed key for a widget, invalidating old embed URLs."""
    result = await db.execute(select(EmbedWidget).where(EmbedWidget.id == widget_id))
    db_widget = result.scalar_one_or_none()
    if not db_widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    
    import uuid
    db_widget.embed_key = str(uuid.uuid4())
    await log_activity(db, "rotate_key", "widget", widget_id, {})
    await db.commit()
    await db.refresh(db_widget)
    return db_widget

@router.get("/jobs/{job_id}/widgets", response_model=List[EmbedWidgetRead])
async def list_job_widgets(job_id: int, db: AsyncSession = Depends(get_db)):
    """List all widgets for a specific job."""
    result = await db.execute(select(EmbedWidget).where(EmbedWidget.job_id == job_id))
    return result.scalars().all()


# =====================================
# CORS Settings (Security Section)
# =====================================

class CORSSettingsRead(BaseModel):
    allowed_origins: List[str] = []
    allow_all: bool = False

class CORSSettingsUpdate(BaseModel):
    allowed_origins: List[str]
    allow_all: bool = False

@router.get("/security/cors", response_model=CORSSettingsRead)
async def get_cors_settings(db: AsyncSession = Depends(get_db)):
    """Get current CORS allowed origins."""
    # Origins
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == "cors_allowed_origins")
    )
    setting = result.scalars().first()
    origins = setting.value if setting and setting.value and isinstance(setting.value, list) else []
    
    # Allow All
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == "cors_allow_all")
    )
    allow_all_setting = result.scalars().first()
    allow_all = str(allow_all_setting.value).lower() == "true" if allow_all_setting and allow_all_setting.value else False
    
    return CORSSettingsRead(allowed_origins=origins, allow_all=allow_all)

@router.put("/security/cors", response_model=CORSSettingsRead)
async def update_cors_settings(settings: CORSSettingsUpdate, db: AsyncSession = Depends(get_db)):
    """Update CORS allowed origins. Changes take effect on next server restart."""
    # Validate origins - basic URL format check
    validated_origins = []
    for origin in settings.allowed_origins:
        origin = origin.strip()
        if origin and (origin.startswith("http://") or origin.startswith("https://")):
            # Remove trailing slash if present
            validated_origins.append(origin.rstrip("/"))
    
    # Update Origins
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == "cors_allowed_origins")
    )
    setting = result.scalars().first()
    if setting:
        setting.value = validated_origins
    else:
        db.add(SystemSettings(key="cors_allowed_origins", value=validated_origins))
        
    # Update Allow All
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == "cors_allow_all")
    )
    allow_all_setting = result.scalars().first()
    if allow_all_setting:
        allow_all_setting.value = str(settings.allow_all).lower()
    else:
        db.add(SystemSettings(key="cors_allow_all", value=str(settings.allow_all).lower()))
    
    await log_activity(db, "update", "cors_settings", None, {"origins": validated_origins, "allow_all": settings.allow_all})
    await db.commit()
    
    return CORSSettingsRead(allowed_origins=validated_origins, allow_all=settings.allow_all)

