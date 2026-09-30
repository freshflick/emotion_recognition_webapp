# Emotion Recognition Backend

FastAPI service for audio transcription and multimodal emotion recognition.
The backend serves the trained fusion model used by the React frontend. It does
not train the model.

## Architecture

```text
Audio upload or microphone
          |
          v
Audio decoding and preprocessing
          |
          +--> Faster-Whisper -- English transcript
          |
          +--> Emotion2Vec Large -- voice features
                              |
EmoBERTa-large -------------+
                              v
                   Fusion classifier
                              |
             fused emotion + modality results
```

The production fusion model uses:

- **Audio:** `iic/emotion2vec_plus_large` through FunASR
- **Text:** `tae898/emoberta-large`
- **Speech-to-text:** Faster-Whisper, configured as `small.en` by default
- **Speaker recognition:** ECAPA-TDNN (`speechbrain/spkrec-ecapa-voxceleb`)
- **Labels:** `Neutral`, `Happy`, `Sad`, `Angry`, and `Frustrated`

The model internally keeps `Frustrated` as a separate class. The frontend maps
it to `Angry` when displaying charts and summaries.

## Project Files

| File | Purpose |
| --- | --- |
| `main.py` | FastAPI application, startup, health and upload routes |
| `websocket_handler.py` | Live PCM16 WebSocket pipeline |
| `models/emotion_model.py` | Emotion2Vec + EmoBERTa fusion model and inference |
| `models/stt.py` | Faster-Whisper transcription |
| `models/audio_utils.py` | WAV conversion, resampling, windows, and preprocessing |
| `auth.py` | Supabase JWT and local development authentication |
| `storage.py` | Optional Supabase report and audio persistence |
| `checkpoints/` | Local model checkpoints; not committed to Git |

## Requirements

- Python 3.11 or newer
- `ffmpeg` available on `PATH`
- Approximately 2 GB for the fusion checkpoint
- Additional disk space for Emotion2Vec, EmoBERTa, and Faster-Whisper caches

Install `ffmpeg`:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

## Installation

From the `backend` directory:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Copy the trained checkpoint into the backend:

```bash
mkdir -p checkpoints
cp /path/to/iemocap_e2v_large_model.pt checkpoints/iemocap_e2v_large_model.pt
```

The checkpoint path must match `FUSION_MODEL_CHECKPOINT` in `backend/.env`.

## Environment Variables

Create `backend/.env`. Do not commit it.

```env
DISABLE_AUTH=true
DEV_USER_ID=00000000-0000-0000-0000-000000000000
USE_MOCK_MODEL=false

FUSION_MODEL_CHECKPOINT=checkpoints/iemocap_e2v_large_model.pt
WHISPER_MODEL_SIZE=small.en
WHISPER_PREVIEW_MODEL_SIZE=base.en
DEVICE=cpu
SPEAKER_MODEL_NAME=speechbrain/spkrec-ecapa-voxceleb
SUBJECT_MATCH_SIMILARITY=0.45
UPLOAD_WINDOW_SECONDS=4.0
MAX_UTTERANCE_SECS=12.0
MIN_UTTERANCE_SECS=0.6
PREVIEW_INTERVAL_SECS=0.8
PREVIEW_MIN_SECS=0.5
```

For optional Supabase persistence, also configure:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-server-side-key
SUPABASE_JWKS_URL=https://your-project.supabase.co/auth/v1/.well-known/jwks.json
```

Use `DISABLE_AUTH=true` only for local development. For a deployed instance,
set it to `false` and configure Supabase authentication.

## Running the Server

```bash
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

Useful URLs:

- API documentation: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/api/health`

The health response reports model state, labels, and the configured audio and
text model names.

## API Routes

### `GET /api/health`

Returns backend and model status. This route does not require authentication.

### `POST /api/analyze-file`

Accepts an audio upload as multipart form data. Supported formats depend on
`ffmpeg`, including WAV, MP3, M4A, OGG, FLAC, and WebM.

Files are decoded to 16 kHz mono audio and split into eight-second model
windows. Each window returns a transcript and emotion result.

#### Analysing one person in a multi-person recording

A single microphone cannot separate two voices that overlap, so rather than
trying, the endpoint can be told whose emotions you care about. Supply a short
`multipart` field `subject_sample` containing a few seconds of the subject's
voice, plus an optional `subject_name` used as the display label:

```bash
curl -X POST http://localhost:8000/api/analyze-file \
  -F "file=@conversation.wav" \
  -F "subject_sample=@alex-5s.wav" \
  -F "subject_name=Alex"
