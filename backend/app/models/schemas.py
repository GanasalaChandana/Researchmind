from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime, timezone
import uuid


class ResearchRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=500)
    depth: int = Field(default=3, ge=1, le=10)
    custom_prompts: Optional[list[str]] = Field(default=None, max_length=20)

    @field_validator("topic")
    @classmethod
    def topic_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("topic cannot be blank")
        return v.strip()


class WebhookRequest(BaseModel):
    url: str = Field(..., max_length=2000)
    events: list[str] = Field(default=["completed", "failed"], max_length=10)
    secret: Optional[str] = Field(default=None, max_length=200)

    @field_validator("url")
    @classmethod
    def url_must_be_https(cls, v: str) -> str:
        if not v.startswith("https://"):
            raise ValueError("Webhook URL must start with https://")
        return v


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
    quality_score: float = 0.0      # 0-100 composite score
    domain_authority: str = ""      # "high" | "medium" | "low"
    recency_score: float = 0.0      # 0-1 based on URL/title date signals


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


class FavoriteRequest(BaseModel):
    is_favorite: bool
