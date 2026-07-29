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
# fill in Supabase URL / service role key / JWT secret
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

## API contract (what your frontend will eventually call)

**`POST /api/analyze-file`** — upload one audio file, get one result back.
Requires `Authorization: Bearer <supabase_jwt>` header.

```json
// response
{
  "transcript": "I can't believe you did that",
  "emotion": {
    "probs": {"Neutral": 0.05, "Happy": 0.02, "Sad": 0.10, "Angry": 0.83},
    "top_label": "Angry",
    "confidence": 0.83
  },
  "report_id": "..."
}
```

**`WS /ws/live-session`** — live streaming audio.
1. First message (JSON): `{"token": "<supabase_jwt>"}`
2. Then send raw audio bytes as binary WebSocket frames continuously
   (whatever `MediaRecorder` produces)
3. Server sends back a JSON message every few seconds:
   `{"transcript": "...", "emotion": {...same shape as above...}}`
4. To end early, send text frame: `{"action": "end"}`

**`GET /api/reports`** — list a user's past sessions/reports.
Requires the same `Authorization` header.

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
