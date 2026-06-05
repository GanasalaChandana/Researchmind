"""Email delivery via Resend (https://resend.com).

Uses a plain HTTP POST (httpx) so no extra SDK is needed. If RESEND_API_KEY is
not configured, send functions return False and callers fall back gracefully.
"""
import httpx

from ..config import RESEND_API_KEY, EMAIL_FROM, FRONTEND_URL

RESEND_ENDPOINT = "https://api.resend.com/emails"


def email_configured() -> bool:
    return bool(RESEND_API_KEY)


async def send_email(to: str, subject: str, html: str) -> bool:
    """Send an email via Resend. Returns True on success, False otherwise."""
    if not RESEND_API_KEY:
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                RESEND_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={"from": EMAIL_FROM, "to": [to], "subject": subject, "html": html},
            )
        if resp.status_code in (200, 201):
            return True
        print(f"❌ Resend error {resp.status_code}: {resp.text[:200]}")
        return False
    except Exception as e:
        print(f"❌ Email send failed: {type(e).__name__}: {e}")
        return False


async def send_password_reset_email(to: str, name: str, token: str) -> bool:
    """Send a password-reset email containing both a one-click link and the code."""
    reset_link = f"{FRONTEND_URL}/?reset_token={token}"
    html = f"""\
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="text-align:center;margin-bottom:24px">
    <div style="font-size:22px;font-weight:700;color:#6366f1">✨ ResearchMind</div>
  </div>
  <h2 style="font-size:18px;margin:0 0 8px">Reset your password</h2>
  <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px">
    Hi {name or "there"}, we received a request to reset your ResearchMind password.
    Click the button below, or use the reset code in the app. This code expires in 30 minutes.
  </p>
  <div style="text-align:center;margin:24px 0">
    <a href="{reset_link}"
       style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;
              font-weight:600;font-size:14px;padding:12px 28px;border-radius:10px">
      Reset Password
    </a>
  </div>
  <p style="font-size:13px;color:#64748b;margin:0 0 8px">Or enter this reset code manually:</p>
  <div style="font-family:monospace;font-size:13px;background:#f1f5f9;border:1px solid #e2e8f0;
              border-radius:8px;padding:12px;word-break:break-all;color:#0f172a">{token}</div>
  <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin:24px 0 0">
    If you didn't request this, you can safely ignore this email — your password won't change.
  </p>
</div>"""
    return await send_email(to, "Reset your ResearchMind password", html)
