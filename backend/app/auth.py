"""
Authentication module for grabarr.
Implements JWT with device fingerprinting for session hijacking protection.
"""
import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
from jose import jwt, JWTError
from fastapi import Request, HTTPException, Depends, status
from fastapi.security import HTTPBearer
from sqlalchemy import select

from .db import AsyncSessionLocal
from .models import AdminUser, SystemSettings

# JWT Configuration
JWT_SECRET_KEY = secrets.token_urlsafe(32)  # Generated on startup
JWT_ALGORITHM = "HS256"
DEFAULT_SESSION_DAYS = 7

security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


def create_fingerprint(request: Request) -> str:
    """
    Create a device fingerprint from request headers.
    Uses User-Agent + first 2 IP octets for some flexibility with dynamic IPs.
    """
    user_agent = request.headers.get("user-agent", "unknown")
    
    # Get client IP (handle proxies)
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "0.0.0.0"
    
    # Use first 2 octets only (allows for same ISP dynamic IP changes)
    ip_parts = client_ip.split(".")
    partial_ip = ".".join(ip_parts[:2]) if len(ip_parts) >= 2 else client_ip
    
    # Create hash
    fingerprint_data = f"{user_agent}:{partial_ip}:{JWT_SECRET_KEY}"
    return hashlib.sha256(fingerprint_data.encode()).hexdigest()[:32]


async def get_session_duration_days() -> int:
    """Get configured session duration from system settings."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SystemSettings).where(SystemSettings.key == "session_duration_days")
            )
            setting = result.scalars().first()
            if setting and setting.value is not None:
                return int(setting.value)
    except Exception:
        pass
    return DEFAULT_SESSION_DAYS


def create_jwt_token(user_id: int, username: str, fingerprint: str, expires_days: int = None) -> str:
    """Create a JWT token with embedded fingerprint."""
    if expires_days is None:
        expires_days = DEFAULT_SESSION_DAYS
    
    expires = datetime.now(timezone.utc) + timedelta(days=expires_days)
    
    payload = {
        "sub": str(user_id),
        "username": username,
        "fingerprint": fingerprint,
        "exp": expires,
        "iat": datetime.now(timezone.utc)
    }
    
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_jwt_token(token: str, request_fingerprint: str) -> Optional[dict]:
    """
    Verify JWT token and check fingerprint matches.
    Returns payload if valid, None if invalid.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        
        # Check fingerprint matches
        token_fingerprint = payload.get("fingerprint")
        if token_fingerprint != request_fingerprint:
            return None  # Session hijacking attempt
        
        return payload
    except JWTError:
        return None


async def get_admin_user() -> Optional[AdminUser]:
    """Get the admin user if one exists."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AdminUser))
        return result.scalars().first()


async def admin_exists() -> bool:
    """Check if an admin user has been set up."""
    user = await get_admin_user()
    return user is not None


async def get_current_user(request: Request) -> dict:
    """
    FastAPI dependency to get the current authenticated user.
    Raises HTTPException if not authenticated.
    """
    # Check for API key header first (for external API access)
    api_key = request.headers.get("x-api-key")
    if api_key:
        # Validate API key
        async with AsyncSessionLocal() as db:
            from .models import APIKey
            result = await db.execute(select(APIKey).where(APIKey.key == api_key))
            key = result.scalars().first()
            if key:
                return {"id": 0, "username": f"api:{key.name}", "is_api_key": True}
    
    # Check for JWT in cookie
    token = request.cookies.get("grabarr_session")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    # Verify token with fingerprint
    fingerprint = create_fingerprint(request)
    payload = verify_jwt_token(token, fingerprint)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session"
        )
    
    return {
        "id": int(payload["sub"]),
        "username": payload["username"],
        "is_api_key": False
    }


async def optional_auth(request: Request) -> Optional[dict]:
    """
    Optional authentication - returns user if authenticated, None otherwise.
    Useful for routes that work with or without auth.
    """
    try:
        return await get_current_user(request)
    except HTTPException:
        return None
