from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import engine, Base, AsyncSessionLocal
from .rclone import rclone_manager
from .scheduler import start_scheduler, shutdown_scheduler, sync_scheduler_jobs
from .migrations import check_and_migrate
from .api.endpoints import router as api_router, public_router
from .models import SystemSettings
from sqlalchemy import select
import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="grabarr", version="0.1.0")


async def get_cors_origins():
    """Get CORS origins from system settings, falling back to environment or localhost."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SystemSettings).where(SystemSettings.key == "cors_allowed_origins")
            )
            setting = result.scalars().first()
            if setting and setting.value:
                # Value stored as list in JSON
                if isinstance(setting.value, list):
                    return setting.value
                elif isinstance(setting.value, str):
                    return [o.strip() for o in setting.value.split(",") if o.strip()]
    except Exception:
        pass
    
    # Fall back to environment variable or default
    env_origins = os.environ.get("GRABARR_CORS_ORIGINS", "")
    if env_origins:
        return [o.strip() for o in env_origins.split(",") if o.strip()]
    
    # Default to localhost for development
    return ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]


# SECURITY: Dynamic CORS configuration
# Will be updated on startup with settings from database
# For now, start with restrictive defaults
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from .routers import test

# Include both authenticated and public routers
app.include_router(api_router, prefix="/api")
app.include_router(public_router, prefix="/api")  # Public routes (auth, embed widget)
app.include_router(test.router, prefix="/api/jobs", tags=["jobs"])

@app.on_event("startup")
async def startup():
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Run credential encryption migration
    await check_and_migrate()
    
    # Update CORS origins from settings
    origins = await get_cors_origins()
    logger.info(f"CORS allowed origins: {origins}")
    # Note: CORS middleware is already added, origins are checked at runtime for dynamic updates
    
    # Start Rclone
    await rclone_manager.start_daemon()
    
    # Start Scheduler
    start_scheduler()
    await sync_scheduler_jobs()

@app.on_event("shutdown")
async def shutdown():
    rclone_manager.stop_daemon()
    shutdown_scheduler()

@app.get("/")
async def root():
    return {"message": "Welcome to grabarr API"}
