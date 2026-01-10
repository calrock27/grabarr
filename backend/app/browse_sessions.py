"""
Browse Session Manager - Manages persistent rclone connections for file browsing.

Creates temporary named remotes in rclone config for efficient directory browsing,
avoiding the overhead of creating new SSH connections for each request.
"""

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional
from dataclasses import dataclass, field

from .rclone import rclone_manager
from .crypto import decrypt_credential_data

logger = logging.getLogger(__name__)

# Session timeout in seconds (default: 5 minutes)
SESSION_TIMEOUT = int(os.environ.get("GRABARR_BROWSE_SESSION_TIMEOUT", "300"))


@dataclass
class BrowseSession:
    """Represents an active browse session with a temporary rclone remote."""
    session_id: str
    remote_id: int
    remote_name: str  # Temporary remote name in rclone config
    remote_type: str  # sftp, ftp, smb, s3, local
    base_path: str  # Base path from remote config
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_accessed: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    def touch(self):
        """Update last accessed time."""
        self.last_accessed = datetime.now(timezone.utc)
    
    def is_expired(self) -> bool:
        """Check if session has expired."""
        elapsed = (datetime.now(timezone.utc) - self.last_accessed).total_seconds()
        return elapsed > SESSION_TIMEOUT


class BrowseSessionManager:
    """Manages browse sessions with persistent rclone connections."""
    
    def __init__(self):
        self.sessions: Dict[str, BrowseSession] = {}
        self._cleanup_task: Optional[asyncio.Task] = None
        self._running = False
    
    async def start(self):
        """Start the session manager and cleanup task."""
        self._running = True
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info(f"BrowseSessionManager started with {SESSION_TIMEOUT}s timeout")
    
    async def stop(self):
        """Stop the session manager and cleanup all sessions."""
        self._running = False
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        
        # Cleanup all active sessions
        for session_id in list(self.sessions.keys()):
            await self.end_session(session_id)
        
        logger.info("BrowseSessionManager stopped")
    
    async def _cleanup_loop(self):
        """Background task to cleanup expired sessions."""
        while self._running:
            try:
                await asyncio.sleep(60)  # Check every minute
                expired = [
                    sid for sid, session in self.sessions.items()
                    if session.is_expired()
                ]
                for session_id in expired:
                    logger.info(f"Cleaning up expired browse session: {session_id}")
                    await self.end_session(session_id)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in session cleanup loop: {e}")
    
    async def create_session(
        self, 
        remote_id: int, 
        remote_type: str, 
        remote_config: dict,
        credential_data: Optional[dict] = None
    ) -> str:
        """
        Create a new browse session with a temporary rclone remote.
        
        Returns the session_id.
        """
        session_id = str(uuid.uuid4())[:8]
        temp_remote_name = f"_grabarr_browse_{session_id}"
        
        # Build rclone remote parameters based on type
        params = await self._build_remote_params(remote_type, remote_config, credential_data)
        
        try:
            # Create temporary named remote in rclone config
            await rclone_manager.call("config/create", {
                "name": temp_remote_name,
                "type": remote_type,
                "parameters": params,
                "opt": {
                    "obscure": True,  # Passwords are plain, need obscuring
                    "noOutput": True
                }
            })
            
            # Determine base path
            base_path = self._get_base_path(remote_type, remote_config)
            
            session = BrowseSession(
                session_id=session_id,
                remote_id=remote_id,
                remote_name=temp_remote_name,
                remote_type=remote_type,
                base_path=base_path
            )
            
            self.sessions[session_id] = session
            logger.info(f"Created browse session {session_id} for remote {remote_id} ({remote_type})")
            
            return session_id
            
        except Exception as e:
            logger.error(f"Failed to create browse session: {e}")
            # Try to cleanup if partial creation
            try:
                await rclone_manager.call("config/delete", {"name": temp_remote_name})
            except:
                pass
            raise
    
    async def _build_remote_params(
        self, 
        remote_type: str, 
        remote_config: dict, 
        credential_data: Optional[dict]
    ) -> dict:
        """Build rclone remote parameters based on remote type."""
        params = {}
        
        if remote_type == "local":
            # Local doesn't need much config
            return params
        
        if remote_type == "s3":
            params["provider"] = remote_config.get("provider", "AWS")
            if remote_config.get("endpoint"):
                params["endpoint"] = remote_config["endpoint"]
            if remote_config.get("region"):
                params["region"] = remote_config["region"]
            # Force path style for non-AWS
            if params.get("provider") not in ["AWS"]:
                params["force_path_style"] = "true"
            
            if credential_data:
                if credential_data.get("access_key_id"):
                    params["access_key_id"] = credential_data["access_key_id"]
                if credential_data.get("secret_access_key"):
                    params["secret_access_key"] = credential_data["secret_access_key"]
            else:
                params["env_auth"] = "false"
            
            return params
        
        # SFTP, FTP, SMB
        if remote_config.get("host"):
            params["host"] = remote_config["host"]
        
        # Port with defaults
        default_ports = {"sftp": "22", "ftp": "21", "smb": "445"}
        params["port"] = remote_config.get("port", default_ports.get(remote_type, "22"))
        
        if credential_data:
            user = credential_data.get("user") or credential_data.get("username")
            if user:
                params["user"] = user
            if credential_data.get("password"):
                params["pass"] = credential_data["password"]
        
        return params
    
    def _get_base_path(self, remote_type: str, remote_config: dict) -> str:
        """Get the base path from remote config."""
        if remote_type == "local":
            return remote_config.get("path", "/")
        
        if remote_type == "s3":
            return remote_config.get("bucket", "")
        
        if remote_type == "smb":
            share = remote_config.get("share", "").strip("/")
            path = remote_config.get("path", "").strip("/")
            return f"{share}/{path}" if path else share
        
        # SFTP, FTP
        return remote_config.get("path", "/")
    
    def get_session(self, session_id: str) -> Optional[BrowseSession]:
        """Get a session by ID, updating last accessed time."""
        session = self.sessions.get(session_id)
        if session and not session.is_expired():
            session.touch()
            return session
        elif session:
            # Session expired, will be cleaned up
            return None
        return None
    
    async def browse(self, session_id: str, path: str = "") -> list:
        """
        Browse a path using an existing session.
        
        Returns list of files/directories.
        """
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found or expired")
        
        # Build the full path
        if session.remote_type == "local":
            # For local, we use the fs string directly
            fs_string = session.base_path
            if path:
                fs_string = f"{fs_string.rstrip('/')}/{path.lstrip('/')}"
            remote_path = ""
        else:
            # For remote types, use named remote
            fs_string = f"{session.remote_name}:{session.base_path}"
            remote_path = path
        
        try:
            result = await rclone_manager.call("operations/list", {
                "fs": fs_string,
                "remote": remote_path,
                "opt": {"max_depth": 1}
            })
            return result.get("list", [])
        except Exception as e:
            logger.error(f"Browse failed for session {session_id}: {e}")
            raise
    
    async def end_session(self, session_id: str):
        """End a browse session and cleanup the temporary remote."""
        session = self.sessions.pop(session_id, None)
        if not session:
            return
        
        try:
            # Delete temporary remote from rclone config
            await rclone_manager.call("config/delete", {"name": session.remote_name})
            logger.info(f"Ended browse session {session_id}")
        except Exception as e:
            logger.error(f"Failed to cleanup session {session_id}: {e}")
    
    def get_active_count(self) -> int:
        """Return count of active sessions."""
        return len(self.sessions)


# Global instance
browse_session_manager = BrowseSessionManager()
