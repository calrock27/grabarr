
import asyncio
from sqlalchemy import select
from app.db import AsyncSessionLocal
from app.models import AdminUser
from app.auth import hash_password

async def reset():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AdminUser))
        user = result.scalars().first()
        if user:
            print(f"Found user {user.username}. Resetting password...")
            user.password_hash = hash_password("password123")
            await db.commit()
            print("Password reset to 'password123'")
        else:
            print("No user found.")

if __name__ == "__main__":
    asyncio.run(reset())
