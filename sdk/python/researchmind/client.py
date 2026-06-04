"""ResearchMind Python SDK Client"""
import time
import json
import urllib.request
import urllib.error
from typing import Optional, Generator

from .models import ResearchSession, ResearchReport, Source, Section, KnowledgeGraph
from .exceptions import (
    ResearchMindError,
    AuthenticationError,
    RateLimitError,
    NotFoundError,
    ResearchFailedError,
    TimeoutError,
)

DEFAULT_BASE_URL = "https://researchmind-production-b6ca.up.railway.app"
DEFAULT_TIMEOUT = 300  # 5 minutes
DEFAULT_POLL_INTERVAL = 5  # seconds


class ResearchMindClient:
    """
    Python client for the ResearchMind API.

    Example usage::

        from researchmind import ResearchMindClient

        client = ResearchMindClient(api_key="rm_your_key")

        # Start research
        session = client.start_research("Future of quantum computing", depth=3)
        print(f"Started: {session.session_id}")

        # Wait for completion and get report
        report = client.wait_for_report(session.session_id, timeout=300)
        print(report.summary)
        print(f"Sources: {len(report.sources)}")

        # Export as markdown
        md = report.to_markdown()
        with open("research.md", "w") as f:
            f.write(md)
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: int = DEFAULT_TIMEOUT,
    ):
        """
        Initialize the ResearchMind client.

        Args:
            api_key: Your ResearchMind API key (starts with rm_)
            base_url: API base URL (defaults to production)
            timeout: Default timeout for requests in seconds
        """
        if not api_key:
            raise AuthenticationError("API key is required")
        if not api_key.startswith("rm_"):
            raise AuthenticationError("Invalid API key format. Keys should start with 'rm_'")

        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _make_request(
        self,
        method: str,
        path: str,
        body: dict = None,
    ) -> dict:
        """Make an authenticated API request"""
        url = f"{self.base_url}/api/v1{path}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        data = json.dumps(body).encode() if body else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                response_data = json.loads(resp.read().decode())
                return response_data
        except urllib.error.HTTPError as e:
            body_text = e.read().decode()
            try:
                err_data = json.loads(body_text)
                detail = err_data.get("detail", body_text)
            except Exception:
                detail = body_text

            if e.code == 401:
                raise AuthenticationError(detail, status_code=401)
            elif e.code == 404:
                raise NotFoundError(path)
            elif e.code == 429:
                raise RateLimitError()
            else:
                raise ResearchMindError(detail, status_code=e.code)
        except urllib.error.URLError as e:
            raise ResearchMindError(f"Connection error: {e.reason}")

    def start_research(
        self,
        topic: str,
        depth: int = 3,
        custom_prompts: Optional[list[str]] = None,
    ) -> ResearchSession:
        """
        Start a new research session.

        Args:
            topic: The research topic
            depth: Number of sub-questions to explore (1-5, default: 3)
            custom_prompts: Optional list of custom research questions

        Returns:
            ResearchSession object with session_id

        Example::

            session = client.start_research(
                topic="Impact of AI on healthcare",
                depth=3,
                custom_prompts=[
                    "How is AI used in medical diagnosis?",
                    "What are the risks of AI in healthcare?",
                ]
            )
            print(session.session_id)
        """
        if not topic or not topic.strip():
            raise ValueError("Topic cannot be empty")
        if not 1 <= depth <= 5:
            raise ValueError("Depth must be between 1 and 5")

        payload = {"topic": topic.strip(), "depth": depth}
        if custom_prompts:
            payload["custom_prompts"] = custom_prompts

        data = self._make_request("POST", "/research/start", body=payload)
        return ResearchSession.from_dict(data)

    def get_status(self, session_id: str) -> ResearchSession:
        """
        Get the current status of a research session.

        Args:
            session_id: The session ID from start_research()

        Returns:
            ResearchSession with updated status

        Example::

            session = client.get_status("a1b2c3d4-...")
            print(session.status)  # "running", "completed", "failed"
        """
        data = self._make_request("GET", f"/research/{session_id}/status")
        return ResearchSession.from_dict(data)

    def get_report(self, session_id: str) -> ResearchReport:
        """
        Get the completed research report.

        Args:
            session_id: The session ID from start_research()

        Returns:
            Full ResearchReport with sections, sources, and knowledge graph

        Raises:
            ResearchMindError: If research is not yet complete

        Example::

            report = client.get_report("a1b2c3d4-...")
            print(report.summary)
            for section in report.sections:
                print(f"## {section.heading}")
                print(section.content)
        """
        data = self._make_request("GET", f"/research/{session_id}/report")
        return ResearchReport.from_dict(data)

    def wait_for_report(
        self,
        session_id: str,
        timeout: int = DEFAULT_TIMEOUT,
        poll_interval: int = DEFAULT_POLL_INTERVAL,
        on_status_change: callable = None,
    ) -> ResearchReport:
        """
        Wait for research to complete and return the report.

        Polls the status endpoint at regular intervals until complete or failed.

        Args:
            session_id: The session ID from start_research()
            timeout: Max seconds to wait (default: 300 = 5 minutes)
            poll_interval: Seconds between status checks (default: 5)
            on_status_change: Optional callback(status: str) called on status changes

        Returns:
            Full ResearchReport when completed

        Raises:
            ResearchFailedError: If research fails
            TimeoutError: If research doesn't complete within timeout

        Example::

            def on_status(status):
                print(f"  → {status}")

            report = client.wait_for_report(
                session_id,
                timeout=300,
                on_status_change=on_status
            )
        """
        start_time = time.time()
        last_status = None

        while True:
            elapsed = time.time() - start_time
            if elapsed >= timeout:
                raise TimeoutError(session_id, timeout)

            session = self.get_status(session_id)

            # Notify on status change
            if on_status_change and session.status != last_status:
                on_status_change(session.status)
            last_status = session.status

            if session.status == "completed":
                return self.get_report(session_id)
            elif session.status == "failed":
                raise ResearchFailedError(session_id)

            time.sleep(poll_interval)

    def export_report(
        self,
        session_id: str,
        format: str = "json",
    ) -> dict:
        """
        Export a research report in the specified format.

        Args:
            session_id: The session ID
            format: Export format - "json", "markdown", or "html"

        Returns:
            Dict with export data

        Example::

            data = client.export_report(session_id, format="json")
            print(data)
        """
        if format not in ("json", "markdown", "html"):
            raise ValueError("Format must be one of: json, markdown, html")

        return self._make_request("GET", f"/research/{session_id}/export/{format}")

    def get_api_info(self) -> dict:
        """
        Get API information and your key's usage stats.

        Returns:
            Dict with version info, endpoints, and usage stats

        Example::

            info = client.get_api_info()
            print(f"Requests used: {info['data']['api_key_info']['requests_count']}")
        """
        return self._make_request("GET", "/info")

    def research(
        self,
        topic: str,
        depth: int = 3,
        custom_prompts: Optional[list[str]] = None,
        timeout: int = DEFAULT_TIMEOUT,
        verbose: bool = False,
    ) -> ResearchReport:
        """
        Convenience method: start research and wait for the full report.

        This is a blocking call that handles start → poll → return in one step.

        Args:
            topic: The research topic
            depth: Number of sub-questions (1-5)
            custom_prompts: Optional custom research questions
            timeout: Max seconds to wait
            verbose: Print progress to stdout

        Returns:
            Full ResearchReport when completed

        Example::

            report = client.research("Future of AI", verbose=True)
            print(report.summary)
        """
        if verbose:
            print(f"🔍 Starting research: {topic!r} (depth={depth})")

        session = self.start_research(topic, depth=depth, custom_prompts=custom_prompts)

        if verbose:
            print(f"📋 Session ID: {session.session_id}")
            print("⏳ Waiting for research to complete...")

        def log_status(status):
            if verbose:
                icons = {
                    "queued": "🕐",
                    "running": "🔄",
                    "completed": "✅",
                    "failed": "❌",
                }
                print(f"  {icons.get(status, '→')} {status}")

        report = self.wait_for_report(
            session.session_id,
            timeout=timeout,
            on_status_change=log_status,
        )

        if verbose:
            print(f"\n📄 Report: {report.topic}")
            print(f"   Sections: {len(report.sections)}")
            print(f"   Sources:  {len(report.sources)}")
            print(f"   Entities: {report.knowledge_graph.entity_count}")

        return report
