"""
Browse Session Manager - Manages persistent SSH connections for file browsing.

Uses asyncssh to maintain a single SSH connection per session for efficient
directory browsing, avoiding repeated SSH logins that trigger rate limiting.
"""

import asyncio
import logging
import os
import uuid
import stat
from datetime import datetime, timezone
from typing import Dict, Optional, List, Any
from dataclasses import dataclass, field

try:
    import asyncssh
    HAS_ASYNCSSH = True
except ImportError:
    HAS_ASYNCSSH = False
    asyncssh = None

from .rclone import rclone_manager

logger = logging.getLogger(__name__)

# Session timeout in seconds (default: 5 minutes)
SESSION_TIMEOUT = int(os.environ.get("GRABARR_BROWSE_SESSION_TIMEOUT", "300"))


@dataclass
class BrowseSession:
    """Represents an active browse session with a persistent connection."""
    session_id: str
    remote_id: int
    remote_type: str  # sftp, ftp, smb, s3, local
    base_path: str  # Base path from remote config
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_accessed: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    # SSH connection (for SFTP)
    ssh_conn: Any = None
    sftp_client: Any = None
    
    # Rclone fallback info
    rclone_remote_name: Optional[str] = None
    
    def touch(self):
        """Update last accessed time."""
        self.last_accessed = datetime.now(timezone.utc)
    
    def is_expired(self) -> bool:
        """Check if session has expired."""
        elapsed = (datetime.now(timezone.utc) - self.last_accessed).total_seconds()
        return elapsed > SESSION_TIMEOUT
    
    async def close(self):
        """Close any open connections."""
        if self.sftp_client:
            self.sftp_client.exit()
            self.sftp_client = None
        if self.ssh_conn:
            self.ssh_conn.close()
            await self.ssh_conn.wait_closed()
            self.ssh_conn = None


