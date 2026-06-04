"""
ResearchMind Python SDK
~~~~~~~~~~~~~~~~~~~~~~~

A Python client library for the ResearchMind AI Research Agent API.

Usage::

    from researchmind import ResearchMindClient

    client = ResearchMindClient(api_key="rm_your_key_here")
    session = client.start_research("Future of quantum computing", depth=3)
    report = client.wait_for_report(session.session_id)
    print(report.summary)

:license: MIT
"""

from .client import ResearchMindClient
from .models import ResearchSession, ResearchReport, Source, Section, KnowledgeGraph
from .exceptions import (
    ResearchMindError,
    AuthenticationError,
    RateLimitError,
    NotFoundError,
    ResearchFailedError,
    TimeoutError,
)

__version__ = "1.0.0"
__all__ = [
    "ResearchMindClient",
    "ResearchSession",
    "ResearchReport",
    "Source",
    "Section",
    "KnowledgeGraph",
    "ResearchMindError",
    "AuthenticationError",
    "RateLimitError",
    "NotFoundError",
    "ResearchFailedError",
    "TimeoutError",
]
