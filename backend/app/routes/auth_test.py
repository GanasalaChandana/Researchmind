"""Minimal test auth router"""
from fastapi import APIRouter

router = APIRouter(prefix="/auth-test", tags=["test"])

@router.get("/ping")
async def ping():
    """Test endpoint to verify router can be registered"""
    return {"message": "Auth test router is working!"}
