"""
Live audio session over WebSocket.

Protocol (frontend/src/app/api/liveSession.ts implements the client side):

  1. Client opens ws connection to /ws/live-session

  2. First message, JSON:
       {"token": "<supabase jwt>", "format": "pcm16", "sampleRate": 16000,
        "expectedSpeakers": 2}
     `format` defaults to "pcm16"; "webm" is accepted for one-shot blobs but
     is NOT usable for a continuous stream (see below).

  3. Server replies {"type": "ready"} once auth passes, then the client
     streams audio as binary frames.

  4. The client cuts utterances on detected silence and sends {"action":"flush"};
     the server commits that buffer as one reading. The server also commits on
     its own once a buffer reaches MAX_UTTERANCE_SECS, as a ceiling for a
     monologue that never pauses. Either way the server runs the pipeline
     (wav -> transcript -> fusion model) and sends:
       {"type": "reading", "transcript": str, "emotion": {...} | null,
        "timestamp": float, "chunkIndex": int, "isSubject": bool}

  5. After every commit the server sends {"type": "flush_done"}, which tells the
     client that utterance is final and lets it clear its "finalising" state
     and advance the turn prompt. A pause containing no speech produces no
     reading, only this acknowledgement — the client must not wait for one.

  6. Client ends the session with {"action": "end"}; the server flushes any
     remaining audio, persists the session, and replies
       {"type": "summary", "reportId": str | null, "numReadings": int}

Why raw PCM and not MediaRecorder blobs
---------------------------------------
MediaRecorder produces WebM/Opus that is only decodable as a complete file —
every chunk after the first lacks a container header, so decoding one in
isolation fails. The original version of this handler passed each chunk
straight to ffmpeg as "webm", which could only ever have worked for the very
first chunk of a session. The client now captures raw PCM16 through the Web
Audio API instead, which is header-free and safe to slice at any point.
"""
import asyncio
import json
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

from fastapi import WebSocket, WebSocketDisconnect

from auth import verify_ws_token
from config import (
    INFERENCE_WORKERS,
    MAX_AUDIO_SAMPLES,
    MAX_UTTERANCE_SECS,
    MAX_LIVE_SESSION_SECS,
    MIN_UTTERANCE_SECS,
    PREVIEW_INTERVAL_SECS,
    PREVIEW_MIN_SECS,
    SAMPLE_RATE,
)
from models import audio_utils, emotion_model, stt
from models.speaker_diarization import OnlineSpeakerDiarizer
from storage import save_session_report

executor = ThreadPoolExecutor(max_workers=INFERENCE_WORKERS)

# Utterance bounds, in PCM16 bytes. 16 kHz mono is 2 bytes per sample, so
# seconds * SAMPLE_RATE * 2. A chunk under the minimum is dropped rather than
# analysed: too short to be a real turn, and Whisper tends to hallucinate on
# near-silence.
MIN_UTTERANCE_BYTES = int(MIN_UTTERANCE_SECS * SAMPLE_RATE * 2)
MAX_UTTERANCE_BYTES = int(MAX_UTTERANCE_SECS * SAMPLE_RATE * 2)
PREVIEW_INTERVAL_BYTES = int(PREVIEW_INTERVAL_SECS * SAMPLE_RATE * 2)
PREVIEW_MIN_BYTES = int(PREVIEW_MIN_SECS * SAMPLE_RATE * 2)
PREVIEW_MAX_BYTES = MAX_AUDIO_SAMPLES * 2


def _bounded_int(value, default: int, minimum: int, maximum: int) -> int:
    """Parse client input without allowing malformed JSON to kill a session."""
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(parsed, maximum))


async def run_blocking(fn, *args):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(executor, fn, *args)


def shutdown_executor():
    """Drain worker threads during FastAPI lifespan shutdown."""
    executor.shutdown(wait=True, cancel_futures=True)


