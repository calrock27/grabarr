"""
CLI commands for grabarr administration.
Run with: python -m app.cli <command>
"""
import argparse
import asyncio
import getpass
import sys

from sqlalchemy import select
from .db import AsyncSessionLocal, engine
from .models import AdminUser, Base
from .auth import hash_password


async def reset_password():
    """Reset the admin user password."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AdminUser))
        user = result.scalars().first()
        
        if not user:
            print("No admin user exists. Please use the web setup wizard first.")
            sys.exit(1)
        
        print(f"Resetting password for user: {user.username}")
        
        # Get new password
        while True:
            password = getpass.getpass("Enter new password: ")
            if len(password) < 8:
                print("Password must be at least 8 characters.")
                continue
            
            confirm = getpass.getpass("Confirm new password: ")
            if password != confirm:
                print("Passwords do not match.")
                continue
            
            break
        
        # Update password
        user.password_hash = hash_password(password)
        await db.commit()
        
        print("Password reset successfully!")


async def show_user():
    """Show the current admin username."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AdminUser))
        user = result.scalars().first()
        
        if not user:
            print("No admin user configured.")
        else:
            print(f"Admin username: {user.username}")
            print(f"Created: {user.created_at}")


async def create_tables():
    """Create database tables if they don't exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables created/verified.")


def main():
    parser = argparse.ArgumentParser(description="Grabarr CLI administration")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    subparsers.add_parser("reset-password", help="Reset the admin password")
    subparsers.add_parser("show-user", help="Show the admin username")
    subparsers.add_parser("init-db", help="Initialize database tables")
    
    args = parser.parse_args()
    
    if args.command == "reset-password":
        asyncio.run(reset_password())
    elif args.command == "show-user":
        asyncio.run(show_user())
    elif args.command == "init-db":
        asyncio.run(create_tables())
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
