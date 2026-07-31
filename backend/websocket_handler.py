"""
Live audio session over WebSocket.

Protocol (frontend must follow this):
  1. Client opens ws connection to /ws/live-session
  2. First message: JSON {"token": "<supabase jwt>"}
  3. Then client streams raw audio bytes (binary frames) continuously
     — whatever MediaRecorder emits (e.g. webm/opus chunks)
  4. Server buffers audio, and every CHUNK_THRESHOLD_BYTES worth, runs the
     pipeline (transcribe -> fusion model) and sends back:
     {"transcript": str, "emotion": {"probs": {...}, "top_label": str, "confidence": float}}
  5. On disconnect, server persists the full session's readings as one
     report to Supabase.
  6. Client can end the session early by sending the text message:
     {"action": "end"}
"""
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import WebSocket, WebSocketDisconnect

from auth import verify_ws_token
from config import CHUNK_THRESHOLD_BYTES, INFERENCE_WORKERS
from models import stt, audio_utils, emotion_model
from storage import save_session_report

executor = ThreadPoolExecutor(max_workers=INFERENCE_WORKERS)


async def run_blocking(fn, *args):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, fn, *args)


async def process_chunk(raw_audio_bytes: bytes) -> dict:
    """
    Runs one buffered chunk of audio through: format conversion -> transcript
    (Whisper) -> your fusion model (audio waveform + transcript -> emotion).
    """
    wav_bytes = await run_blocking(audio_utils.to_wav_pcm16, raw_audio_bytes, "webm")
    waveform = await run_blocking(audio_utils.bytes_to_model_waveform, wav_bytes)

    transcript = await run_blocking(stt.transcribe, wav_bytes)
    emotion_result = await run_blocking(emotion_model.predict, waveform, transcript)

    return {
        "transcript": transcript,
        "emotion": emotion_result,
        "timestamp": time.time(),
    }


async def handle_audio_session(websocket: WebSocket):
    await websocket.accept()

    # --- 1. Auth handshake (first message must be the JWT) ---
    try:
        auth_msg = await websocket.receive_json()
    except Exception:
        await websocket.close(code=4000, reason="Expected JSON auth message first")
        return

    user = verify_ws_token(auth_msg.get("token", ""))
    if not user:
        await websocket.close(code=4001, reason="Invalid or missing token")
        return

    user_id = user["sub"]
    audio_buffer = bytearray()
    session_readings: list[dict] = []

    try:
        while True:
            message = await websocket.receive()

            if "bytes" in message and message["bytes"] is not None:
                audio_buffer.extend(message["bytes"])
            elif "text" in message and message["text"] is not None:
                if message["text"].strip() == '{"action": "end"}':
                    break
                continue

            if len(audio_buffer) >= CHUNK_THRESHOLD_BYTES:
                chunk_bytes = bytes(audio_buffer)
                audio_buffer.clear()

                try:
                    reading = await process_chunk(chunk_bytes)
                except Exception as e:
                    # don't kill the whole session over one bad chunk
                    await websocket.send_json({"error": str(e)})
                    continue

                session_readings.append(reading)
                await websocket.send_json(
                    {"transcript": reading["transcript"], "emotion": reading["emotion"]}
                )

    except WebSocketDisconnect:
        pass
    finally:
        if session_readings:
            report = {
                "readings": session_readings,
                "num_chunks": len(session_readings),
                "ended_at": time.time(),
            }
            try:
                save_session_report(user_id, report)
            except Exception as e:
                print(f"[warn] failed to save session report: {e}")
