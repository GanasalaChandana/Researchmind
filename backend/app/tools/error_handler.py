import asyncio as _asyncio


def friendly_error(e: Exception) -> str:
    if isinstance(e, _asyncio.TimeoutError):
        return "⏱️ Research pipeline timed out (>120s per phase). The AI provider may be overloaded — please try again."
    msg = str(e).lower()
    if "rate limit" in msg or "429" in msg or "ratelimit" in msg:
        return "⏳ Rate limit reached on the AI provider. Please wait 30 seconds and try again."
    if "api key" in msg or "authentication" in msg or "401" in msg:
        return "🔑 API key is invalid or missing. Please check your GROQ_API_KEY."
    if "timeout" in msg or "timed out" in msg:
        return "⏱️ Request timed out. The AI provider may be busy — please try again."
    if "connection" in msg or "network" in msg:
        return "🌐 Network error connecting to AI provider. Please check your connection."
    if "model" in msg and "decommission" in msg:
        return "🤖 The AI model has been updated. Please contact support."
    return f"❌ Unexpected error: {str(e)[:200]}"
