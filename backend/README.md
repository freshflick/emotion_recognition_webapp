# Emotion Monitoring — FastAPI Backend

This is the API layer that sits between your React frontend and your
trained `FusionEmotionModel`. It doesn't retrain or evaluate anything —
that's what your `train.py` / `test.py` / `evaluate.py` are for. This just
serves your already-trained model over HTTP/WebSocket so a UI (or anything
else) can call it.

## What "backend" means here, concretely

- Your model can't run in a browser. Something has to load it into memory,
  accept audio, run inference, and send back a JSON result. That "something"
  is this FastAPI app.
- It also handles auth (checking who's making the request) and saving
  results (writing reports to Supabase) — the non-ML plumbing a real app needs.
- You do **not** need any frontend code to use or test this. FastAPI gives
  you a browsable API at `http://localhost:8000/docs` where you can upload
  a file and see the JSON response directly.

## Which of your files this backend actually uses

Copied straight from your `model.py` into `models/emotion_model.py`:
`FusionEmotionModel` (WavLM-large + emoberta-base + RMS/intensity gated fusion).
**If your team changes `model.py`'s architecture, update `models/emotion_model.py`
to match** — the state_dict loaded from your checkpoint has to line up
exactly with the class shape or `load_state_dict` will throw a size-mismatch
error at startup.

Your other files (`preprocess.py`, `split_data.py`, `train.py`, `dataset.py`,
`test.py`, `evaluate.py`) all belong to the **training repo**, not this backend
— keep them where they are. The only thing that crosses over is the one
checkpoint file `train.py` produces: `outputs/models/fusion_model.pt`.

`model_backup.py`, `old_preprocess.py`, and `trainv1.py` are earlier
iterations your team has since moved past — I'd move them into an
`archive/` folder in your training repo so nobody imports the wrong one
by accident.

## Setup

```bash
python -m venv venv
source venv/bin/activate         # Windows: venv\Scripts\activate
pip install -r requirements.txt

# also required on your OS (for audio format conversion):
#   Mac:    brew install ffmpeg
#   Ubuntu: sudo apt install ffmpeg
#   Windows: choco install ffmpeg (or download binary + add to PATH)

cp .env.example .env
```

The defaults in `.env.example` run without a checkpoint or Supabase project:
`USE_MOCK_MODEL=true` serves randomised predictions in the real response
shape, and `DISABLE_AUTH=true` accepts requests without a token. Both are
announced loudly at startup and surfaced in the UI, so nobody mistakes
placeholder output for results. Turn them off as the real pieces land.

**Dependencies** (see `requirements.txt`):

```
fastapi              # web framework / routing
uvicorn[standard]     # ASGI server that actually runs the app
python-dotenv         # loads .env into environment variables
pyjwt                 # verifies Supabase JWTs
supabase              # Supabase Python client (DB + storage)
python-multipart      # required by FastAPI for file uploads (UploadFile)

openai-whisper        # speech-to-text
pydub                 # audio format conversion (webm/opus -> wav)
torchaudio            # audio loading/resampling to match dataset.py
soundfile             # audio I/O backend used by torchaudio/pydub

torch                 # model runtime
transformers          # AutoModel/AutoTokenizer/AutoFeatureExtractor (WavLM, emoberta)
sentencepiece         # tokenizer backend some HF models need
numpy                 # array handling
```

Copy your trained checkpoint into this project:

```bash
mkdir -p checkpoints
cp /path/to/outputs/models/fusion_model.pt checkpoints/fusion_model.pt
```

## Step 1 — verify the model works, with zero API/frontend involved

```bash
python test_model_loads.py path/to/any_test_clip.wav
```

This should print a transcript and an emotion prediction. If this fails,
the API will fail too for the same reason — debug here first, it's much
faster than debugging through HTTP.

## Step 2 — run the API

```bash
uvicorn main:app --reload --port 8000
```

Open `http://localhost:8000/docs` — you can call `/api/analyze-file`
directly from that page (upload a WAV, hit "Execute") without writing any
frontend code at all.

## API contract

The frontend implements the client side of all of this in
`frontend/src/app/api/` — if you change a shape here, change it there too.

All routes require `Authorization: Bearer <supabase_jwt>` unless
`DISABLE_AUTH=true`.

**`GET /api/health`** — no auth. Reports which subsystems are actually live;
the UI uses it to drive its status indicators.

```json
{"status": "ok", "model_loaded": true, "mock_mode": false,
 "auth_disabled": false, "persistence_enabled": true,
 "labels": ["Neutral", "Happy", "Sad", "Angry"]}
```

**`POST /api/analyze-file`** — upload one audio file, get a timeline back.

The model's input window is a fixed 8 seconds, so longer files are split into
consecutive windows and predicted separately — otherwise a 2-minute recording
would be truncated to its first 8 seconds and reported as the whole file.
`emotion` is the highest-confidence window, for callers wanting one headline.

```json
{
  "transcript": "full transcript, all segments joined",
  "emotion": { "...": "highest-confidence segment, shape below" },
  "segments": [
    {
      "start": 0.0, "end": 8.0,
      "transcript": "I can't believe you did that",
      "emotion": {
        "probs": {"Neutral": 0.05, "Happy": 0.02, "Sad": 0.10, "Angry": 0.83},
        "top_label": "Angry",
        "confidence": 0.83,
        "modality_weights": {"audio": 0.71, "text": 0.29}
      }
    }
  ],
  "duration_secs": 42.3,
  "report_id": "..."
}
```

`modality_weights` is the `modality_judge` softmax — the model's learned,
per-utterance answer to "how far do I trust the voice vs the words here?".
Note this is a *trust weighting*, not a per-modality prediction: there's one
classifier over the fused vector, so an audio-only emotion label isn't
something this architecture can produce.

**`WS /ws/live-session`** — live streaming audio.

1. First message (JSON): `{"token": "<jwt>", "format": "pcm16", "sampleRate": 16000}`
2. Server replies `{"type": "ready", ...}` once auth passes
3. Client streams **raw 16kHz mono PCM16** as binary frames
4. Server sends `{"type": "reading", "transcript": "...", "emotion": {...}}`
   every ~4 seconds of audio
5. Client sends `{"action": "end"}`; server flushes the final partial chunk,
   persists the session, replies `{"type": "summary", "reportId": "..."}`

> **Not MediaRecorder output.** MediaRecorder's WebM/Opus is only decodable as
> a complete file — chunks after the first have no container header, so
> decoding one in isolation fails. The client taps the Web Audio graph and
> sends headerless PCM instead, which can be sliced anywhere. See
> `frontend/src/app/api/liveSession.ts`.

**`GET /api/reports`** — list a user's past sessions/reports.

## Required Supabase setup (dashboard, not code)

1. **Table** `emotion_reports`: `id (uuid, pk, default gen_random_uuid())`,
   `user_id (uuid, references auth.users)`, `data (jsonb)`,
   `created_at (timestamptz, default now())`
2. **Storage bucket** named `audio-uploads`
3. **Row Level Security** on `emotion_reports`: `user_id = auth.uid()` for select

## Moving to the cloud GPU later

Once you've picked a GPU host:
- Set `DEVICE=cuda` in `.env`
- Same code runs unchanged — `torch.load(..., map_location=device)` and
  `.to(device)` calls already handle CPU/GPU transparently
- WavLM-large is a big model; make sure whatever GPU box you pick has enough
  VRAM headroom for it plus Whisper loaded simultaneously
