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
        # Use local binary
        import os
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        rclone_bin = os.path.join(base_dir, "bin", "rclone") 
        cmd = [rclone_bin, "rcd", "--rc-no-auth", "--rc-addr", ":5572"]
        try:
            self.process = subprocess.Popen(cmd)
            logger.info("Rclone daemon started")
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
