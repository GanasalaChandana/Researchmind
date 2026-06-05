"""Auth routes: register, login, refresh, logout, me, update profile, change password"""
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, status

# Import models
from ..models.user import (
    UserRegister, UserLogin, UserOut, TokenResponse,
    TokenRefresh, PasswordChange, UserUpdate,
)

# Import security functions
from ..auth.security import (
    hash_password, verify_password, decode_token,
    create_access_token, create_refresh_token,
    verify_refresh_token,
    ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS,
)

# Import auth dependencies
from ..auth.dependencies import get_current_user

# Import database functions
from ..auth.user_db import (
    create_user, get_user_by_email, get_user_by_id,
    update_user, get_research_count,
    store_refresh_token, revoke_refresh_token, is_refresh_token_valid,
)

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
async def register(body: UserRegister):
    """Create a new user account and return JWT tokens"""
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
        expires = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        await store_refresh_token(payload["jti"], user["id"], expires)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_user_out(user),
    )


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin):
    """Login with email and password"""
    user = await get_user_by_email(body.email)

    if not user or not verify_password(body.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    access_token = create_access_token(user["id"], user["email"])
    refresh_token = create_refresh_token(user["id"])

    payload = decode_token(refresh_token)
    if payload:
        expires = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
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
        expires = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
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
