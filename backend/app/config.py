from pathlib import Path
from dotenv import load_dotenv
import os

# Always resolves to backend/.env regardless of where Python is launched from
_env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True, encoding="utf-8-sig")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

if not ANTHROPIC_API_KEY:
    raise RuntimeError(
        f"ANTHROPIC_API_KEY not found. Expected .env at: {_env_path}\n"
        f"File exists: {_env_path.exists()}"
    )

if not TAVILY_API_KEY:
    raise RuntimeError(
        f"TAVILY_API_KEY not found. Expected .env at: {_env_path}\n"
        f"File exists: {_env_path.exists()}"
    )
