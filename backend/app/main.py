from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import engine, Base, AsyncSessionLocal
from .rclone import rclone_manager
from .scheduler import start_scheduler, shutdown_scheduler, sync_scheduler_jobs
from .browse_sessions import browse_session_manager
from .migrations import check_and_migrate
from .api.endpoints import router as api_router, public_router
from .models import SystemSettings
from sqlalchemy import select
import logging
import os

# Configurable log level via environment variable
# Valid values: DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_LEVEL = os.environ.get("GRABARR_LOG_LEVEL", "INFO").upper()
LOG_LEVEL_MAP = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}
logging.basicConfig(
    level=LOG_LEVEL_MAP.get(LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)
logger.info(f"Log level set to: {LOG_LEVEL}")

app = FastAPI(title="grabarr", version="0.1.0")


async def get_cors_settings_from_db():
    """Get CORS settings from system settings, falling back to environment."""
    try:
        async with AsyncSessionLocal() as db:
            # Get allowed origins
            result = await db.execute(
                select(SystemSettings).where(SystemSettings.key == "cors_allowed_origins")
            )
            setting = result.scalars().first()
            origins = []
            if setting and setting.value:
                if isinstance(setting.value, list):
                    origins = setting.value
                elif isinstance(setting.value, str):
                    origins = [o.strip() for o in setting.value.split(",") if o.strip()]
            
            # Get allow all setting
            result = await db.execute(
                select(SystemSettings).where(SystemSettings.key == "cors_allow_all")
            )
            allow_all_setting = result.scalars().first()
            allow_all = False
            if allow_all_setting and allow_all_setting.value:
                allow_all = str(allow_all_setting.value).lower() == "true"
                
            return {"origins": origins, "allow_all": allow_all}
    except Exception:
        pass
    
    # Fall back to environment variable
    env_origins = os.environ.get("GRABARR_CORS_ORIGINS", "")
    origins = [o.strip() for o in env_origins.split(",") if o.strip()] if env_origins else []
    
    return {"origins": origins, "allow_all": False}


# SECURITY: Dynamic CORS configuration
# Will be updated on startup with settings from database
app.add_middleware(
    CORSMiddleware,
    allow_origins=[], # Started as empty, updated dynamically or via regex
    allow_origin_regex=None,
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
    cors_settings = await get_cors_settings_from_db()
    origins = cors_settings["origins"]
    allow_all = cors_settings["allow_all"]
    
    logger.info(f"CORS origins: {origins}, Allow All: {allow_all}")
    
    # Update middleware directly
    for middleware in app.user_middleware:
        if middleware.cls == CORSMiddleware:
            if allow_all:
                middleware.kwargs["allow_origin_regex"] = ".*"
                middleware.kwargs["allow_origins"] = []
            else:
                middleware.kwargs["allow_origins"] = origins
                middleware.kwargs["allow_origin_regex"] = None
    
    # Start Rclone
    await rclone_manager.start_daemon()
    
    # Start Browse Session Manager
    await browse_session_manager.start()
    
    # Start Scheduler
    start_scheduler()
    await sync_scheduler_jobs()

@app.on_event("shutdown")
async def shutdown():
    # Stop browse sessions first (uses rclone)
    await browse_session_manager.stop()
    rclone_manager.stop_daemon()
    shutdown_scheduler()

@app.get("/")
async def root():
    return {"message": "Welcome to grabarr API"}
