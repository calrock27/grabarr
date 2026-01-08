import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

# Database path - configurable via environment variable
DATABASE_PATH = os.environ.get("GRABARR_DB_PATH", "/config/grabarr.db")

# Fallback for development (relative to backend dir)
if not os.path.exists(os.path.dirname(DATABASE_PATH)) and DATABASE_PATH == "/config/grabarr.db":
    DATABASE_PATH = os.path.join(os.path.dirname(__file__), "..", "grabarr.db")

DATABASE_PATH = os.path.abspath(DATABASE_PATH)
DATABASE_URL = f"sqlite+aiosqlite:///{DATABASE_PATH}"

engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

Base = declarative_base()

def get_database_path() -> str:
    """Get the resolved database file path (for backup purposes)."""
    return DATABASE_PATH

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
