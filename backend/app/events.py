import asyncio
import logging
from typing import List
from starlette.responses import StreamingResponse

logger = logging.getLogger(__name__)

class EventManager:
    def __init__(self):
        self.subscribers: List[asyncio.Queue] = []

    async def subscribe(self):
        queue = asyncio.Queue()
        self.subscribers.append(queue)
        try:
            while True:
                data = await queue.get()
                yield f"data: {data}\n\n"
        except asyncio.CancelledError:
            self.subscribers.remove(queue)
            logger.info("Subscriber disconnected")

    async def publish(self, message: str):
        if self.subscribers:
            logger.info(f"Publishing to {len(self.subscribers)} subscribers")
        for queue in self.subscribers:
            await queue.put(message)

event_manager = EventManager()
