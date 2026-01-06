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
        
        # Load all schedule templates for lookup
        from .models import ScheduleTemplate
        templates_result = await session.execute(select(ScheduleTemplate))
        templates = {t.name: t for t in templates_result.scalars().all()}
        
        for job in jobs:
            if job.schedule and job.schedule != "Manual":
                # Check if schedule is a template name or a cron expression
                cron_expr = job.schedule
                
                if job.schedule in templates:
                    # It's a template name, get the cron from config
                    template = templates[job.schedule]
                    if template.schedule_type == 'cron' and template.config.get('cron'):
                        cron_expr = template.config['cron']
                    elif template.schedule_type == 'interval':
                        # Convert interval to cron (approximate)
                        minutes = template.config.get('minutes', 0)
                        hours = template.config.get('hours', 0)
                        if minutes and minutes > 0:
                            cron_expr = f"*/{minutes} * * * *"
                        elif hours and hours > 0:
                            cron_expr = f"0 */{hours} * * *"
                        else:
                            logger.warning(f"Invalid interval config for template {template.name}")
                            continue
                    else:
                        logger.warning(f"Unknown schedule type for template {template.name}: {template.schedule_type}")
                        continue
                
                add_scheduler_job(job.id, cron_expr)

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
