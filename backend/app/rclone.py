import httpx
import subprocess
import asyncio
import logging
import os
import secrets

logger = logging.getLogger(__name__)

# Configurable timeout for rclone API calls (in seconds)
# SFTP/SSH connections can take longer to establish, especially over slow networks
RCLONE_TIMEOUT = int(os.environ.get("GRABARR_RCLONE_TIMEOUT", "60"))

# SECURITY: Rclone RC authentication credentials
# Auto-generated on first run and persisted
RCLONE_AUTH_PATH = os.environ.get("GRABARR_RCLONE_AUTH_PATH", "/config/.rclone_auth")
# Fallback for development
if not os.path.exists(os.path.dirname(RCLONE_AUTH_PATH)) and RCLONE_AUTH_PATH == "/config/.rclone_auth":
    RCLONE_AUTH_PATH = os.path.join(os.path.dirname(__file__), "..", ".rclone_auth")


def get_rclone_credentials():
    """Get or generate rclone RC authentication credentials."""
    auth_path = os.path.abspath(RCLONE_AUTH_PATH)
    
    if os.path.exists(auth_path):
        try:
            with open(auth_path, "r") as f:
                lines = f.read().strip().split("\n")
                if len(lines) >= 2:
                    return lines[0], lines[1]
        except Exception as e:
            logger.error(f"Failed to read rclone auth from {auth_path}: {e}")
    
    # Generate new credentials
    logger.info(f"Generating new rclone RC credentials at {auth_path}")
    username = "grabarr"
    password = secrets.token_urlsafe(24)
    
    # Ensure directory exists
    auth_dir = os.path.dirname(auth_path)
    if auth_dir:
        os.makedirs(auth_dir, exist_ok=True)
    
    try:
        with open(auth_path, "w") as f:
            f.write(f"{username}\n{password}\n")
        os.chmod(auth_path, 0o600)
    except Exception as e:
        logger.warning(f"Could not persist rclone credentials: {e}")
    
    return username, password


class RcloneManager:
    def __init__(self, rc_url="http://localhost:5572"):
        self.rc_url = rc_url
        self.process = None
        self.username = None
        self.password = None

    async def start_daemon(self):
        """Starts the rclone rc daemon with authentication."""
        import shutil
        
        # Get authentication credentials
        self.username, self.password = get_rclone_credentials()
        
        # Try local binary first, then system PATH
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        local_rclone = os.path.join(base_dir, "bin", "rclone")
        
        if os.path.exists(local_rclone):
            rclone_bin = local_rclone
        else:
            # Check system PATH
            system_rclone = shutil.which("rclone")
            if system_rclone:
                rclone_bin = system_rclone
            else:
                logger.warning("Rclone not found locally or in system PATH. File transfers will not work.")
                logger.warning("Install rclone: https://rclone.org/install/")
                return
        
        # SECURITY: Use authentication for rclone RC daemon and bind to localhost only
        cmd = [
            rclone_bin, "rcd",
            "--rc-user", self.username,
            "--rc-pass", self.password,
            "--rc-addr", "localhost:5572"  # Bind to localhost only
        ]
        try:
            self.process = subprocess.Popen(cmd)
            logger.info(f"Rclone daemon started from {rclone_bin} with authentication")
            # Wait a bit for it to come up
            await asyncio.sleep(1)
        except FileNotFoundError:
            logger.error(f"Rclone executable not found at {rclone_bin}")


    def stop_daemon(self):
        if self.process:
            self.process.terminate()

    async def call(self, command: str, params: dict = None):
        """Make authenticated call to rclone RC API."""
        async with httpx.AsyncClient(timeout=RCLONE_TIMEOUT) as client:
            try:
                # SECURITY: Use basic auth for rclone API calls
                auth = (self.username, self.password) if self.username else None
                resp = await client.post(
                    f"{self.rc_url}/{command}",
                    json=params,
                    auth=auth
                )
                resp.raise_for_status()
                return resp.json()
            except httpx.TimeoutException as e:
                logger.error(f"Rclone call timed out after {RCLONE_TIMEOUT}s on {command}: {type(e).__name__}")
                raise
            except httpx.HTTPStatusError as e:
                logger.error(f"Rclone call failed with HTTP {e.response.status_code} on {command}: {e.response.text}")
                raise
            except Exception as e:
                logger.error(f"Rclone call failed on {command}: {type(e).__name__}: {e}")
                raise

rclone_manager = RcloneManager()
