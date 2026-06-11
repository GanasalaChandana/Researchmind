"""Email notifications via Resend API.

Sends transactional emails for:
  - Research completed (scheduled or manual refresh)
  - Scheduled research failure

Falls back silently if RESEND_API_KEY is not set — never crashes the pipeline.
"""
import logging
import httpx
from ..config import RESEND_API_KEY, EMAIL_FROM, FRONTEND_URL

logger = logging.getLogger(__name__)

_RESEND_URL = "https://api.resend.com/emails"


async def _send(to: str, subject: str, html: str) -> bool:
    """POST to Resend API. Returns True on success."""
    if not RESEND_API_KEY:
        logger.debug("RESEND_API_KEY not set — skipping email to %s", to)
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _RESEND_URL,
                headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
                json={"from": EMAIL_FROM, "to": [to], "subject": subject, "html": html},
            )
            if resp.status_code in (200, 201):
                logger.info("Email sent to %s: %s", to, subject)
                return True
            logger.warning("Resend returned %d for %s: %s", resp.status_code, to, resp.text[:200])
    except Exception as exc:
        logger.warning("Email delivery failed for %s: %s", to, exc)
    return False


def _report_url(session_id: str) -> str:
    return f"{FRONTEND_URL}/research/{session_id}"


async def send_research_complete_email(to: str, topic: str, session_id: str) -> bool:
    """Notify a user that their scheduled research has completed."""
    url = _report_url(session_id)
    subject = f"Your research on '{topic[:60]}' is ready"
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827">
  <div style="border-bottom:3px solid #1e40af;padding-bottom:12px;margin-bottom:24px">
    <h1 style="color:#1e40af;margin:0;font-size:22px">ResearchMind</h1>
  </div>
  <h2 style="font-size:18px;margin-bottom:8px">Your research is ready</h2>
  <p style="color:#374151">Your scheduled research on <strong>{topic}</strong> has completed.</p>
  <a href="{url}"
     style="display:inline-block;background:#1e40af;color:white;padding:12px 24px;
            border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0">
    View Report
  </a>
  <p style="color:#6b7280;font-size:13px;margin-top:32px">
    Session ID: {session_id}<br>
    <a href="{FRONTEND_URL}" style="color:#6b7280">ResearchMind</a>
  </p>
</body>
</html>"""
    return await _send(to, subject, html)


async def send_research_failed_email(to: str, topic: str, session_id: str) -> bool:
    """Notify a user that their scheduled research failed."""
    subject = f"Research on '{topic[:60]}' failed"
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827">
  <div style="border-bottom:3px solid #1e40af;padding-bottom:12px;margin-bottom:24px">
    <h1 style="color:#1e40af;margin:0;font-size:22px">ResearchMind</h1>
  </div>
  <h2 style="font-size:18px;color:#dc2626;margin-bottom:8px">Research failed</h2>
  <p style="color:#374151">Your scheduled research on <strong>{topic}</strong> encountered an error.</p>
  <p style="color:#374151">You can retry the research from your dashboard.</p>
  <a href="{FRONTEND_URL}"
     style="display:inline-block;background:#1e40af;color:white;padding:12px 24px;
            border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0">
    Go to Dashboard
  </a>
  <p style="color:#6b7280;font-size:13px;margin-top:32px">
    Session ID: {session_id}
  </p>
</body>
</html>"""
    return await _send(to, subject, html)
