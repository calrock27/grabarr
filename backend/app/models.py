from sqlalchemy import Column, Integer, String, Text, ForeignKey, JSON, DateTime, Boolean
from sqlalchemy.orm import relationship
from .db import Base
from datetime import datetime, timezone
import uuid

class Credential(Base):
    __tablename__ = "credentials"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    type = Column(String)  # e.g., 'ssh', 's3', 'ftp'
    data = Column(JSON)    # Encrypted fields

class Remote(Base):
    __tablename__ = "remotes"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    type = Column(String)
    credential_id = Column(Integer, ForeignKey("credentials.id"), nullable=True)
    config = Column(JSON)  # Remote specific config (path, bucket, etc)
    credential = relationship("Credential")

class Job(Base):
    __tablename__ = "jobs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    source_remote_id = Column(Integer, ForeignKey("remotes.id"))
    dest_remote_id = Column(Integer, ForeignKey("remotes.id"))
    operation = Column(String) # sync, copy, move
    schedule = Column(String)  # cron expression
    
    # Filters
    source_path = Column(String, nullable=True)
    dest_path = Column(String, nullable=True)
    excludes = Column(JSON, nullable=True)
    
    # Transfer settings
    transfer_method = Column(String, default='direct')  # direct, proxy
    copy_mode = Column(String, default='folder')  # folder, contents
    
    # Status fields
    enabled = Column(Boolean, default=True)
    last_run = Column(DateTime, nullable=True)
    next_run = Column(DateTime, nullable=True)
    last_status = Column(String, nullable=True)  # idle, success, failed
    last_error = Column(String, nullable=True)
    
    # Concurrency settings
    allow_concurrent_runs = Column(Boolean, default=False)
    max_concurrent_runs = Column(Integer, default=1)
    
    # Verification settings
    use_checksum = Column(Boolean, default=False)  # Use hash comparison instead of mtime+size
    
    embed_key = Column(String, unique=True, index=True, default=lambda: str(uuid.uuid4()))
    
    source = relationship("Remote", foreign_keys=[source_remote_id])
    dest = relationship("Remote", foreign_keys=[dest_remote_id])
    
    actions = relationship("JobAction", back_populates="job", cascade="all, delete-orphan")

class Action(Base):
    __tablename__ = "actions"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    type = Column(String)  # webhook, command, notification, rclone, docker, delay
    config = Column(JSON) # Type-specific config

class JobAction(Base):
    __tablename__ = "job_actions"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey('jobs.id'))
    action_id = Column(Integer, ForeignKey('actions.id'))
    trigger = Column(String) # pre, post_success, post_fail, post_always
    order = Column(Integer, default=0)
    
    job = relationship("Job", back_populates="actions")
    action = relationship("Action")

class JobHistory(Base):
    __tablename__ = "job_history"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), index=True)
    status = Column(String) # success, failed
    details = Column(JSON) # raw rclone stats
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    
    # New fields for Activity page
    avg_speed = Column(Integer, nullable=True)  # bytes/sec
    files_transferred = Column(JSON, nullable=True)  # list of file names
    job_snapshot = Column(JSON, nullable=True)  # job config at time of run
    started_at = Column(DateTime, nullable=True)  # when job started
    completed_at = Column(DateTime, nullable=True)  # when job finished

    
    job = relationship("Job")


class ScheduleTemplate(Base):
    __tablename__ = "schedule_templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    schedule_type = Column(String) # 'interval', 'cron'
    config = Column(JSON) # { "minutes": 15 } or { "hour": 2, "day_of_week": "mon" }

class APIKey(Base):
    __tablename__ = "api_keys"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    name = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class ActivityLog(Base):
    __tablename__ = "activity_log"
    id = Column(Integer, primary_key=True, index=True)
    action = Column(String) # create, update, delete, start, stop
    entity_type = Column(String) # job, remote, system
    entity_id = Column(Integer, nullable=True) # Optional link to entity
    details = Column(JSON) # Snapshot or diff
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

class SystemSettings(Base):
    __tablename__ = "system_settings"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    value = Column(JSON)  # Store any type of value as JSON

class AdminUser(Base):
    __tablename__ = "admin_user"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, default="admin")
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class EmbedWidget(Base):
    """Customizable widget configurations for embedding job status in external dashboards."""
    __tablename__ = "embed_widgets"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False, index=True)
    embed_key = Column(String(64), unique=True, index=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), default="Default Widget")
    width = Column(Integer, default=350)
    height = Column(Integer, default=150)
    config = Column(JSON)  # Stores field visibility, colors, layout settings
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    job = relationship("Job")