async def process_chunk(
    raw_audio_bytes: bytes,
    diarizer: OnlineSpeakerDiarizer,
    fmt: str = "pcm16",
    sample_rate: int = SAMPLE_RATE,
    asr_audio_bytes: bytes | None = None,
    asr_ignore_before_secs: float = 0.0,
    subject_speaker: str | None = None,
    transcript_override: str | None = None,
) -> dict:
    """
    Runs one buffered chunk of audio through: container wrapping -> VAD check
    -> transcript (Whisper) -> the fusion model (audio waveform + transcript -> emotion).

    Only the subject speaker gets an emotion prediction. Everyone else is kept as
    transcript only, so statistics and reports describe one person while the
    conversation itself stays complete.
    """
    if fmt == "pcm16":
        wav_bytes = audio_utils.wrap_pcm16_as_wav(raw_audio_bytes, sample_rate)
        asr_wav_bytes = audio_utils.wrap_pcm16_as_wav(
            asr_audio_bytes or raw_audio_bytes, sample_rate
        )
    else:
        wav_bytes = await run_blocking(audio_utils.to_wav_pcm16, raw_audio_bytes, fmt)
        asr_wav_bytes = wav_bytes

    raw_waveform = await run_blocking(audio_utils.bytes_to_full_waveform, wav_bytes)

    # Use speech VAD rather than a fixed RMS cutoff. Quiet speech can be
    # emotionally meaningful; an absolute loudness gate disproportionately
    # discarded low-volume turns (including sad delivery).
    if not await run_blocking(stt.has_speech, raw_waveform):
        return {"transcript": "", "emotion": None, "timestamp": time.time(), "silent": True}

    # Transcription and speaker embedding are independent and can run together.
    speaker_future = run_blocking(diarizer.identify, raw_waveform)
    if transcript_override is None:
        transcript_future = run_blocking(
            stt.transcribe, asr_wav_bytes, asr_ignore_before_secs
        )
        transcript, (speaker, speaker_confidence) = await asyncio.gather(
            transcript_future, speaker_future
        )
    else:
        transcript = transcript_override
        speaker, speaker_confidence = await speaker_future

    # If ASR rejected the chunk as silence/noise/low-confidence speech, do not
    # manufacture an emotion reading from it.
    if not transcript.strip():
        return {"transcript": "", "emotion": None, "timestamp": time.time(), "silent": True}

    is_subject = subject_speaker is None or speaker == subject_speaker

    if not is_subject:
        # Someone else is talking. Keep the words, skip the (misleading) emotion
        # model entirely, which also saves inference time.
        return {
            "transcript": transcript,
            "emotion": None,
            "speaker": speaker,
            "speakerConfidence": speaker_confidence,
            "timestamp": time.time(),
            "silent": False,
            "isSubject": False,
        }

    # Keep the decoded waveform's natural loudness and prosody for emotion
    # inference. Hard gating/compression/high-pass processing can erase cues.
    waveform = audio_utils.pad_or_truncate(raw_waveform)

    # Emotion inference needs the completed transcript for audio-text fusion.
    emotion_result = await run_blocking(emotion_model.predict, waveform, transcript)

    return {
        "transcript": transcript,
        "emotion": emotion_result,
        "speaker": speaker,
        "speakerConfidence": speaker_confidence,
        "timestamp": time.time(),
        "silent": False,
        "isSubject": True,
    }


def _summarise(readings: list[dict]) -> dict:
    """Aggregate the subject's readings into the shape the Reports page wants.

    Only readings that carry an emotion (i.e. the subject's) take part, so the
    statistics describe that one person no matter how many people spoke.
    """
    analysed = [r for r in readings if r.get("emotion")]
    labels = [r["emotion"]["top_label"] for r in analysed]
    counts = Counter(labels)
    total = len(analysed)

    return {
        "dominant_label": counts.most_common(1)[0][0] if counts else None,
        "label_distribution": {k: v / total for k, v in counts.items()} if total else {},
        "average_confidence": (
            sum(r["emotion"]["confidence"] for r in analysed) / total if total else 0.0
        ),
        "utterances": len(readings),
        "analysed_utterances": total,
    }


