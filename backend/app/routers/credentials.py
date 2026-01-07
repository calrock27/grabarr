"""
Credentials router module.

Handles all credential-related API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional

from ...db import AsyncSessionLocal, get_db
from ...models import Credential
from ...crypto import encrypt_credential_data, decrypt_credential_data
from ...list_params import apply_list_params
from ...schemas import CredentialCreate, CredentialRead
from ...utils import mask_sensitive_data
from ..endpoints import log_activity

router = APIRouter(prefix="/credentials", tags=["credentials"])


@router.post("", response_model=CredentialRead)
async def create_credential(cred: CredentialCreate, db: AsyncSession = Depends(get_db)):
    """Create a new credential with encrypted storage."""
    encrypted_data = encrypt_credential_data(cred.data)
    db_cred = Credential(name=cred.name, type=cred.type, data=encrypted_data)
    db.add(db_cred)
    await log_activity(db, "create", "credential", None, {"name": cred.name})
    await db.commit()
    await db.refresh(db_cred)
    return CredentialRead(id=db_cred.id, name=db_cred.name, type=db_cred.type, data={})


@router.get("", response_model=List[CredentialRead])
async def list_credentials(
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = "asc",
    db: AsyncSession = Depends(get_db)
):
    """List all credentials with masked sensitive data."""
    query = select(Credential)
    query = apply_list_params(query, Credential, search, sort_by, sort_order, ["name", "type"])
    result = await db.execute(query)
    creds = result.scalars().all()
    
    masked_creds = []
    for cred in creds:
        decrypted_data = decrypt_credential_data(cred.data)
        masked_data = mask_sensitive_data(decrypted_data)
        masked_creds.append(CredentialRead(
            id=cred.id,
            name=cred.name,
            type=cred.type,
            data=masked_data
        ))
        
    return masked_creds


@router.put("/{credential_id}", response_model=CredentialRead)
async def update_credential(credential_id: int, cred: CredentialCreate, db: AsyncSession = Depends(get_db)):
    """Update a credential with smart masked field handling."""
    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = select(Credential).where(Credential.id == credential_id)
            result = await session.execute(stmt)
            db_cred = result.scalar_one_or_none()
            
            if not db_cred:
                raise HTTPException(status_code=404, detail="Credential not found")
            
            db_cred.name = cred.name
            db_cred.type = cred.type
            
            # Decrypt existing data for comparison
            current_data = decrypt_credential_data(db_cred.data)
            new_data = cred.data or {}
            
            # Smart Update: If value is "******", keep existing
            final_data = {}
            for key in new_data:
                if new_data[key] == "******":
                    final_data[key] = current_data.get(key, "")
                else:
                    final_data[key] = new_data[key]
            
            db_cred.data = encrypt_credential_data(final_data)
            await log_activity(session, "update", "credential", credential_id, {"name": cred.name})
    
    return CredentialRead(
        id=credential_id, 
        name=cred.name, 
        type=cred.type, 
        data=mask_sensitive_data(final_data)
    )


@router.delete("/{credential_id}")
async def delete_credential(credential_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a credential by ID."""
    result = await db.execute(select(Credential).where(Credential.id == credential_id))
    db_cred = result.scalar_one_or_none()
    
    if not db_cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    
    await db.delete(db_cred)
    await log_activity(db, "delete", "credential", credential_id, {"name": db_cred.name})
    await db.commit()
    return {"ok": True}
