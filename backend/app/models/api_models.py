from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class APIKey(BaseModel):
    """API Key model"""
    key: str
    created_at: str
    last_used: Optional[str] = None
    requests_count: int = 0
    is_active: bool = True


class APIRequest(BaseModel):
    """Generic API request model"""
    topic: str
    depth: int = 3
    custom_prompts: Optional[list[str]] = None


class APIResponse(BaseModel):
    """Generic API response model"""
    success: bool
    data: Optional[dict] = None
    error: Optional[str] = None
    timestamp: str = ""

    def __init__(self, **data):
        if not data.get("timestamp"):
            data["timestamp"] = datetime.utcnow().isoformat()
        super().__init__(**data)


class ResearchAPIResponse(BaseModel):
    """Research API response with session info"""
    success: bool
    session_id: str
    status: str  # "queued" | "running" | "completed" | "failed"
    topic: str
    created_at: str
    data: Optional[dict] = None
    error: Optional[str] = None


class ReportAPIResponse(BaseModel):
    """Report API response"""
    success: bool
    session_id: str
    topic: str
    summary: str
    sections: list[dict]
    sources: list[dict]
    knowledge_graph: dict
    status: str
    created_at: str