async def handle_audio_session(websocket: WebSocket):
    await websocket.accept()
    deadline = time.monotonic() + MAX_LIVE_SESSION_SECS

    # --- 1. Auth handshake (first message must be JSON carrying the JWT) ---
    try:
        auth_msg = await asyncio.wait_for(websocket.receive_json(), timeout=15.0)
    except Exception:
        await websocket.close(code=4000, reason="Expected JSON auth message first")
        return
    if not isinstance(auth_msg, dict):
        await websocket.close(code=4000, reason="Expected a JSON object auth message")
        return

    try:
        user = verify_ws_token(auth_msg.get("token", ""))
    except Exception:
        user = None
    if not user:
        await websocket.close(code=4001, reason="Invalid or missing token")
        return

    fmt = auth_msg.get("format", "pcm16")
    if fmt != "pcm16":
        await websocket.close(code=4002, reason="Live sessions require pcm16 audio")
        return
    sample_rate = _bounded_int(auth_msg.get("sampleRate"), SAMPLE_RATE, 8_000, 48_000)
    if sample_rate != SAMPLE_RATE:
        await websocket.close(code=4003, reason="Live sessions require 16000Hz audio")
        return
    expected_speakers = _bounded_int(auth_msg.get("expectedSpeakers"), 1, 1, 4)
    diarizer = OnlineSpeakerDiarizer(expected_speakers)

    # Which enrolled speaker the emotion model should analyse. `subject_index` is
    # 0-based. An absent index means "nobody was picked", and then every
    # speaker is analysed — see is_subject in process_chunk.
    subject_index = auth_msg.get("subjectSpeakerIndex")
    if subject_index is None:
        subject_speaker = None
    else:
        subject_index = _bounded_int(subject_index, 0, 0, expected_speakers - 1)
        subject_speaker = f"Speaker {subject_index + 1}"
    requested_name = auth_msg.get("subjectName")
    subject_name = (
        requested_name.strip()[:60]
        if isinstance(requested_name, str)
        else None
    ) or None

    try:
        await run_blocking(diarizer.prepare)
    except Exception as e:
        await websocket.send_json(
            {"type": "error", "message": f"Could not load speaker recognition: {e}"}
        )
        await websocket.close(code=4010, reason="Speaker recognition unavailable")
        return

    user_id = user.get("sub") if isinstance(user, dict) else None
    if not user_id:
        await websocket.close(code=4001, reason="Token has no user id")
        return
    audio_buffer = bytearray()
    asr_tail = bytearray()
    enrollment_buffer = bytearray()
    enrollment_speaker: int | None = None
    analysis_started = expected_speakers == 1
    session_readings: list[dict] = []
    started_at = time.time()
    preview_task: asyncio.Task | None = None
    partial_preview_task: asyncio.Task | None = None
    preview_index = 0
    inference_lock = asyncio.Lock()

    await websocket.send_json(
        {
            "type": "ready",
            "chunkBytes": MAX_UTTERANCE_BYTES,
            "previewBytes": PREVIEW_INTERVAL_BYTES,
            "previewMinBytes": PREVIEW_MIN_BYTES,
            "sampleRate": sample_rate,
            "expectedSpeakers": expected_speakers,
            "requiresEnrollment": expected_speakers > 1,
            "subjectSpeaker": subject_speaker,
            "mock": emotion_model.is_mock(),
        }
    )

    async def send_preview(snapshot: bytes, transcript: str) -> None:
        """Analyse a rolling copy without committing it to the session.

        Preview audio is deliberately independent of the final utterance
        buffer. It can therefore update the live card every ~1.5 seconds while
        the speaker continues, without creating duplicate transcript rows or
        polluting the saved report with provisional emotion readings.
        """
        nonlocal preview_index

        current_index = preview_index
        preview_index += 1
        try:
            if len(snapshot) < PREVIEW_MIN_BYTES:
                return

            # Emotion inference accepts at most the model's eight-second
            # window. Keep the newest audio so a long sentence does not leave
            # the preview stuck on its opening words.
            preview_audio = snapshot[-PREVIEW_MAX_BYTES:]
            async with inference_lock:
                reading = await process_chunk(
                    preview_audio,
                    diarizer,
                    fmt,
                    sample_rate,
                    preview_audio,
                    0.0,
                    subject_speaker,
                    transcript,
                )

            if reading.get("silent"):
                return

            await websocket.send_json(
                {
                    "type": "preview",
                    "previewIndex": current_index,
                    "transcript": reading.get("transcript", ""),
                    "emotion": reading.get("emotion"),
                    "speaker": reading.get("speaker", "Speaker 1"),
                    "speakerConfidence": reading.get("speakerConfidence", 0.0),
                    "isSubject": reading.get("isSubject", True),
                    "timestamp": reading["timestamp"],
                }
            )
        except Exception as e:
            await websocket.send_json(
                {"type": "preview_error", "message": str(e), "previewIndex": current_index}
            )
        # `preview_done` belongs to the fast transcript lane below. The
        # emotion lane may continue after the partial text has appeared.

    async def send_partial_preview(snapshot: bytes) -> None:
        """Transcribe the current turn as quickly as possible.

        This intentionally does not wait for speaker matching or emotion
        inference. Faster-Whisper's rolling-window result is what gives the UI
        the Zoom-like partial transcript while the person is still speaking.
        """
        nonlocal preview_index, preview_task

        current_index = preview_index
        preview_index += 1
        try:
            if len(snapshot) < PREVIEW_MIN_BYTES:
                return
            preview_audio = snapshot[-PREVIEW_MAX_BYTES:]
            wav_bytes = await run_blocking(
                audio_utils.wrap_pcm16_as_wav, preview_audio, sample_rate
            )
            waveform = await run_blocking(
                audio_utils.bytes_to_full_waveform, wav_bytes
            )
            rms = float(waveform.pow(2).mean().sqrt())
            if rms < 0.005:
                return

            transcript = await run_blocking(
                stt.transcribe, wav_bytes, 0.0, True
            )
            if transcript.strip():
                await websocket.send_json(
                    {
                        "type": "preview_transcript",
                        "previewIndex": current_index,
                        "transcript": transcript,
                        "timestamp": time.time(),
                    }
                )
                # Queue the heavier emotion estimate only after partial text
                # has reached the browser. This guarantees the transcript lane
                # has first access to the user's attention.
                if preview_task is None or preview_task.done():
                    preview_task = asyncio.create_task(
                        send_preview(snapshot, transcript)
                    )
        except asyncio.CancelledError:
            return
        except Exception as e:
            await websocket.send_json(
                {
                    "type": "preview_error",
                    "message": str(e),
                    "previewIndex": current_index,
                }
            )
        finally:
            await websocket.send_json(
                {"type": "preview_done", "previewIndex": current_index}
            )

    async def flush(force: bool = False) -> None:
        """Run the pipeline over the buffered audio and emit one reading.

        Normally the *client* decides the boundary by detecting silence, so a
        chunk is a whole utterance rather than an arbitrary slice. `force` is
        that client request (the speaker paused). The untimed path exists only
        as a ceiling for a monologue that never pauses, and for the final
        buffer at end-of-session.
        """
        nonlocal audio_buffer, asr_tail, preview_task, partial_preview_task

        # The final answer must arrive after any older provisional answer. This
        # prevents an in-flight preview from overwriting the final emotion in
        # the UI after a pause has already closed the sentence.
        if partial_preview_task is not None:
            await partial_preview_task
            partial_preview_task = None
        if preview_task is not None:
            await preview_task
            preview_task = None

        threshold = MIN_UTTERANCE_BYTES if force else MAX_UTTERANCE_BYTES
        if len(audio_buffer) < threshold:
            # Tell the client we're done regardless, so it can clear its
            # "finalising" indicator instead of waiting for a reading that
            # this silence-only buffer will never produce.
            if force:
                await websocket.send_json({"type": "flush_done"})
            return

        # The client preserves pauses within a turn, then flushes after the
        # endpoint's one-second silence boundary. Trim only part of that known
        # trailing pause so it does not dilute VAD and speaker features while
        # retaining enough end padding for Whisper.
        if force and len(audio_buffer) > MIN_UTTERANCE_BYTES:
            trailing_silence = int(0.35 * SAMPLE_RATE * 2)
            keep = max(MIN_UTTERANCE_BYTES, len(audio_buffer) - trailing_silence)
            chunk_bytes = bytes(audio_buffer[:keep])
        else:
            chunk_bytes = bytes(audio_buffer)
        audio_buffer = bytearray()

        # Give Whisper 1.0s of previous audio so words split by a chunk
        # boundary remain complete. Word timestamps prevent duplicate output.
        if fmt == "pcm16":
            overlap_bytes = bytes(asr_tail)
            asr_chunk_bytes = overlap_bytes + chunk_bytes
            asr_ignore_before_secs = len(overlap_bytes) / (sample_rate * 2)
            tail_size = int(sample_rate * 2 * 1.0)
            asr_tail = bytearray(chunk_bytes[-tail_size:])
        else:
            asr_chunk_bytes = chunk_bytes
            asr_ignore_before_secs = 0.0

        try:
            async with inference_lock:
                reading = await process_chunk(
                    chunk_bytes,
                    diarizer,
                    fmt,
                    sample_rate,
                    asr_chunk_bytes,
                    asr_ignore_before_secs,
                    subject_speaker,
                )
        except Exception as e:
            # One bad chunk shouldn't take down the whole session.
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.send_json({"type": "flush_done"})
            return

        readings = [reading]

        # Silent chunks must not become fake readings. Otherwise the frontend
        # shows a random-looking emotion even though no speech was analysed.
        if not readings or all(item.get("silent") for item in readings):
            await websocket.send_json({"type": "flush_done"})
            return

        for item in readings:
            session_readings.append(item)
            await websocket.send_json(
                {
                    "type": "reading",
                    "transcript": item.get("transcript", ""),
                    "emotion": item.get("emotion"),
                    # .get rather than [..]: a silent chunk returns before the
                    # speaker is identified, so it has no speaker to report.
                    "speaker": item.get("speaker", "Speaker 1"),
                    "speakerConfidence": item.get("speakerConfidence", 0.0),
                    # The client needs this to know whose emotion (if any)
                    # belongs in the charts — the subject's only.
                    "isSubject": item.get("isSubject", True),
                    "timestamp": item["timestamp"],
                    "chunkIndex": len(session_readings) - 1,
                }
            )

        # Tells the client this utterance is fully analysed, which is what
        # clears its "finalising your sentence" state and advances the turn.
        await websocket.send_json({"type": "flush_done"})

    client_ended = False

    try:
        while True:
            remaining = deadline - time.monotonic()
            try:
                message = await asyncio.wait_for(
                    websocket.receive(), timeout=max(0.001, remaining)
                )
            except asyncio.TimeoutError:
                # Flush any complete final turn, then close well before Modal's
                # hard timeout instead of leaving its request loop to be killed.
                try:
                    await flush(force=True)
                    await websocket.close(
                        code=4008,
                        reason="Live session reached its 25-minute limit.",
                    )
                except Exception:
                    pass
                break

            if message["type"] == "websocket.disconnect":
                break

            if message.get("bytes") is not None:
                if enrollment_speaker is not None:
                    enrollment_buffer.extend(message["bytes"])
                elif analysis_started:
                    audio_buffer.extend(message["bytes"])
                    # Only a ceiling for a monologue that never pauses — the
                    # normal boundary is the client's silence-triggered flush.
                    if len(audio_buffer) >= MAX_UTTERANCE_BYTES:
                        await flush()

            elif message.get("text") is not None:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue
                if not isinstance(payload, dict):
                    await websocket.send_json(
                        {"type": "error", "message": "Expected a JSON object action"}
                    )
                    continue

                action = payload.get("action")

                if action == "set_subject":
                    # The subject picker only becomes available once everyone
                    # has enrolled, which is *after* the socket opened for
                    # enrollment — so the choice from the handshake is already
                    # stale by the time it is made. This is how it reaches the
                    # server. Safe to send more than once; the latest wins.
                    requested = payload.get("speakerIndex")
                    if requested is None:
                        subject_speaker = None
                    else:
                        index = _bounded_int(requested, 0, 0, expected_speakers - 1)
                        subject_speaker = f"Speaker {index + 1}"
                    requested_name = payload.get("name")
                    subject_name = (
                        requested_name.strip()[:60]
                        if isinstance(requested_name, str)
                        else None
                    ) or None
                    await websocket.send_json(
                        {"type": "subject_updated", "subjectSpeaker": subject_speaker}
                    )
                    continue

                if action == "flush":
                    # The client detected a pause: the speaker has finished, so
                    # commit this utterance now rather than waiting for a timer.
                    if analysis_started and enrollment_speaker is None:
                        await flush(force=True)
                    continue

                if action == "preview":
                    if (
                        analysis_started
                        and enrollment_speaker is None
                        and len(audio_buffer) >= PREVIEW_MIN_BYTES
                    ):
                        if preview_task is not None and preview_task.done():
                            preview_task = None
                        if partial_preview_task is not None and partial_preview_task.done():
                            partial_preview_task = None
                        snapshot = bytes(audio_buffer)
                        if partial_preview_task is None:
                            partial_preview_task = asyncio.create_task(
                                send_partial_preview(snapshot)
                            )
                    continue

                if action == "begin_enrollment":
                    try:
                        speaker_index = int(payload.get("speakerIndex", -1))
                    except (TypeError, ValueError):
                        speaker_index = -1
                    if analysis_started or not 0 <= speaker_index < expected_speakers:
                        await websocket.send_json(
                            {"type": "enrollment_error", "message": "Invalid enrollment request"}
                        )
                        continue
                    enrollment_speaker = speaker_index
                    enrollment_buffer = bytearray()
                    await websocket.send_json(
                        {"type": "enrollment_started", "speakerIndex": speaker_index}
                    )
                    continue

                if action == "end_enrollment":
                    if enrollment_speaker is None:
                        continue
                    speaker_index = enrollment_speaker
                    sample_bytes = bytes(enrollment_buffer)
                    enrollment_speaker = None
                    enrollment_buffer = bytearray()
                    try:
                        if len(sample_bytes) < sample_rate * 2 * 3:
                            raise ValueError("Record at least three seconds")
                        sample_wav = audio_utils.wrap_pcm16_as_wav(sample_bytes, sample_rate)
                        sample_waveform = await run_blocking(
                            audio_utils.bytes_to_full_waveform, sample_wav
                        )
                        await run_blocking(diarizer.enroll, speaker_index, sample_waveform)
                        await websocket.send_json(
                            {
                                "type": "enrollment_complete",
                                "speakerIndex": speaker_index,
                            }
                        )
                    except Exception as e:
                        await websocket.send_json(
                            {"type": "enrollment_error", "message": str(e)}
                        )
                    continue

                if action == "start_analysis":
                    if not diarizer.is_ready:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "message": "Enroll every expected speaker before starting",
                            }
                        )
                        continue
                    analysis_started = True
                    audio_buffer = bytearray()
                    asr_tail = bytearray()
                    await websocket.send_json({"type": "analysis_started"})
                    continue

                if action == "end":
                    await flush(force=True)  # don't discard the final partial chunk
                    client_ended = True
                    break
                if action == "pause" and analysis_started:
                    # Preserve a substantial final phrase, then clear overlap
                    # context so speech after resume starts cleanly.
                    await flush(force=True)
                    audio_buffer = bytearray()
                    asr_tail = bytearray()

    except WebSocketDisconnect:
        pass
    finally:
        pending_tasks = [
            task
            for task in (preview_task, partial_preview_task)
            if task is not None and not task.done()
        ]
        for task in pending_tasks:
            task.cancel()
        if pending_tasks:
            await asyncio.gather(*pending_tasks, return_exceptions=True)
        report_id = None
        # Only persist sessions explicitly ended by Stop & Save. Navigating
        # away closes the socket without `action: end` and must discard it.
        if client_ended and session_readings:
            report = {
                "type": "live",
                "readings": session_readings,
                "num_chunks": len(session_readings),
                "started_at": started_at,
                "ended_at": time.time(),
                "duration_secs": round(time.time() - started_at, 1),
                "summary": _summarise(session_readings),
                "subject_speaker": subject_speaker,
                "subject_name": subject_name,
                "speaker_count": expected_speakers,
            }
            try:
                saved = save_session_report(user_id, report)
                report_id = saved.get("id")
            except Exception as e:
                print(f"[warn] failed to save session report: {e}")

        if client_ended:
            try:
                await websocket.send_json(
                    {
                        "type": "summary",
                        "reportId": report_id,
                        "numReadings": len(session_readings),
                    }
                )
                await websocket.close()
            except Exception:
                pass
