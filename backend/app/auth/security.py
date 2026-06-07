"""Password hashing and JWT token logic"""
import os
import uuid
import hashlib
import secrets
import base64
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt

# ── Config ────────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "researchmind-super-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24       # 24 hours
REFRESH_TOKEN_EXPIRE_DAYS = 30              # 30 days
RESET_TOKEN_EXPIRE_MINUTES = 30            # 30 minutes


# ── Password reset tokens ─────────────────────────────────────────────────────

def generate_reset_token() -> str:
    """Generate a URL-safe random token to send to the user."""
    return secrets.token_urlsafe(32)


def hash_reset_token(token: str) -> str:
    """Hash a reset token for storage (only the hash is stored server-side)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ── Password (stdlib only — no bcrypt/passlib dependency) ─────────────────────

def hash_password(plain: str) -> str:
    """Hash password using PBKDF2-SHA256 (Python stdlib, no external deps)."""
    salt = secrets.token_bytes(32)
    key = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, 260000)
    return base64.b64encode(salt + key).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify password against stored PBKDF2-SHA256 hash."""
    try:
        data = base64.b64decode(hashed.encode("utf-8"))
        salt, stored_key = data[:32], data[32:]
        new_key = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, 260000)
        return secrets.compare_digest(stored_key, new_key)
    except Exception:
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT. Returns payload or None."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def verify_access_token(token: str) -> Optional[dict]:
    payload = decode_token(token)
    if payload and payload.get("type") == "access":
        return payload
    return None


def verify_refresh_token(token: str) -> Optional[dict]:
    payload = decode_token(token)
    if payload and payload.get("type") == "refresh":
        return payload
    return None