class BrowseSessionManager:
    """Manages browse sessions with persistent SSH connections."""
    
    def __init__(self):
        self.sessions: Dict[str, BrowseSession] = {}
        self._cleanup_task: Optional[asyncio.Task] = None
        self._running = False
    
    async def start(self):
        """Start the session manager and cleanup task."""
        self._running = True
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        ssh_status = "enabled" if HAS_ASYNCSSH else "disabled (asyncssh not installed)"
        logger.info(f"BrowseSessionManager started with {SESSION_TIMEOUT}s timeout, SSH browsing {ssh_status}")
    
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
        Create a new browse session.
        
        For SFTP: Creates a persistent SSH connection.
        For others: Falls back to rclone.
        
        Returns the session_id.
        """
        session_id = str(uuid.uuid4())[:8]
        base_path = self._get_base_path(remote_type, remote_config)
        
        session = BrowseSession(
            session_id=session_id,
            remote_id=remote_id,
            remote_type=remote_type,
            base_path=base_path
        )
        
        # Try SSH for SFTP remotes
        if remote_type == "sftp" and HAS_ASYNCSSH and credential_data:
            try:
                await self._connect_ssh(session, remote_config, credential_data)
                logger.info(f"Created SSH browse session {session_id} for remote {remote_id}")
            except Exception as e:
                logger.warning(f"SSH connection failed, will use rclone fallback: {e}")
                # Continue without SSH - will use rclone fallback
        
        # If no SSH connection, prepare rclone fallback
        if not session.ssh_conn and remote_type != "local":
            await self._setup_rclone_fallback(session, remote_type, remote_config, credential_data)
        
        self.sessions[session_id] = session
        return session_id
    
    async def _connect_ssh(
        self, 
        session: BrowseSession, 
        remote_config: dict, 
        credential_data: dict
    ):
        """Establish SSH connection for SFTP browsing."""
        host = remote_config.get("host", "")
        port = int(remote_config.get("port", 22))
        
        user = credential_data.get("user") or credential_data.get("username", "")
        password = credential_data.get("password", "")
        
        # Connect with SSH
        conn = await asyncssh.connect(
            host=host,
            port=port,
            username=user,
            password=password,
            known_hosts=None,  # Accept all host keys (for self-hosted servers)
            keepalive_interval=30,  # Keep connection alive
            keepalive_count_max=5
        )
        
        # Open SFTP session
        sftp = await conn.start_sftp_client()
        
        session.ssh_conn = conn
        session.sftp_client = sftp
        logger.info(f"SSH connection established to {host}:{port}")
    
    async def _setup_rclone_fallback(
        self,
        session: BrowseSession,
        remote_type: str,
        remote_config: dict,
        credential_data: Optional[dict]
    ):
        """Setup rclone named remote as fallback for non-SSH browsing."""
        temp_remote_name = f"_grabarr_browse_{session.session_id}"
        params = await self._build_rclone_params(remote_type, remote_config, credential_data)
        
        try:
            await rclone_manager.call("config/create", {
                "name": temp_remote_name,
                "type": remote_type,
                "parameters": params,
                "opt": {"obscure": True, "noOutput": True}
            })
            session.rclone_remote_name = temp_remote_name
            logger.info(f"Rclone fallback configured for session {session.session_id}")
        except Exception as e:
            logger.error(f"Failed to setup rclone fallback: {e}")
            raise
    
    async def _build_rclone_params(
        self, 
        remote_type: str, 
        remote_config: dict, 
        credential_data: Optional[dict]
    ) -> dict:
        """Build rclone remote parameters."""
        params = {}
        
        if remote_type == "local":
            return params
        
        if remote_type == "s3":
            params["provider"] = remote_config.get("provider", "AWS")
            if remote_config.get("endpoint"):
                params["endpoint"] = remote_config["endpoint"]
            if remote_config.get("region"):
                params["region"] = remote_config["region"]
            if params.get("provider") not in ["AWS"]:
                params["force_path_style"] = "true"
            
            if credential_data:
                if credential_data.get("access_key_id"):
                    params["access_key_id"] = credential_data["access_key_id"]
                if credential_data.get("secret_access_key"):
                    params["secret_access_key"] = credential_data["secret_access_key"]
            return params
        
        # SFTP, FTP, SMB
        if remote_config.get("host"):
            params["host"] = remote_config["host"]
        
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
        return None
    
    async def browse(self, session_id: str, path: str = "") -> List[dict]:
        """
        Browse a path using an existing session.
        
        Uses SSH/SFTP if available, otherwise falls back to rclone.
        Returns list of files/directories.
        """
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found or expired")
        
        # Build full path
        if session.base_path and session.base_path != "/":
            if path:
                full_path = f"{session.base_path.rstrip('/')}/{path.lstrip('/')}"
            else:
                full_path = session.base_path
        else:
            full_path = f"/{path.lstrip('/')}" if path else "/"
        
        # Use SSH/SFTP if available
        if session.sftp_client:
            return await self._browse_sftp(session, full_path)
        
        # Use local filesystem
        if session.remote_type == "local":
            return await self._browse_local(full_path)
        
        # Fall back to rclone
        return await self._browse_rclone(session, path)
    
    async def _browse_sftp(self, session: BrowseSession, path: str) -> List[dict]:
        """Browse directory using SFTP."""
        try:
            items = []
            async for entry in session.sftp_client.scandir(path):
                item = {
                    "Path": f"{path.rstrip('/')}/{entry.filename}",
                    "Name": entry.filename,
                    "Size": entry.attrs.size or 0,
                    "ModTime": datetime.fromtimestamp(
                        entry.attrs.mtime or 0, tz=timezone.utc
                    ).isoformat() if entry.attrs.mtime else "",
                    "IsDir": stat.S_ISDIR(entry.attrs.permissions or 0),
                    "MimeType": "inode/directory" if stat.S_ISDIR(entry.attrs.permissions or 0) else ""
                }
                items.append(item)
            
            logger.debug(f"SFTP browse {path}: {len(items)} items")
            return items
            
        except Exception as e:
            logger.error(f"SFTP browse failed for {path}: {e}")
            raise
    
    async def _browse_local(self, path: str) -> List[dict]:
        """Browse local filesystem."""
        import os as os_module
        
        items = []
        try:
            for entry in os_module.scandir(path):
                stat_info = entry.stat(follow_symlinks=False)
                items.append({
                    "Path": entry.path,
                    "Name": entry.name,
                    "Size": stat_info.st_size,
                    "ModTime": datetime.fromtimestamp(
                        stat_info.st_mtime, tz=timezone.utc
                    ).isoformat(),
                    "IsDir": entry.is_dir(follow_symlinks=False),
                    "MimeType": "inode/directory" if entry.is_dir() else ""
                })
        except PermissionError as e:
            logger.warning(f"Permission denied browsing {path}: {e}")
            raise
        
        return items
    
    async def _browse_rclone(self, session: BrowseSession, path: str) -> List[dict]:
        """Browse using rclone (fallback)."""
        if not session.rclone_remote_name:
            raise ValueError("No rclone remote configured for this session")
        
        fs_string = f"{session.rclone_remote_name}:{session.base_path}"
        
        try:
            result = await rclone_manager.call("operations/list", {
                "fs": fs_string,
                "remote": path,
                "opt": {"max_depth": 1}
            })
            return result.get("list", [])
        except Exception as e:
            logger.error(f"Rclone browse failed: {e}")
            raise
    
    async def end_session(self, session_id: str):
        """End a browse session and cleanup resources."""
        session = self.sessions.pop(session_id, None)
        if not session:
            return
        
        # Close SSH connection
        await session.close()
        
        # Cleanup rclone remote if used
        if session.rclone_remote_name:
            try:
                await rclone_manager.call("config/delete", {"name": session.rclone_remote_name})
            except Exception as e:
                logger.warning(f"Failed to cleanup rclone remote: {e}")
        
        logger.info(f"Ended browse session {session_id}")
    
    def get_active_count(self) -> int:
        """Return count of active sessions."""
        return len(self.sessions)


# Global instance
browse_session_manager = BrowseSessionManager()
