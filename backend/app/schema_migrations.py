"""
Schema migration utilities for database schema changes.

This module provides utilities to check and update the database schema
when new columns or tables are added. Migrations run automatically on startup.
"""

import logging
from sqlalchemy import text, inspect
from .db import AsyncSessionLocal, engine

logger = logging.getLogger(__name__)


async def check_column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    async with engine.begin() as conn:
        result = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).has_table(table_name)
        )
        if not result:
            return False
        
        # Get column info
        columns = await conn.run_sync(
            lambda sync_conn: [col["name"] for col in inspect(sync_conn).get_columns(table_name)]
        )
        return column_name in columns


async def add_column_if_missing(table_name: str, column_name: str, column_def: str):
    """Add a column to a table if it doesn't exist."""
    exists = await check_column_exists(table_name, column_name)
    if not exists:
        logger.info(f"Adding column {column_name} to {table_name}")
        async with engine.begin() as conn:
            await conn.execute(
                text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}")
            )
        logger.info(f"✓ Column {column_name} added successfully")
        return True
    else:
        logger.debug(f"Column {column_name} already exists in {table_name}")
        return False


async def run_schema_migrations():
    """
    Run all schema migrations.
    
    This function checks for missing columns and adds them if needed.
    Called automatically on application startup.
    """
    logger.info("Checking for schema migrations...")
    
    migrations_run = 0
    
    # Migration: Add sequential_transfer to jobs table
    if await add_column_if_missing("jobs", "sequential_transfer", "BOOLEAN DEFAULT 0"):
        migrations_run += 1
    
    # Migration: Add preserve_metadata to jobs table
    if await add_column_if_missing("jobs", "preserve_metadata", "BOOLEAN DEFAULT 0"):
        migrations_run += 1
    
    if migrations_run > 0:
        logger.info(f"Schema migrations complete: {migrations_run} columns added")
    else:
        logger.info("Schema is up to date")
