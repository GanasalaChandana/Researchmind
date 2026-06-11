"""Pytest fixtures for the ResearchMind backend.

Sets dummy env vars BEFORE importing the app (config.py requires keys at import
time), and resets all in-memory state between tests so they're isolated.
"""
import os
import sys

# Make the `app` package importable and satisfy config.py's required keys
# before anything imports the application.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("TAVILY_API_KEY", "test-key")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key")
# Ensure no DATABASE_URL so the app uses its in-memory fallback during tests.
os.environ.pop("DATABASE_URL", None)

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_state():
    """Clear in-memory user store and rate-limiter before every test."""
    from app.auth import user_db
    from app.tools import rate_limit

    for store in (
        user_db._mem_users,
        user_db._mem_by_email,
        user_db._refresh_store,
        user_db._reset_store,
    ):
        store.clear()
    rate_limit._hits.clear()

    # Clear the in-memory research-session store too
    from app import main
    main._mem.clear()

    # Clear in-memory comments and report versions stores
    from app import database
    database._mem_comments.clear()
    database._mem_report_versions.clear()

    yield


def register(client, email="alice@example.com", password="Password123", name="Alice"):
    """Helper: register a user, return the parsed JSON response."""
    return client.post(
        "/auth/register",
        json={"email": email, "password": password, "name": name},
    )
