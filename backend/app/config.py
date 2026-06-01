from pathlib import Path
from dotenv import load_dotenv
import os

# Always resolves to backend/.env regardless of where Python is launched from
_env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True, encoding="utf-8-sig")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

if not GROQ_API_KEY:
    raise RuntimeError(
        f"GROQ_API_KEY not found. Expected .env at: {_env_path}\n"
        f"File exists: {_env_path.exists()}"
    )
