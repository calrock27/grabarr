from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import engine, Base
from .rclone import rclone_manager
from .scheduler import start_scheduler, shutdown_scheduler, sync_scheduler_jobs
from .migrations import check_and_migrate
from .api.endpoints import router as api_router
import logging

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="grabarr", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from .routers import test

app.include_router(api_router, prefix="/api")
app.include_router(test.router, prefix="/api/jobs", tags=["jobs"])

@app.on_event("startup")
async def startup():
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Run credential encryption migration
    await check_and_migrate()
    
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
