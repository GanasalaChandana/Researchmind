"""API Key management and validation"""
import secrets
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional

# In-memory API key store (in production, use database)
_api_keys: dict[str, dict] = {}
_rate_limits: dict[str, list[float]] = {}  # key -> list of timestamps
MAX_REQUESTS_PER_HOUR = 100


async def generate_api_key() -> str:
    """Generate a new API key"""
    key = f"rm_{secrets.token_urlsafe(32)}"
    _api_keys[key] = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_used": None,
        "requests_count": 0,
        "is_active": True,
    }
    return key


async def validate_api_key(key: str) -> bool:
    """Check if API key is valid and active"""
    if key not in _api_keys:
        return False
    api_key_data = _api_keys[key]
    if not api_key_data.get("is_active", True):
        return False
    return True


async def update_key_usage(key: str) -> None:
    """Update API key usage statistics"""
    if key in _api_keys:
        _api_keys[key]["last_used"] = datetime.now(timezone.utc).isoformat()
        _api_keys[key]["requests_count"] = _api_keys[key].get("requests_count", 0) + 1


async def check_rate_limit(key: str) -> bool:
    """Check if API key is within rate limit"""
    now = datetime.now(timezone.utc).timestamp()
    hour_ago = now - 3600

    # Get or create request timestamps for this key
    if key not in _rate_limits:
        _rate_limits[key] = []

    # Remove old requests outside the window
    _rate_limits[key] = [ts for ts in _rate_limits[key] if ts > hour_ago]

    # Check limit
    if len(_rate_limits[key]) >= MAX_REQUESTS_PER_HOUR:
        return False

    # Add current request
    _rate_limits[key].append(now)
    return True


async def get_key_info(key: str) -> Optional[dict]:
    """Get information about an API key"""
    if key not in _api_keys:
        return None
    return _api_keys[key].copy()


async def deactivate_key(key: str) -> bool:
    """Deactivate an API key"""
    if key not in _api_keys:
        return False
    _api_keys[key]["is_active"] = False
    return True


async def revoke_key(key: str) -> bool:
    """Revoke/delete an API key"""
    if key not in _api_keys:
        return False
    del _api_keys[key]
    if key in _rate_limits:
        del _rate_limits[key]
    return True


async def list_all_keys() -> list[dict]:
    """List all API keys (for internal use only)"""
    return [
        {
            "key": key[:10] + "..." if len(key) > 10 else key,
            "created_at": data["created_at"],
            "last_used": data["last_used"],
            "requests_count": data["requests_count"],
            "is_active": data["is_active"],
        }
        for key, data in _api_keys.items()
    ]
