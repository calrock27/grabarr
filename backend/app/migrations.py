"""
Migration script to encrypt existing plain-text credentials.

This script should be run on first startup after upgrading to a version
with credential encryption. It will:
1. Load all credentials from the database
2. Check if each credential's data is already encrypted
3. Encrypt any plain-text credentials and update the database

Usage: Called automatically from main.py on startup
"""

import asyncio
import logging
from sqlalchemy import select
from .db import AsyncSessionLocal
from .models import Credential
from .crypto import encrypt_credential_data, is_encrypted, get_or_create_key

logger = logging.getLogger(__name__)


async def migrate_credentials():
    """
    Migrate existing plain-text credentials to encrypted format.
    
    Returns:
        tuple: (migrated_count, skipped_count, error_count)
    """
    # Ensure encryption key exists
    get_or_create_key()
    
    migrated = 0
    skipped = 0
    errors = 0
    
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Credential))
        credentials = result.scalars().all()
        
        for cred in credentials:
            try:
                # Check if already encrypted
                if is_encrypted(cred.data):
                    skipped += 1
                    continue
                
                # Data is plain text (dict or unencrypted string)
                if isinstance(cred.data, dict):
                    # Encrypt the plain dict
                    encrypted = encrypt_credential_data(cred.data)
                    cred.data = encrypted
                    migrated += 1
                    logger.info(f"Migrated credential: {cred.name} (ID: {cred.id})")
                elif cred.data is None or cred.data == "":
                    # Empty data, encrypt as empty
                    cred.data = encrypt_credential_data({})
                    migrated += 1
                else:
                    # Unknown format, skip with warning
                    logger.warning(f"Unknown credential format for {cred.name} (ID: {cred.id}), skipping")
                    skipped += 1
                    
            except Exception as e:
                logger.error(f"Failed to migrate credential {cred.name} (ID: {cred.id}): {e}")
                errors += 1
        
        if migrated > 0:
            await db.commit()
            logger.info(f"Credential migration complete: {migrated} migrated, {skipped} already encrypted, {errors} errors")
    
    return migrated, skipped, errors


async def check_and_migrate():
    """
    Check if migration is needed and perform it.
    Called on application startup.
    """
    try:
        # Check if any credentials exist
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Credential).limit(1))
            first_cred = result.scalars().first()
            
            if first_cred is None:
                logger.info("No credentials to migrate")
                return
            
            # Check if first credential is already encrypted
            if is_encrypted(first_cred.data):
                logger.info("Credentials are already encrypted")
                return
        
        # Migration needed
        logger.info("Starting credential encryption migration...")
        migrated, skipped, errors = await migrate_credentials()
        
        if errors > 0:
            logger.warning(f"Migration completed with {errors} errors")
        else:
            logger.info(f"Migration completed successfully")
            
    except Exception as e:
        logger.error(f"Credential migration failed: {e}")
        raise
