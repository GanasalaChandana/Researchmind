from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid


class ResearchRequest(BaseModel):
    topic: str
    depth: int = 3  # number of sub-questions to explore
    custom_prompts: Optional[list[str]] = None  # optional custom research questions


class AgentEvent(BaseModel):
    type: str  # "thinking" | "searching" | "reading" | "synthesizing" | "done" | "error"
    agent: str
    message: str
    data: Optional[dict] = None
    timestamp: str = ""

    def __init__(self, **data):
        if not data.get("timestamp"):
            data["timestamp"] = datetime.now(timezone.utc).isoformat()
        super().__init__(**data)


class Source(BaseModel):
    url: str
    title: str
    summary: str
    relevance_score: float = 0.0


class Entity(BaseModel):
    id: str
    name: str
    type: str  # "concept" | "person" | "organization" | "event" | "technology"
    description: str


class Relationship(BaseModel):
    source_id: str
    target_id: str
    label: str
    weight: float = 1.0


class KnowledgeGraph(BaseModel):
    entities: list[Entity] = []
    relationships: list[Relationship] = []


class ResearchReport(BaseModel):
    session_id: str
    topic: str
    summary: str
    sections: list[dict]  # [{"heading": str, "content": str, "citations": [int]}]
    sources: list[Source]
    knowledge_graph: KnowledgeGraph
    created_at: str = ""

    def __init__(self, **data):
        if not data.get("created_at"):
            data["created_at"] = datetime.now(timezone.utc).isoformat()
        super().__init__(**data)


class ResearchSession(BaseModel):
    id: str
    topic: str
    status: str  # "running" | "completed" | "failed"
    created_at: str
    report: Optional[ResearchReport] = None


class WebhookRequest(BaseModel):
    url: str
    events: list[str] = ["completed", "failed"]
    secret: Optional[str] = None


class FavoriteRequest(BaseModel):
    is_favorite: bool
