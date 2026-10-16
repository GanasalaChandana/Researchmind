"""Central Groq model selection.

Groq retired llama-3.3-70b-versatile and llama-3.1-8b-instant for free/developer
keys (Aug 2026), so model IDs live here and can be overridden without a code
change:  GROQ_MODEL_SMART=...  GROQ_MODEL_FAST=...

The default gpt-oss models are *reasoning* models: hidden reasoning tokens count
against max_tokens, so with small limits the visible answer can come back empty.
adapt_kwargs() gives them a low reasoning effort and extra token headroom.
"""
import os

SMART_MODEL = os.environ.get("GROQ_MODEL_SMART", "openai/gpt-oss-120b")
FAST_MODEL = os.environ.get("GROQ_MODEL_FAST", "openai/gpt-oss-20b")

# Hidden reasoning at low effort is short. Groq also counts max_tokens toward the
# per-minute token limit, so keep this modest.
REASONING_TOKEN_HEADROOM = 600


def is_reasoning_model(model: str) -> bool:
    return str(model).startswith("openai/gpt-oss")


def adapt_kwargs(kwargs: dict) -> dict:
    """Return kwargs adjusted for the target model (no-op for non-reasoning models)."""
    if not is_reasoning_model(kwargs.get("model", "")):
        return kwargs
    out = dict(kwargs)
    if out.get("max_tokens"):
        out["max_tokens"] = out["max_tokens"] + REASONING_TOKEN_HEADROOM
    extra = dict(out.get("extra_body") or {})
    extra.setdefault("reasoning_effort", "low")
    out["extra_body"] = extra
    return out
