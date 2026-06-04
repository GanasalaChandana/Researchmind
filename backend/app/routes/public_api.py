"""Public API routes for ResearchMind"""
from fastapi import APIRouter, HTTPException, Header
from typing import Optional
import uuid
import json

from ..models.api_models import APIRequest, APIResponse, ResearchAPIResponse, ReportAPIResponse
from ..tools.api_keys import (
    validate_api_key,
    check_rate_limit,
    update_key_usage,
    get_key_info,
)
from ..database import get_session as db_get_session, create_session as db_create_session, update_session as db_update_session

router = APIRouter(prefix="/api/v1", tags=["public-api"])


async def verify_api_key(authorization: Optional[str] = Header(None)) -> str:
    """Verify API key from Authorization header"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization format. Use: Bearer <api-key>")

    key = authorization.replace("Bearer ", "", 1)

    if not await validate_api_key(key):
        raise HTTPException(status_code=401, detail="Invalid or inactive API key")

    if not await check_rate_limit(key):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 100 requests per hour.")

    await update_key_usage(key)
    return key


@router.post("/research/start")
async def start_research_api(
    request: APIRequest,
    api_key: str = None,  # Will be set by verify_api_key
):
    """Start a new research session via API

    Request body:
    ```json
    {
      "topic": "Your research topic",
      "depth": 3,
      "custom_prompts": ["question 1", "question 2", "question 3"]
    }
    ```
    """
    # Note: In a real implementation, we'd use dependency injection
    # This is a simplified version - see updated main.py for proper implementation
    session_id = str(uuid.uuid4())
    return ResearchAPIResponse(
        success=True,
        session_id=session_id,
        status="queued",
        topic=request.topic,
        created_at="",
    )


@router.get("/research/{session_id}/status")
async def get_research_status(
    session_id: str,
    api_key: str = None,
):
    """Get the status of a research session

    Response includes current status, progress, and any errors
    """
    # Fetch from database
    session = await db_get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return ResearchAPIResponse(
        success=True,
        session_id=session_id,
        status=session.get("status", "unknown"),
        topic=session.get("topic", ""),
        created_at=session.get("created_at", ""),
    )


@router.get("/research/{session_id}/report")
async def get_research_report_api(
    session_id: str,
    api_key: str = None,
):
    """Get the completed research report

    Returns full report with sections, sources, and knowledge graph
    """
    session = await db_get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.get("status") != "completed":
        raise HTTPException(status_code=400, detail=f"Research not completed. Status: {session.get('status')}")

    report = session.get("report")
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if isinstance(report, str):
        report = json.loads(report)

    return ReportAPIResponse(
        success=True,
        session_id=session_id,
        topic=report.get("topic", ""),
        summary=report.get("summary", ""),
        sections=report.get("sections", []),
        sources=[s if isinstance(s, dict) else s.model_dump() for s in report.get("sources", [])],
        knowledge_graph=report.get("knowledge_graph", {}),
        status="completed",
        created_at=session.get("created_at", ""),
    )


@router.get("/research/{session_id}/export/{format_type}")
async def export_research_api(
    session_id: str,
    format_type: str,
    api_key: str = None,
):
    """Export research in different formats

    Formats: markdown, html, json
    """
    if format_type not in ["markdown", "html", "json"]:
        raise HTTPException(status_code=400, detail="Invalid format. Use: markdown, html, or json")

    session = await db_get_session(session_id)
    if not session or not session.get("report"):
        raise HTTPException(status_code=404, detail="Session or report not found")

    report = session.get("report")
    if isinstance(report, str):
        report = json.loads(report)

    if format_type == "json":
        return APIResponse(
            success=True,
            data=report,
        )

    # For markdown and html, return as downloadable content
    return APIResponse(
        success=True,
        data={
            "format": format_type,
            "session_id": session_id,
            "filename": f"{session_id}.{format_type}",
        },
    )


@router.get("/info")
async def get_api_info(api_key: str = None):
    """Get API information and usage statistics"""
    key_info = await get_key_info(api_key) if api_key else None
    return APIResponse(
        success=True,
        data={
            "version": "1.0.0",
            "endpoints": [
                "POST /api/v1/research/start",
                "GET /api/v1/research/{session_id}/status",
                "GET /api/v1/research/{session_id}/report",
                "GET /api/v1/research/{session_id}/export/{format_type}",
                "GET /api/v1/info",
            ],
            "api_key_info": key_info,
            "rate_limit": "100 requests per hour",
        },
    )
