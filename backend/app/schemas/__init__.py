"""
Pydantic schemas for grabarr API.

All request/response models are defined here to maintain a single source of truth
and reduce code duplication across router modules.
"""
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime


# --- Credentials ---
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


# --- Remotes ---
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
        from_attributes = True


class BrowseRequest(BaseModel):
    path: str = ""


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
    action: ActionRead
    
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


# --- Schedules ---
class ScheduleConfig(BaseModel):
    cron: Optional[str] = None
    minutes: Optional[int] = None


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


# --- Job History ---
class JobHistoryRead(BaseModel):
    id: int
    job_id: int
    job_name: Optional[str] = None
    status: str
    details: Optional[dict] = None
    timestamp: datetime
    completed_at: Optional[datetime] = None
    job_snapshot: Optional[dict] = None
    
    class Config:
        from_attributes = True


# --- Activity Log ---
class ActivityLogRead(BaseModel):
    id: int
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    details: Optional[dict] = None
    timestamp: datetime
    
    class Config:
        from_attributes = True


# --- System Settings ---
class SystemSettingsUpdate(BaseModel):
    timezone: Optional[str] = None
    notifications_enabled: Optional[bool] = None
    webhook_url: Optional[str] = None
    notification_events: Optional[List[str]] = None


class SystemSettingsRead(BaseModel):
    timezone: str = "America/New_York"
    notifications_enabled: bool = False
    webhook_url: Optional[str] = None
    notification_events: List[str] = []


# --- API Keys ---
class APIKeyCreate(BaseModel):
    name: str


class APIKeyRead(BaseModel):
    id: int
    name: str
    key: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# --- Widgets ---
class WidgetCreate(BaseModel):
    job_id: int
    style: Optional[dict] = None


class WidgetRead(BaseModel):
    id: int
    embed_key: str
    job_id: int
    style: Optional[dict] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class WidgetUpdate(BaseModel):
    style: Optional[dict] = None
