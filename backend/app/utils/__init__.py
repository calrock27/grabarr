"""
Job helper utilities to reduce code duplication in job-related endpoints.
"""
from typing import Optional, Any
from ..scheduler import get_job_next_run


def build_job_response(job: Any, last_history: Optional[Any] = None) -> dict:
    """
    Build a standardized job response dictionary.
    
    This eliminates the 4x duplication of job response building logic
    across list_jobs, get_job, patch_job, and other endpoints.
    
    Args:
        job: SQLAlchemy Job model instance
        last_history: Optional JobHistory instance for status info
        
    Returns:
        Dictionary suitable for JobRead schema
    """
    return {
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
        "last_status": last_history.status if last_history else "idle",
        "last_error": (
            last_history.details.get("error") 
            if last_history and last_history.details 
            else None
        ),
        "allow_concurrent_runs": job.allow_concurrent_runs,
        "max_concurrent_runs": job.max_concurrent_runs,
        "use_checksum": job.use_checksum,
        "actions": job.actions  # Assume actions are loaded via selectinload
    }


# Sensitive keys that should be masked in credential responses
SENSITIVE_KEYS = [
    "password", 
    "private_key", 
    "passphrase", 
    "secret_access_key", 
    "token", 
    "api_token"
]


def mask_sensitive_data(data: dict) -> dict:
    """
    Mask sensitive fields in credential data for safe display.
    
    Args:
        data: Dictionary of credential data
        
    Returns:
        Copy of data with sensitive fields replaced with "******"
    """
    if not data:
        return {}
    
    data_copy = data.copy()
    for key in data_copy:
        if key in SENSITIVE_KEYS and data_copy[key]:
            data_copy[key] = "******"
    return data_copy
