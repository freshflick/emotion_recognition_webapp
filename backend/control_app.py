"""CPU-only control-plane API for the hosted deployment.

The GPU service handles only inference and live WebSockets. Keeping health,
quotes, and report reads here prevents an idle dashboard from waking the GPU
container.
"""

import random
import time
from datetime import datetime, timezone

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from auth import get_current_user
from config import ALLOWED_ORIGINS, DISABLE_AUTH
from models import emotion_model
from storage import delete_user_reports, get_user_reports
import storage


FALLBACK_QUOTES = [
    {"text": "Take a moment to reflect on how you're feeling.", "author": "Unknown"},
    {"text": "Understanding your emotions is the first step to understanding yourself.", "author": "Unknown"},
]
QUOTE_API_URL = "https://zenquotes.io/api/random"
_quote_cache: dict = {"quote": None, "date": None}

app = FastAPI(title="Emotion Monitor Control API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    # This endpoint intentionally reports service availability, not inference
    # model readiness. The GPU service is checked when inference starts.
    return {
        "status": "ok",
        "model_loaded": False,
        "mock_mode": False,
        "auth_disabled": DISABLE_AUTH,
        "persistence_enabled": storage.is_enabled(),
        "labels": emotion_model.LABEL_NAMES,
        "audio_model": emotion_model.AUDIO_MODEL_NAME,
        "text_model": emotion_model.TEXT_MODEL_NAME,
    }


@app.get("/api/quote")
async def quote():
    today = time.strftime("%Y-%m-%d")
    if _quote_cache["date"] != today or _quote_cache["quote"] is None:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(QUOTE_API_URL)
                response.raise_for_status()
                data = response.json()
                _quote_cache["quote"] = {"text": data[0]["q"], "author": data[0]["a"]}
        except Exception:
            _quote_cache["quote"] = random.choice(FALLBACK_QUOTES)
        _quote_cache["date"] = today
    return _quote_cache["quote"]


@app.get("/api/reports")
async def list_reports(user: dict = Depends(get_current_user)):
    return get_user_reports(user["sub"])


@app.delete("/api/reports")
async def delete_reports(body: dict, user: dict = Depends(get_current_user)):
    ids = body.get("ids") if isinstance(body, dict) else None
    if not isinstance(ids, list) or not ids or not all(isinstance(i, str) for i in ids):
        raise HTTPException(status_code=400, detail='Expected JSON body {"ids": [...]}')
    return {"deleted": delete_user_reports(user["sub"], ids)}
