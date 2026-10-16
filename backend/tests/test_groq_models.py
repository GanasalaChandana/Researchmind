"""Model selection: Groq retired the Llama models, reasoning models need headroom."""
import asyncio

from app.tools import groq_models
from app.tools.groq_models import adapt_kwargs, SMART_MODEL, FAST_MODEL


def test_defaults_are_not_the_retired_llama_models():
    assert "llama" not in SMART_MODEL and "llama" not in FAST_MODEL


def test_reasoning_models_get_headroom_and_low_effort():
    out = adapt_kwargs({"model": "openai/gpt-oss-120b", "max_tokens": 10, "messages": []})
    assert out["max_tokens"] == 10 + groq_models.REASONING_TOKEN_HEADROOM
    assert out["extra_body"] == {"reasoning_effort": "low"}


def test_other_models_untouched_and_input_not_mutated():
    kw = {"model": "some/other-model", "max_tokens": 10}
    assert adapt_kwargs(kw) == {"model": "some/other-model", "max_tokens": 10}
    kw2 = {"model": "openai/gpt-oss-20b", "max_tokens": 5}
    adapt_kwargs(kw2)
    assert kw2 == {"model": "openai/gpt-oss-20b", "max_tokens": 5}


def test_retry_wrapper_applies_adaptation():
    from app.tools import groq_retry
    seen = {}

    class _Completions:
        def create(self, **kw):
            seen.update(kw)
            return "ok"

    class _Client:
        chat = type("C", (), {"completions": _Completions()})()

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(groq_retry.groq_with_retry(
            _Client(), model=SMART_MODEL, messages=[], max_tokens=100))
    finally:
        loop.close()
    assert seen["max_tokens"] == 100 + groq_models.REASONING_TOKEN_HEADROOM
    assert seen["extra_body"]["reasoning_effort"] == "low"


def test_retry_delay_follows_groq_hints_and_is_capped():
    from app.tools.groq_retry import retry_delay, MAX_BACKOFF_S

    class _E(Exception):
        pass

    assert retry_delay(_E("Rate limit. Please try again in 12.5s."), 0) == 13.5
    assert retry_delay(_E("Please try again in 1m3.5s"), 0) == MAX_BACKOFF_S       # 64.5s -> capped
    assert retry_delay(_E("429 too many requests"), 0) == 2.0                       # no hint: exponential
    assert retry_delay(_E("429 too many requests"), 2) == 8.0

    class _R(_E):
        response = type("R", (), {"headers": {"retry-after": "20"}})()
    assert retry_delay(_R("429"), 0) == 21.0


def test_ascii_topics_skip_the_language_llm_call(monkeypatch):
    from app.tools import language_detect
    monkeypatch.setattr(language_detect, "Groq", lambda **k: (_ for _ in ()).throw(AssertionError("LLM called")))
    assert language_detect.detect_language("How do solid-state batteries work?") == "English"
