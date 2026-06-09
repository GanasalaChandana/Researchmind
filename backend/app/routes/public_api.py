"""Public API — /api/v1/* routes.

Authentication:
  - Research endpoints  → Bearer <api-key>
  - Key management      → Bearer <JWT token>  (same token used by the web app)
"""
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional
import json

from ..models.api_models import APIResponse, ResearchAPIResponse, ReportAPIResponse
from ..tools.api_keys import (
    validate_api_key,
    check_rate_limit,
    update_key_usage,
    get_key_info,
    create_user_api_key,
    list_user_api_keys,
    delete_user_api_key,
)
from ..database import get_session as db_get_session
from ..auth.dependencies import get_current_user

router = APIRouter(prefix="/api/v1", tags=["public-api"])


# ── Auth dependency for API-key-protected routes ──────────────────────────────

async def require_api_key(authorization: Optional[str] = Header(None)) -> str:
    """Dependency: validates API key from `Authorization: Bearer <key>` header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or malformed Authorization header. Use: Bearer <api-key>",
        )
    raw_key = authorization[7:]  # strip "Bearer "

    if not await validate_api_key(raw_key):
        raise HTTPException(status_code=401, detail="Invalid or inactive API key")

    if not await check_rate_limit(raw_key):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded — maximum 100 requests per hour per key",
            headers={"Retry-After": "3600"},
        )

    await update_key_usage(raw_key)
    return raw_key


# ── Key management (JWT-protected) ────────────────────────────────────────────

class CreateKeyRequest(BaseModel):
    name: str  # human-readable label, e.g. "My app"


@router.get("/keys")
async def list_keys(current_user: dict = Depends(get_current_user)):
    """List all API keys for the authenticated user.

    Returns key metadata — the raw key is never exposed after creation.
    """
    keys = await list_user_api_keys(current_user["id"])
    return {"keys": keys, "total": len(keys)}


@router.post("/keys", status_code=201)
async def create_key(
    body: CreateKeyRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate a new API key.

    **The raw key is returned only once — store it securely.**
    Subsequent calls to `GET /api/v1/keys` show only the key prefix.
    """
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=422, detail="Key name is required")

    result = await create_user_api_key(current_user["id"], body.name.strip())
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create API key")

    return {
        "id":         result["id"],
        "name":       result["name"],
        "key":        result["key"],          # shown ONCE
        "key_prefix": result["key_prefix"],
        "created_at": result["created_at"],
        "note": "Save this key — it won't be shown again.",
    }


@router.delete("/keys/{key_id}", status_code=200)
async def delete_key(
    key_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete an API key permanently."""
    deleted = await delete_user_api_key(key_id, current_user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Key not found or not owned by you")
    return {"deleted": True, "key_id": key_id}


# ── Public research endpoints (API-key-protected) ─────────────────────────────

@router.get("/research/{session_id}/status")
async def get_research_status(
    session_id: str,
    api_key: str = Depends(require_api_key),
):
    """Get the current status of a research session.

    Poll this until `status == "completed"`, then call `/report`.
    """
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
async def get_research_report(
    session_id: str,
    api_key: str = Depends(require_api_key),
):
    """Fetch the completed research report.

    Returns full report: summary, sections, sources, knowledge graph.
    """
    session = await db_get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Research not completed yet. Current status: {session.get('status')}",
        )

    report = session.get("report")
    if not report:
        raise HTTPException(status_code=404, detail="Report data not found")
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
async def export_research(
    session_id: str,
    format_type: str,
    api_key: str = Depends(require_api_key),
):
    """Export a completed report as JSON, markdown, or HTML."""
    if format_type not in ("json", "markdown", "html"):
        raise HTTPException(
            status_code=400,
            detail="Invalid format. Supported: json | markdown | html",
        )

    session = await db_get_session(session_id)
    if not session or not session.get("report"):
        raise HTTPException(status_code=404, detail="Session or report not found")

    report = session["report"]
    if isinstance(report, str):
        report = json.loads(report)

    if format_type == "json":
        return APIResponse(success=True, data=report)

    return APIResponse(
        success=True,
        data={
            "format": format_type,
            "session_id": session_id,
            "filename": f"ResearchMind-{session_id[:8]}.{format_type}",
            "note": "Full text export via web app export button; API JSON export is fully supported.",
        },
    )


@router.get("/info")
async def api_info(api_key: str = Depends(require_api_key)):
    """API metadata — version, rate-limit status, available endpoints."""
    key_info = await get_key_info(api_key)
    return APIResponse(
        success=True,
        data={
            "version": "1.0.0",
            "rate_limit": {
                "max_per_hour": 100,
                **( key_info or {}),
            },
            "endpoints": {
                "GET  /api/v1/research/{id}/status":         "Poll research progress",
                "GET  /api/v1/research/{id}/report":         "Fetch completed report",
                "GET  /api/v1/research/{id}/export/{fmt}":   "Export report (json|markdown|html)",
                "GET  /api/v1/info":                         "This endpoint",
            },
            "key_management": {
                "GET  /api/v1/keys":      "List your API keys (JWT auth)",
                "POST /api/v1/keys":      "Create a new key  (JWT auth)",
                "DELETE /api/v1/keys/{id}": "Delete a key    (JWT auth)",
            },
        },
    )
