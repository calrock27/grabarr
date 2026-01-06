import httpx
import subprocess
import asyncio
import logging

logger = logging.getLogger(__name__)

class RcloneManager:
    def __init__(self, rc_url="http://localhost:5572"):
        self.rc_url = rc_url
        self.process = None

    async def start_daemon(self):
        """Starts the rclone rc daemon."""
        import os
        import shutil
        
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
        
        cmd = [rclone_bin, "rcd", "--rc-no-auth", "--rc-addr", ":5572"]
        try:
            self.process = subprocess.Popen(cmd)
            logger.info(f"Rclone daemon started from {rclone_bin}")
            # Wait a bit for it to come up
            await asyncio.sleep(1)
        except FileNotFoundError:
            logger.error(f"Rclone executable not found at {rclone_bin}")


    def stop_daemon(self):
        if self.process:
            self.process.terminate()

    async def call(self, command: str, params: dict = None):
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(f"{self.rc_url}/{command}", json=params)
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                logger.error(f"Rclone call failed: {e}")
                raise

rclone_manager = RcloneManager()
