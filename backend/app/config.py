from pathlib import Path
from dotenv import load_dotenv
import os

# Always resolves to backend/.env regardless of where Python is launched from
_env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True, encoding="utf-8-sig")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

_JWT_DEFAULT = "researchmind-change-in-production"
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY") or _JWT_DEFAULT

# Local-dev only: return password-reset tokens in the API response instead of emailing.
ALLOW_DEV_RESET_TOKEN = os.environ.get("ALLOW_DEV_RESET_TOKEN", "").lower() in ("1", "true", "yes")

# Treat Railway (or an explicit ENV/APP_ENV=production) as production.
IS_PRODUCTION = bool(os.environ.get("RAILWAY_ENVIRONMENT")) or \
    os.environ.get("ENV", os.environ.get("APP_ENV", "")).lower() == "production"

# Email delivery (Resend) — optional. If unset, reset codes are returned in the API
# response as a dev fallback instead of being emailed.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "ResearchMind <onboarding@resend.dev>")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://researchmind-app.vercel.app")

# Keys are validated at runtime when actually used (not at import time),
# so tests that don't call the LLM/search can still run without a .env file.
import warnings as _warnings
if not GROQ_API_KEY:
    _warnings.warn("GROQ_API_KEY is not set — LLM calls will fail at runtime.")
if not TAVILY_API_KEY:
    _warnings.warn("TAVILY_API_KEY is not set — web search calls will fail at runtime.")
if JWT_SECRET_KEY == _JWT_DEFAULT and IS_PRODUCTION:
    # Refuse to boot: with a public default secret anyone could forge login tokens.
    raise RuntimeError("JWT_SECRET_KEY must be set in production.")
if ALLOW_DEV_RESET_TOKEN and IS_PRODUCTION:
    raise RuntimeError("ALLOW_DEV_RESET_TOKEN must not be enabled in production.")
if JWT_SECRET_KEY == _JWT_DEFAULT:
    _warnings.warn(
        "JWT_SECRET_KEY is using the insecure default. Set JWT_SECRET_KEY in .env before deploying.",
        stacklevel=2,
    )
