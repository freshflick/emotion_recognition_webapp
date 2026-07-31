"""
Verifies Supabase-issued JWTs. Supabase signs tokens with a project-specific
secret (HS256) unless you've switched to asymmetric JWT signing.
"""
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import SUPABASE_JWT_SECRET

security = HTTPBearer()


def decode_jwt(token: str) -> dict | None:
    """Returns the decoded payload if valid, else None."""
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
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Dependency for REST routes. Use as:
        @app.post("/api/analyze-file")
        async def analyze(file: UploadFile, user=Depends(get_current_user)):
    """
    payload = decode_jwt(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return payload  # contains "sub" (user id), "email", etc.


def verify_ws_token(token: str) -> dict | None:
    """Same verification, but for use inside a WebSocket handshake (no header)."""
    return decode_jwt(token)
