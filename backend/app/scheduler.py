from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.triggers.cron import CronTrigger
from .db import DATABASE_URL, AsyncSessionLocal
from .models import Job
from sqlalchemy.future import select
import logging
import json

logger = logging.getLogger(__name__)

# We need to parse the async url to a sync one for apscheduler internal use or use a different store
# But APScheduler 3.x usually needs sync drivers for stores. 
# For simplicity, we can use a separate memory store or a sync sqlite url.
# Let's use a simple memory store for now to get started, or a file-based sqlite.

jobstores = {
    'default': SQLAlchemyJobStore(url='sqlite:///jobs.sqlite')
}

scheduler = AsyncIOScheduler(jobstores=jobstores)

async def run_job_wrapper(job_id: int):
    # This will be called by APScheduler
    from .runner import job_runner
    logger.info(f"Scheduled run triggered for job {job_id}")
    await job_runner.run_job(job_id, execution_type="schedule")

def add_scheduler_job(job_id: int, cron_expression: str):
    try:
        # Use str(job_id) as identifier for APScheduler
        scheduler.add_job(
            run_job_wrapper,
            CronTrigger.from_crontab(cron_expression),
            id=str(job_id),
            replace_existing=True,
            args=[job_id]
        )
        logger.info(f"Added job {job_id} to scheduler with cron: {cron_expression}")
    except Exception as e:
        logger.error(f"Failed to add job {job_id} to scheduler: {e}")

def remove_scheduler_job(job_id: int):
    try:
        scheduler.remove_job(str(job_id))
        logger.info(f"Removed job {job_id} from scheduler")
    except Exception as e:
        # Ignore if job not found
        pass

async def sync_scheduler_jobs():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Job).where(Job.enabled == True))
        jobs = result.scalars().all()
        for job in jobs:
            if job.schedule and job.schedule != "Manual":
                add_scheduler_job(job.id, job.schedule)

def start_scheduler():
    scheduler.start()
    logger.info("Scheduler started")

def shutdown_scheduler():
    scheduler.shutdown()

def get_job_next_run(job_id: int):
    # APScheduler uses string IDs
    aps_job = scheduler.get_job(str(job_id))
    if aps_job:
        return aps_job.next_run_time
    return None
