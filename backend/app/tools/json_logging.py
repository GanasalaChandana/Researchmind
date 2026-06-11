"""Structured JSON log formatter for production.

Replaces the default text format with newline-delimited JSON so Railway's
log drain (and any ELK / Loki / Datadog pipeline) can parse fields directly.

Activate by calling configure_logging() once at application startup.
Each log line is a flat JSON object:
  {"ts": "2026-06-11T12:00:00.123Z", "level": "INFO", "logger": "app.main",
   "msg": "Research complete", "request_id": "a1b2c3d4", "extra": {...}}
"""
import json
import logging
import sys
import traceback
from datetime import datetime, timezone


class _JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created, tz=timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%S.") + f"{record.created % 1 * 1000:03.0f}Z"

        payload: dict = {
            "ts": ts,
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }

        # Attach exc_info if present
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        elif record.exc_text:
            payload["exc"] = record.exc_text

        # Pull any extra fields the caller passed via extra={...}
        _STANDARD = {
            "name", "msg", "args", "levelname", "levelno", "pathname",
            "filename", "module", "exc_info", "exc_text", "stack_info",
            "lineno", "funcName", "created", "msecs", "relativeCreated",
            "thread", "threadName", "processName", "process", "message",
            "taskName",
        }
        for key, val in record.__dict__.items():
            if key not in _STANDARD:
                payload[key] = val

        try:
            return json.dumps(payload, default=str, ensure_ascii=False)
        except Exception:
            # Fallback: never crash the logging system
            return json.dumps({"ts": ts, "level": "ERROR", "msg": "log serialisation failed"})


def configure_logging(level: str = "INFO", force_json: bool | None = None) -> None:
    """Set up root logger.

    force_json=None  → JSON in production (not a TTY), plain text locally
    force_json=True  → always JSON
    force_json=False → always plain text
    """
    use_json = force_json if force_json is not None else not sys.stdout.isatty()

    handler = logging.StreamHandler(sys.stdout)
    if use_json:
        handler.setFormatter(_JSONFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            fmt="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        ))

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Quieten noisy third-party loggers
    for noisy in ("httpx", "httpcore", "asyncio", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
