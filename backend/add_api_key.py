
import asyncio
from sqlalchemy import select
from app.db import AsyncSessionLocal
from app.models import APIKey

async def add_key():
    key_val = "gk_wKGFnQe8uzkXfkNqeMQStRuJXSgkBHCYtyc4Pa5UvbM"
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(APIKey).where(APIKey.key == key_val))
        existing = result.scalars().first()
        if existing:
            print(f"Key already exists: {existing.name}")
        else:
            new_key = APIKey(name="TestKey", key=key_val)
            db.add(new_key)
            await db.commit()
            print("Key added successfully")

if __name__ == "__main__":
    asyncio.run(add_key())
