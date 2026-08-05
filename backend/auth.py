"""
Verifies Supabase-issued JWTs. Supabase signs tokens with a project-specific
secret (HS256) unless you've switched to asymmetric JWT signing.

Dev mode: with DISABLE_AUTH=true every caller is accepted and treated as
DEV_USER_ID. That exists purely so the frontend can be built against a real
running model before the team has Supabase credentials — main.py prints a
warning at startup whenever it's on.
"""
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import DEV_USER_ID, DISABLE_AUTH, SUPABASE_JWT_SECRET

# auto_error=False so a missing header reaches our handler instead of raising
# a 403 first — needed for the DISABLE_AUTH path, where there is no header.
security = HTTPBearer(auto_error=False)


def _dev_user() -> dict:
    return {"sub": DEV_USER_ID, "email": "dev@localhost", "dev_mode": True}


def decode_jwt(token: str) -> dict | None:
    """Returns the decoded payload if valid, else None."""
    if not SUPABASE_JWT_SECRET:
        return None
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except jwt.InvalidTokenError:
        return None


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """
    Dependency for REST routes. Use as:
        @app.post("/api/analyze-file")
        async def analyze(file: UploadFile, user=Depends(get_current_user)):
    """
    if DISABLE_AUTH:
        return _dev_user()

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_jwt(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload  # contains "sub" (user id), "email", etc.


def verify_ws_token(token: str) -> dict | None:
    """Same verification, but for use inside a WebSocket handshake (no header)."""
    if DISABLE_AUTH:
        return _dev_user()
    return decode_jwt(token)
