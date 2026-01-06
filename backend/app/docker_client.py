import docker
import logging

logger = logging.getLogger(__name__)

class DockerClient:
    def __init__(self):
        self.client = None
        self._connect()

    def _connect(self):
        try:
            self.client = docker.from_env()
            self.client.ping()
        except Exception as e:
            logger.warning(f"Docker unavailable: {e}")
            self.client = None

    def is_available(self) -> bool:
        if self.client is None:
            self._connect()
        try:
            return self.client and self.client.ping()
        except:
            return False

    def list_containers(self):
        if not self.is_available():
            raise Exception("Docker not available")
        
        try:
            # List only running containers
            containers = self.client.containers.list() 
            return [
                {
                    "id": c.id[:12],
                    "name": c.name,
                    "image": c.image.tags[0] if c.image.tags else c.image.id[:12],
                    "status": c.status
                }
                for c in containers
            ]
        except Exception as e:
            logger.error(f"Failed to list containers: {e}")
            return []

docker_client = DockerClient()
