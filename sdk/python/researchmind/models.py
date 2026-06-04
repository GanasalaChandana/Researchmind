"""Data models for the ResearchMind SDK"""
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime


@dataclass
class Source:
    """A research source/reference"""
    url: str
    title: str
    summary: str
    relevance_score: float = 0.0

    @classmethod
    def from_dict(cls, data: dict) -> "Source":
        return cls(
            url=data.get("url", ""),
            title=data.get("title", ""),
            summary=data.get("summary", ""),
            relevance_score=data.get("relevance_score", 0.0),
        )

    def __repr__(self) -> str:
        return f"Source(title={self.title!r}, url={self.url!r})"


@dataclass
class Section:
    """A section of the research report"""
    heading: str
    content: str
    citations: list[int] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> "Section":
        return cls(
            heading=data.get("heading", ""),
            content=data.get("content", ""),
            citations=data.get("citations", []),
        )

    def __repr__(self) -> str:
        return f"Section(heading={self.heading!r})"


@dataclass
class KnowledgeGraph:
    """Knowledge graph with entities and relationships"""
    entities: list[dict] = field(default_factory=list)
    relationships: list[dict] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> "KnowledgeGraph":
        return cls(
            entities=data.get("entities", []),
            relationships=data.get("relationships", []),
        )

    @property
    def entity_count(self) -> int:
        return len(self.entities)

    @property
    def relationship_count(self) -> int:
        return len(self.relationships)

    def __repr__(self) -> str:
        return f"KnowledgeGraph(entities={self.entity_count}, relationships={self.relationship_count})"


@dataclass
class ResearchSession:
    """Represents a research session"""
    session_id: str
    topic: str
    status: str  # queued | running | completed | failed
    created_at: str

    @classmethod
    def from_dict(cls, data: dict) -> "ResearchSession":
        return cls(
            session_id=data.get("session_id", ""),
            topic=data.get("topic", ""),
            status=data.get("status", "queued"),
            created_at=data.get("created_at", ""),
        )

    @property
    def is_complete(self) -> bool:
        return self.status == "completed"

    @property
    def is_running(self) -> bool:
        return self.status in ("queued", "running")

    @property
    def is_failed(self) -> bool:
        return self.status == "failed"

    def __repr__(self) -> str:
        return f"ResearchSession(id={self.session_id[:8]}..., topic={self.topic!r}, status={self.status!r})"


@dataclass
class ResearchReport:
    """The full research report from a completed session"""
    session_id: str
    topic: str
    summary: str
    sections: list[Section]
    sources: list[Source]
    knowledge_graph: KnowledgeGraph
    status: str
    created_at: str

    @classmethod
    def from_dict(cls, data: dict) -> "ResearchReport":
        return cls(
            session_id=data.get("session_id", ""),
            topic=data.get("topic", ""),
            summary=data.get("summary", ""),
            sections=[Section.from_dict(s) for s in data.get("sections", [])],
            sources=[Source.from_dict(s) for s in data.get("sources", [])],
            knowledge_graph=KnowledgeGraph.from_dict(data.get("knowledge_graph", {})),
            status=data.get("status", "completed"),
            created_at=data.get("created_at", ""),
        )

    def to_markdown(self) -> str:
        """Convert report to Markdown format"""
        lines = [
            f"# {self.topic}\n",
            f"## Executive Summary\n{self.summary}\n",
        ]
        for section in self.sections:
            lines.append(f"## {section.heading}\n{section.content}\n")
        if self.sources:
            lines.append("## Sources\n")
            for i, source in enumerate(self.sources, 1):
                lines.append(f"[{i}] **{source.title}**\n{source.url}\n")
        return "\n".join(lines)

    def __repr__(self) -> str:
        return (
            f"ResearchReport("
            f"topic={self.topic!r}, "
            f"sections={len(self.sections)}, "
            f"sources={len(self.sources)})"
        )
