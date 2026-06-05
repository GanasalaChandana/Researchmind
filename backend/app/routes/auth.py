"""Auth routes - minimal test version"""
from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/test")
async def test_auth():
    """Minimal test endpoint"""
    return {"message": "Auth router test endpoint"}
