from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..db import get_db
from ..models import Remote, Credential
from ..runner import job_runner
from ..rclone import rclone_manager
from typing import Optional, List

router = APIRouter()

class TestJobRequest(BaseModel):
    source_remote_id: int
    dest_remote_id: int
    operation: str = "copy"

class TestJobResponse(BaseModel):
    success: bool
    connectivity_check: str
    files_to_transfer: int
    total_files_scanned: int
    sample_files: List[str]
    error: Optional[str] = None

@router.post("/test", response_model=TestJobResponse)
async def test_job(req: TestJobRequest, db: AsyncSession = Depends(get_db)):
    # 1. Resolve Remotes
    result = await db.execute(select(Remote).where(Remote.id == req.source_remote_id))
    source = result.scalars().first()
    
    result = await db.execute(select(Remote).where(Remote.id == req.dest_remote_id))
    dest = result.scalars().first()
    
    if not source or not dest:
         raise HTTPException(status_code=404, detail="Source or Destination remote not found")

    # 2. Resolve Credentials
    source_cred = None
    if source.credential_id:
        source_cred = (await db.execute(select(Credential).where(Credential.id == source.credential_id))).scalars().first()
        
    dest_cred = None
    if dest.credential_id:
        dest_cred = (await db.execute(select(Credential).where(Credential.id == dest.credential_id))).scalars().first()

    # 3. Get FS Strings
    src_fs = await job_runner.get_fs_string(source, source_cred)
    dst_fs = await job_runner.get_fs_string(dest, dest_cred)

    try:
        # Use operations/list for connectivity verification
        # This is faster and safer than a full 'check' for a quick test button
        
        # Test Source
        list_src = await rclone_manager.call("operations/list", {
            "fs": src_fs,
            "remote": "",
            "opt": { "recurse": True } 
        })
        
        # Test Destination (just connectivity)
        await rclone_manager.call("operations/list", {
            "fs": dst_fs,
            "remote": "",
            "opt": { "max_depth": 1 }
        })
        
        items = list_src.get("list", [])
        total = len(items)
        # Return ALL files as requested
        sample = [x['Path'] for x in items] 
        
        return TestJobResponse(
            success=True,
            connectivity_check="Connectivity Verified for Source and Destination.",
            files_to_transfer=total, 
            total_files_scanned=total,
            sample_files=sample
        )

    except Exception as e:
         return TestJobResponse(
            success=False,
            connectivity_check="Connectivity Failed",
            files_to_transfer=0,
            total_files_scanned=0,
            sample_files=[],
            error=str(e)
        )
