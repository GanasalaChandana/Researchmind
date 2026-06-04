"""Exceptions for the ResearchMind SDK"""


class ResearchMindError(Exception):
    """Base exception for all ResearchMind errors"""
    def __init__(self, message: str, status_code: int = None):
        super().__init__(message)
        self.status_code = status_code


class AuthenticationError(ResearchMindError):
    """Raised when API key is invalid or missing"""
    pass


class RateLimitError(ResearchMindError):
    """Raised when API rate limit is exceeded"""
    def __init__(self, message: str = "Rate limit exceeded. Max 100 requests/hour."):
        super().__init__(message, status_code=429)


class NotFoundError(ResearchMindError):
    """Raised when a session or resource is not found"""
    def __init__(self, session_id: str):
        super().__init__(f"Session not found: {session_id}", status_code=404)
        self.session_id = session_id


class ResearchFailedError(ResearchMindError):
    """Raised when research fails to complete"""
    def __init__(self, session_id: str, reason: str = "Unknown error"):
        super().__init__(f"Research failed for session {session_id}: {reason}")
        self.session_id = session_id
        self.reason = reason


class TimeoutError(ResearchMindError):
    """Raised when waiting for research times out"""
    def __init__(self, session_id: str, timeout: int):
        super().__init__(f"Research timed out after {timeout}s for session {session_id}")
        self.session_id = session_id
        self.timeout = timeout
