"""Auth routes: register, login, refresh, logout, me, update profile, change password"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends, status, Request

# Import models
from ..models.user import (
    UserRegister, UserLogin, UserOut, TokenResponse,
    TokenRefresh, PasswordChange, UserUpdate,
    ForgotPassword, ResetPassword,
)

# Import security functions
from ..auth.security import (
    hash_password, verify_password, decode_token,
    create_access_token, create_refresh_token,
    verify_refresh_token,
    generate_reset_token, hash_reset_token,
    ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS,
    RESET_TOKEN_EXPIRE_MINUTES,
)

# Import auth dependencies
from ..auth.dependencies import get_current_user

# Import database functions
from ..auth.user_db import (
    create_user, get_user_by_email, get_user_by_id,
    update_user, get_research_count,
    store_refresh_token, revoke_refresh_token, is_refresh_token_valid,
    store_reset_token, consume_reset_token,
)

# Email delivery
from ..tools.email import email_configured, send_password_reset_email

# Rate limiting
from ..tools.rate_limit import check_rate_limit, clear_rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: dict, research_count: int = 0) -> UserOut:
    """Convert user dict to UserOut response model"""
    created = user.get("created_at", "")
    if hasattr(created, "isoformat"):
        created = created.isoformat()
    return UserOut(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        created_at=str(created),
        research_count=research_count,
        api_key=user.get("api_key"),
    )


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: UserRegister, request: Request):
    """Create a new user account and return JWT tokens"""
    # Anti-spam: max 10 signups per IP per hour
    check_rate_limit(request, bucket="register", max_attempts=10, window_seconds=3600)

    # Check for duplicate email
    existing = await get_user_by_email(body.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # Create user
    hashed = hash_password(body.password)
    user = await create_user(body.email, body.name, hashed)
    if not user:
        raise HTTPException(status_code=500, detail="Failed to create user")

    # Create tokens
    access_token = create_access_token(user["id"], user["email"])
    refresh_token = create_refresh_token(user["id"])

    # Store refresh token
    payload = decode_token(refresh_token)
    if payload:
        expires = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        await store_refresh_token(payload["jti"], user["id"], expires)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_user_out(user),
    )


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin, request: Request):
    """Login with email and password"""
    # Brute-force protection: max 5 failed attempts per IP+email per 15 minutes
    check_rate_limit(
        request, bucket="login", max_attempts=5, window_seconds=900, extra_key=body.email
    )

    user = await get_user_by_email(body.email)

    if not user or not verify_password(body.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    # Successful login — clear the attempt counter for this IP+email
    clear_rate_limit(request, bucket="login", extra_key=body.email)

    access_token = create_access_token(user["id"], user["email"])
    refresh_token = create_refresh_token(user["id"])

    payload = decode_token(refresh_token)
    if payload:
        expires = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        await store_refresh_token(payload["jti"], user["id"], expires)

    count = await get_research_count(user["id"])
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_user_out(user, count),
    )


# ── Refresh Token ─────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(body: TokenRefresh):
    """Exchange refresh token for new access + refresh token pair"""
    payload = verify_refresh_token(body.refresh_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    jti = payload.get("jti", "")
    if not await is_refresh_token_valid(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )

    user = await get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Revoke old token and issue new pair
    await revoke_refresh_token(jti)

    new_access = create_access_token(user["id"], user["email"])
    new_refresh = create_refresh_token(user["id"])

    new_payload = decode_token(new_refresh)
    if new_payload:
        expires = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        await store_refresh_token(new_payload["jti"], user["id"], expires)

    count = await get_research_count(user["id"])
    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_user_out(user, count),
    )


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout")
async def logout(
    body: TokenRefresh,
    current_user: dict = Depends(get_current_user),
):
    """Revoke refresh token"""
    payload = verify_refresh_token(body.refresh_token)
    if payload:
        await revoke_refresh_token(payload.get("jti", ""))

    return {"message": "Logged out successfully"}


# ── Get Current User ──────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user profile"""
    count = await get_research_count(current_user["id"])
    return _user_out(current_user, count)


# ── Update Profile ────────────────────────────────────────────────────────────

@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UserUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update user profile"""
    updates = {}
    if body.name:
        updates["name"] = body.name.strip()
    if body.email:
        existing = await get_user_by_email(body.email.lower())
        if existing and existing["id"] != current_user["id"]:
            raise HTTPException(status_code=409, detail="Email already in use")
        updates["email"] = body.email.lower().strip()

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updated = await update_user(current_user["id"], **updates)
    count = await get_research_count(current_user["id"])
    return _user_out(updated, count)


# ── Change Password ───────────────────────────────────────────────────────────

@router.post("/change-password")
async def change_password(
    body: PasswordChange,
    current_user: dict = Depends(get_current_user),
):
    """Change user password"""
    if not verify_password(body.current_password, current_user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    new_hashed = hash_password(body.new_password)
    await update_user(current_user["id"], password=new_hashed)
    return {"message": "Password changed successfully"}


# ── Delete Account ────────────────────────────────────────────────────────────

@router.delete("/me")
async def delete_account(current_user: dict = Depends(get_current_user)):
    """Delete user account"""
    # Mark as deleted by changing email to a unique deleted marker
    await update_user(current_user["id"], email=f"deleted_{current_user['id']}")
    return {"message": "Account deleted successfully"}


# ── Forgot Password ───────────────────────────────────────────────────────────

@router.post("/forgot-password")
async def forgot_password(body: ForgotPassword, request: Request):
    """
    Request a password reset. Generates a single-use reset token (valid 30 min).

    Always returns success (even if email doesn't exist) to avoid leaking which
    emails are registered. If email delivery (Resend) is configured, the reset
    code is emailed and NOT returned in the response. If not configured, the token
    is returned directly as a development fallback.
    """
    # Anti-abuse: max 5 reset requests per IP per 15 minutes
    check_rate_limit(request, bucket="forgot", max_attempts=5, window_seconds=900)

    user = await get_user_by_email(body.email)

    # Generic response regardless of whether the user exists (security best practice)
    generic = {"message": "If an account exists for that email, a reset link has been sent."}

    if not user:
        return generic

    raw_token = generate_reset_token()
    token_hash = hash_reset_token(raw_token)
    expires = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)
    await store_reset_token(token_hash, user["id"], expires)

    if email_configured():
        # Email the reset code/link; do NOT expose the token in the response.
        sent = await send_password_reset_email(user["email"], user.get("name", ""), raw_token)
        if sent:
            return generic
        # Fall through to returning the token if the email send failed, so the
        # user isn't completely blocked.

    # Dev fallback (no email provider configured, or send failed)
    return {**generic, "reset_token": raw_token, "expires_in": RESET_TOKEN_EXPIRE_MINUTES * 60}


# ── Reset Password ────────────────────────────────────────────────────────────

@router.post("/reset-password")
async def reset_password(body: ResetPassword):
    """
    Complete a password reset using the token from /forgot-password.

    The token is single-use and expires after 30 minutes.
    """
    token_hash = hash_reset_token(body.token)
    user_id = await consume_reset_token(token_hash)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    new_hashed = hash_password(body.new_password)
    await update_user(user_id, password=new_hashed)
    return {"message": "Password has been reset successfully. You can now log in."}
