"""
Lightweight language detection using Groq LLM.
Returns a language name string like "French", "Spanish", "Japanese" etc.
Falls back to "English" on any error.
"""

from groq import Groq
from ..config import GROQ_API_KEY

# Map common language codes / names to consistent full names
_NORMALISE = {
    "en": "English", "english": "English",
    "es": "Spanish", "spanish": "Spanish", "español": "Spanish",
    "fr": "French",  "french": "French",   "français": "French",
    "de": "German",  "german": "German",   "deutsch": "German",
    "hi": "Hindi",   "hindi": "Hindi",
    "zh": "Chinese", "chinese": "Chinese", "mandarin": "Chinese",
    "ja": "Japanese","japanese": "Japanese",
    "ar": "Arabic",  "arabic": "Arabic",
    "pt": "Portuguese","portuguese": "Portuguese",
    "ru": "Russian", "russian": "Russian",
    "ko": "Korean",  "korean": "Korean",
    "it": "Italian", "italian": "Italian",
}


def detect_language(text: str) -> str:
    """Detect the language of *text* and return a full English language name."""
    if not text or not text.strip():
        return "English"

    try:
        client = Groq(api_key=GROQ_API_KEY)
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{
                "role": "user",
                "content": (
                    f'What language is this text written in? Reply with ONLY the language name '
                    f'in English (e.g. "French", "Spanish", "English"). Text: "{text[:200]}"'
                ),
            }],
            max_tokens=10,
            temperature=0.0,
        )
        raw = response.choices[0].message.content.strip().lower().rstrip(".")
        return _NORMALISE.get(raw, raw.capitalize()) or "English"
    except Exception:
        return "English"
