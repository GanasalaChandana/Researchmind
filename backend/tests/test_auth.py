"""Tests for the JWT auth flow: register, login, refresh, profile,
password change, password reset, and brute-force rate limiting.
"""
from conftest import register


# ── Health ────────────────────────────────────────────────────────────────────

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ── Register ──────────────────────────────────────────────────────────────────

def test_register_success(client):
    r = register(client)
    assert r.status_code == 201
    body = r.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["email"] == "alice@example.com"
    assert body["user"]["name"] == "Alice"
    assert "password" not in body["user"]  # never leak the hash


def test_register_duplicate_email(client):
    register(client)
    r = register(client)  # same email again
    assert r.status_code == 409


def test_register_rejects_short_password(client):
    r = register(client, password="short")
    assert r.status_code == 422


def test_register_rejects_bad_email(client):
    r = register(client, email="not-an-email")
    assert r.status_code == 422


def test_register_rejects_empty_name(client):
    r = register(client, name="   ")
    assert r.status_code == 422


# ── Login ─────────────────────────────────────────────────────────────────────

def test_login_success(client):
    register(client)
    r = client.post("/auth/login", json={"email": "alice@example.com", "password": "Password123"})
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_login_wrong_password(client):
    register(client)
    r = client.post("/auth/login", json={"email": "alice@example.com", "password": "WrongPass123"})
    assert r.status_code == 401


def test_login_nonexistent_user(client):
    r = client.post("/auth/login", json={"email": "nobody@example.com", "password": "Password123"})
    assert r.status_code == 401


# ── Protected route (/auth/me) ──────────────────────────────────────────────────

def test_me_requires_auth(client):
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_me_with_valid_token(client):
    token = register(client).json()["access_token"]
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "alice@example.com"


def test_me_rejects_garbage_token(client):
    r = client.get("/auth/me", headers={"Authorization": "Bearer not.a.real.token"})
    assert r.status_code == 401


# ── Refresh ─────────────────────────────────────────────────────────────────────

def test_refresh_issues_new_tokens(client):
    refresh = register(client).json()["refresh_token"]
    r = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_refresh_rejects_invalid_token(client):
    r = client.post("/auth/refresh", json={"refresh_token": "bogus"})
    assert r.status_code == 401


# ── Change password ─────────────────────────────────────────────────────────────

def test_change_password(client):
    token = register(client).json()["access_token"]
    r = client.post(
        "/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "Password123", "new_password": "NewPassword456"},
    )
    assert r.status_code == 200
    # old password no longer works
    assert client.post("/auth/login", json={"email": "alice@example.com", "password": "Password123"}).status_code == 401
    # new password works
    assert client.post("/auth/login", json={"email": "alice@example.com", "password": "NewPassword456"}).status_code == 200


def test_change_password_wrong_current(client):
    token = register(client).json()["access_token"]
    r = client.post(
        "/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "WrongCurrent", "new_password": "NewPassword456"},
    )
    assert r.status_code == 401


# ── Password reset flow ─────────────────────────────────────────────────────────

def test_forgot_and_reset_password(client):
    register(client)
    # Request reset — dev fallback returns the token in the response
    fr = client.post("/auth/forgot-password", json={"email": "alice@example.com"})
    assert fr.status_code == 200
    token = fr.json()["reset_token"]

    # Reset with the token
    rr = client.post("/auth/reset-password", json={"token": token, "new_password": "ResetPass789"})
    assert rr.status_code == 200

    # New password works, old one doesn't
    assert client.post("/auth/login", json={"email": "alice@example.com", "password": "ResetPass789"}).status_code == 200
    assert client.post("/auth/login", json={"email": "alice@example.com", "password": "Password123"}).status_code == 401


def test_reset_token_is_single_use(client):
    register(client)
    token = client.post("/auth/forgot-password", json={"email": "alice@example.com"}).json()["reset_token"]
    assert client.post("/auth/reset-password", json={"token": token, "new_password": "ResetPass789"}).status_code == 200
    # Re-using the same token must fail
    assert client.post("/auth/reset-password", json={"token": token, "new_password": "Another123"}).status_code == 400


def test_forgot_password_unknown_email_is_generic(client):
    # Should not error or leak that the email is unregistered
    r = client.post("/auth/forgot-password", json={"email": "ghost@example.com"})
    assert r.status_code == 200
    assert "reset_token" not in r.json()  # no token for a non-existent user


# ── Rate limiting (brute-force protection) ──────────────────────────────────────

def test_login_brute_force_is_rate_limited(client):
    register(client)
    codes = []
    for _ in range(6):
        resp = client.post("/auth/login", json={"email": "alice@example.com", "password": "WrongPass123"})
        codes.append(resp.status_code)
    # First 5 are 401 (bad creds), the 6th is blocked with 429
    assert codes[:5] == [401, 401, 401, 401, 401]
    assert codes[5] == 429


def test_successful_login_resets_rate_counter(client):
    register(client)
    # 4 failed attempts
    for _ in range(4):
        client.post("/auth/login", json={"email": "alice@example.com", "password": "WrongPass123"})
    # A success clears the counter
    assert client.post("/auth/login", json={"email": "alice@example.com", "password": "Password123"}).status_code == 200
    # So we can fail several more times without being immediately blocked
    r = client.post("/auth/login", json={"email": "alice@example.com", "password": "WrongPass123"})
    assert r.status_code == 401
