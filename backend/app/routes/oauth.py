"""OAuth 2.0 routes — Google and GitHub authentication."""
import json
import os
import uuid
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from ..config import FRONTEND_URL
from ..auth.security import (
    create_access_token, create_refresh_token, decode_token,
    hash_password, REFRESH_TOKEN_EXPIRE_DAYS,
)
from ..auth.user_db import (
    create_user, get_user_by_email, store_refresh_token,
)

router = APIRouter(prefix="/auth/oauth", tags=["oauth"])


def _backend_base(request: Request) -> str:
    base = os.environ.get("BACKEND_URL", "").rstrip("/")
    return base if base else str(request.base_url).rstrip("/")


# ── Google ────────────────────────────────────────────────────────────────────

@router.get("/google")
def google_login(request: Request):
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    if not client_id:
        return RedirectResponse(f"{FRONTEND_URL}?oauth_error=Google+OAuth+not+configured")
    params = {
        "client_id": client_id,
        "redirect_uri": f"{_backend_base(request)}/auth/oauth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}")


@router.get("/google/callback")
async def google_callback(request: Request, code: str = "", error: str = ""):
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}?oauth_error={error or 'access_denied'}")
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    redirect_uri = f"{_backend_base(request)}/auth/oauth/google/callback"

    async with httpx.AsyncClient() as client:
        token_res = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
        if token_res.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}?oauth_error=Token+exchange+failed")

        info_res = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_res.json()['access_token']}"},
        )
        if info_res.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}?oauth_error=Failed+to+fetch+profile")
        info = info_res.json()

    return await _finish_oauth(info["email"], info.get("name", info["email"].split("@")[0]))


# ── GitHub ────────────────────────────────────────────────────────────────────

@router.get("/github")
def github_login(request: Request):
    client_id = os.environ.get("GITHUB_CLIENT_ID", "")
    if not client_id:
        return RedirectResponse(f"{FRONTEND_URL}?oauth_error=GitHub+OAuth+not+configured")
    params = {
        "client_id": client_id,
        "redirect_uri": f"{_backend_base(request)}/auth/oauth/github/callback",
        "scope": "read:user user:email",
    }
    return RedirectResponse(f"https://github.com/login/oauth/authorize?{urlencode(params)}")


@router.get("/github/callback")
async def github_callback(request: Request, code: str = "", error: str = ""):
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}?oauth_error={error or 'access_denied'}")
    client_id = os.environ.get("GITHUB_CLIENT_ID", "")
    client_secret = os.environ.get("GITHUB_CLIENT_SECRET", "")

    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            data={"client_id": client_id, "client_secret": client_secret, "code": code},
            headers={"Accept": "application/json"},
        )
        if token_res.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}?oauth_error=Token+exchange+failed")
        gh_token = token_res.json().get("access_token", "")

        info_res = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"token {gh_token}", "Accept": "application/vnd.github.v3+json"},
        )
        info = info_res.json()

        email = info.get("email")
        if not email:
            emails_res = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"token {gh_token}"},
            )
            primary = next(
                (e for e in emails_res.json() if e.get("primary") and e.get("verified")), None
            )
            if not primary:
                return RedirectResponse(f"{FRONTEND_URL}?oauth_error=No+verified+email+on+GitHub")
            email = primary["email"]

    name = info.get("name") or info.get("login") or email.split("@")[0]
    return await _finish_oauth(email, name)


# ── Shared finish ─────────────────────────────────────────────────────────────

async def _finish_oauth(email: str, name: str) -> RedirectResponse:
    user = await get_user_by_email(email)
    if not user:
        user = await create_user(
            email=email,
            name=name,
            hashed_password=hash_password(str(uuid.uuid4())),
        )
    if not user:
        return RedirectResponse(f"{FRONTEND_URL}?oauth_error=Account+creation+failed")

    access_token = create_access_token(user["id"], user["email"])
    refresh_token_str = create_refresh_token(user["id"])

    payload = decode_token(refresh_token_str)
    if payload:
        expires = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        await store_refresh_token(payload["jti"], user["id"], expires)

    user_json = json.dumps({
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "created_at": str(user.get("created_at", "")),
        "research_count": 0,
    })
    qs = urlencode({"access_token": access_token, "refresh_token": refresh_token_str, "user": user_json})
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback?{qs}")