```

The sample is enrolled as a single ECAPA voice profile, and the file is then cut
into shorter four-second windows so a window is less likely to straddle two
speakers. Each window is matched against that profile:

- `utterances` — every window, with `isSubject`, `matchScore` and a transcript.
- `segments` — only the subject's windows, each with an emotion result.

So the full conversation is still transcribed, while emotion, statistics and
reports describe one person. If the subject never speaks, `emotion` is `null`
rather than being filled in with somebody else's reading.

Omit `subject_sample` to keep the previous single-speaker behaviour, where
every window is treated as the subject.

`SUBJECT_MATCH_SIMILARITY` (default `0.45`) sets the cosine-similarity cutoff.
Same-speaker ECAPA embeddings typically score around 0.6–0.8 and different
speakers 0.0–0.3, so the default sits in the gap; lower it to be more
inclusive, raise it to be stricter. `UPLOAD_WINDOW_SECONDS` (default `4.0`)
controls the window length used when a subject is enrolled.

### `WS /ws/live-session`

Live sessions use raw 16 kHz mono PCM16 frames, not MediaRecorder WebM chunks.

Handshake:

```json
{
  "token": "<jwt>",
  "format": "pcm16",
  "sampleRate": 16000,
  "expectedSpeakers": 2,
  "subjectSpeakerIndex": 0,
  "subjectName": "Alex"
}
```

`subjectSpeakerIndex` is zero-based and optional. When set, only that enrolled
speaker's chunks are run through the emotion model; everyone else is still
transcribed and labelled, but arrives with `emotion: null` and
`isSubject: false`. Omit it to analyse every speaker.

The server replies with `ready`, processes buffered audio, and sends readings:

When `expectedSpeakers` is greater than one, enroll each speaker before
analysis. For each participant, send `begin_enrollment`, stream five seconds of
PCM16, then send `end_enrollment`:

```json
{"action":"begin_enrollment","speakerIndex":0}
{"action":"end_enrollment"}
```

After every speaker returns `enrollment_complete`, send:

```json
{"action":"start_analysis"}
```

```json
{
  "type": "reading",
  "speaker": "Speaker 1",
  "speakerConfidence": 0.91,
  "isSubject": true,
  "transcript": "Example text.",
  "emotion": {
    "top_label": "Happy",
    "confidence": 0.82,
    "modality_weights": {"audio": 0.61, "text": 0.39},
    "audio_emotion": {"label": "Happy", "confidence": 0.74},
    "text_emotion": {"label": "Neutral", "confidence": 0.58}
  }
}
```

A non-subject turn is the same message with `"isSubject": false` and
`"emotion": null`.

### Rolling live previews

While the speaker continues, the client requests a rolling preview:

```json
{"action":"preview"}
```

The server replies with `type: "preview"` using the latest audio window, then
`type: "preview_done"`. Preview messages update the live emotion card only;
they are not added to `session_readings`, the transcript, charts, or saved
reports. The pause-triggered `reading` remains the authoritative final result.
`PREVIEW_INTERVAL_SECS` controls how often the browser requests a preview and
`PREVIEW_MIN_SECS` prevents very short/noisy snippets from reaching Whisper.
Partial captions use `WHISPER_PREVIEW_MODEL_SIZE` so they do not wait for the
larger final-transcript model. The final sentence still uses
`WHISPER_MODEL_SIZE` for accuracy. Both models are loaded at startup, using
more CPU/RAM in exchange for lower live-caption latency.

### Turn boundaries

The server does not cut utterances on a timer. It buffers audio and waits for
the client to declare a boundary, which it does by detecting a pause of roughly
1000 ms:

```json
{"action":"flush"}
```

That is what keeps a sentence intact — a fixed-length chunker splits turns
mid-word and leaves the speaker with no idea a cut was coming, which is exactly
what makes two people talk over each other. Three settings bound the behaviour:

| Setting | Default | Role |
| --- | --- | --- |
| `MAX_UTTERANCE_SECS` | `12.0` | Ceiling for a monologue that never pauses. Committed automatically. |
| `MIN_UTTERANCE_SECS` | `0.6` | A shorter pause is discarded as a cough rather than analysed. |
| `SPEECH_END_SILENCE_MS` | `1000` | Client-side pause that triggers `flush`. |

A silence-triggered commit has its trailing 350 ms trimmed before analysis, so
the pause does not dilute the speaker embedding. After every commit the server
sends `{"type":"flush_done"}` — including for a pause containing no speech, so
the client never waits on a reading that will not arrive. The client uses this
to clear its "finalising" state and to advance the turn prompt.

Send `{"action":"end"}` to commit the final buffer and close the session.

### Changing the subject mid-session

The subject picker only becomes available once everyone has enrolled, which is
*after* the socket opened to perform that enrollment — so the value in the
auth handshake is always stale. Send the choice over the open socket instead:

```json
{"action":"set_subject","speakerIndex":1,"name":"Sam"}
```

`null` analyses every speaker. The server replies
`{"type":"subject_updated","subjectSpeaker":"Speaker 2"}`. Safe to send more
than once; the latest wins.

### `GET /api/reports`

Returns saved reports when Supabase persistence is configured.

## Inference Details

- Audio is resampled to 16 kHz mono and padded or truncated to eight seconds.
- Live chunks use voice activity and silence checks before transcription, and
  Faster-Whisper applies its built-in VAD to reduce pause hallucinations.
- Audio preprocessing includes gating, normalization, dynamic-range
  compression, and high-pass filtering.
- Faster-Whisper is forced to English and runs locally.
- Live sessions can expect one to four speakers. Each participant records a
  reference sample first; subsequent ECAPA embeddings are matched only against
  those fixed profiles, producing stable `Speaker 1`, `Speaker 2`, etc. labels.
- Single-microphone diarization works best when speakers take turns. Overlap
  and very short utterances can still be assigned incorrectly.
- Two people speaking at the same time are not separated. Source separation
  (SepFormer) was evaluated and removed: its output is degraded enough that
  both transcription and speaker matching got worse. During genuine overlap the
  louder voice is treated as the active speaker, which is the safer failure.
- To keep one person's emotions out of a group recording, pick them as the
  subject (live sessions) or attach a `subject_sample` (uploads). Everything
  else is transcribed but never reaches the emotion model, so statistics and
  reports describe the subject alone. This is attribution, not separation: a
  window in which two people talk over each other matches whoever dominates it,
  and a subject who does not speak at all produces no emotion data.
- The fusion model returns a fused prediction plus audio-only and text-only
  comparison predictions.
- The live UI uses a five-second rolling emotion window for the current result.

## Supabase Persistence

Persistence is optional. If enabled, configure:

1. An `emotion_reports` table with `id`, `user_id`, `data`, and `created_at`.
2. An `audio-uploads` storage bucket.
3. Appropriate Row Level Security policies.

Without Supabase configuration, predictions still work but reports are not
saved or listed.

## Troubleshooting

### Checkpoint not found

Confirm the file exists and the path is relative to `backend`:

```bash
ls -lh checkpoints/iemocap_e2v_large_model.pt
```

### `ffmpeg` not found

Install `ffmpeg` and confirm it is available:

```bash
ffmpeg -version
```

### Slow transcription

Use `WHISPER_MODEL_SIZE=tiny.en` or `base.en` for lower latency. `small.en` is
more accurate but requires more CPU time. A CUDA-capable machine can use
`DEVICE=cuda` if the installed PyTorch build supports it.

### Mock results appear

Mock mode is only enabled when `USE_MOCK_MODEL=true` is explicitly set. With
the normal `false` setting, a missing checkpoint stops startup instead of
silently returning random predictions. Confirm that
`FUSION_MODEL_CHECKPOINT` points to the real checkpoint.
