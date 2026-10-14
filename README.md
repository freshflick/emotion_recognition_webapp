# Emphona

Emphona is a multimodal speech emotion recognition application with a React
frontend, a FastAPI inference backend, and Supabase authentication and persistence.
It supports live microphone analysis, audio uploads, transcripts, saved reports,
and emotion analytics. This README is the shared frontend, backend, and deployment
guide; commands run from the repository root unless stated otherwise.

## Use The Hosted App

Open **[emphona.app](https://emphona.app)**, create an account or sign in, and
start a live analysis or upload an audio recording. No local installation,
model downloads, or deployment setup is required to use our hosted application.
Allow microphone access when using live analysis.

| Service | Production URL |
| --- | --- |
| Web application | <https://emphona.app> |
| GPU backend API | <https://freshflick--emotion-monitor-backend-fastapi-app.modal.run> |
| GPU backend health | <https://freshflick--emotion-monitor-backend-fastapi-app.modal.run/api/health> |
| CPU control API | <https://freshflick--emotion-monitor-backend-control-api.modal.run> |
| CPU control health | <https://freshflick--emotion-monitor-backend-control-api.modal.run/api/health> |

The backend URLs are API origins, not web pages: opening their root path can
return `{"detail":"Not Found"}`. Use `/api/health` to check service availability.
Uploads, saved reports, and live sessions require authentication. GPU inference
may take longer on the first request after an idle period because of cold starts.

The development and deployment sections below are for contributors and
maintainers, not prerequisites for using Emphona.

## Architecture

```text
React / Vite frontend (Cloudflare Worker + static assets)
    |-- Supabase Auth: sign-in, recovery, MFA, profile
    |-- Modal CPU control API: health, quotes, saved reports
    `-- Modal GPU API: uploads and live WebSocket inference
            |-- Faster-Whisper: English transcription
            |-- Emotion2Vec Large: audio features
            |-- EmoBERTa-large: text features
            `-- Supabase: report and audio persistence
```

FastAPI verifies Supabase JWTs and owns report persistence using a server-side
secret key. The browser uses only the Supabase publishable key.

| Component | Model / technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Recharts |
| Backend | FastAPI, PyTorch, Faster-Whisper |
| Audio encoder | `iic/emotion2vec_plus_large` through FunASR |
| Text encoder | `tae898/emoberta-large` |
| Final transcription | Whisper `medium.en` by default |
| Live preview transcription | Whisper `base.en` by default |
| Speaker recognition | `speechbrain/spkrec-ecapa-voxceleb` |
| Model labels | Neutral, Happy, Sad, Angry, Frustrated |

The frontend displays four emotion categories, merging Frustrated into Angry.
Audio-only and text-only comparison predictions use the shared classifier with
the other modality's features zeroed; they are not separately trained heads.

## Contributor Development

This optional local setup is for developing or testing changes. Regular users
should use the hosted app above; `localhost` URLs below refer only to a
contributor's development machine.

Requirements: Node.js and pnpm, Python 3.12, and `ffmpeg` on `PATH`. Python 3.12
matches the Modal image and pinned PyTorch stack. Allow substantial disk space
for the checkpoint and downloaded model caches.

Install system dependencies, for example:

```bash
# macOS
brew install python@3.12 ffmpeg

# Ubuntu/Debian: install Python 3.12 separately if unavailable in your distro
sudo apt install ffmpeg
```

### Backend

In terminal 1:

```bash
cd backend
python3.12 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt

# Explicit local-only mode without a checkpoint or Supabase
DISABLE_AUTH=true USE_MOCK_MODEL=true uvicorn main:app --reload --port 8000
```

On Windows, activate with `venv\Scripts\activate` and set environment variables
using your shell's syntax instead of the inline assignments above.

For real inference, place the trained checkpoint at
`backend/checkpoints/iemocap_e2v_large_model.pt`, create `backend/.env`, and run
`uvicorn main:app --reload --port 8000` from `backend/`:

```dotenv
DISABLE_AUTH=true
USE_MOCK_MODEL=false
FUSION_MODEL_CHECKPOINT=checkpoints/iemocap_e2v_large_model.pt
DEVICE=cpu
WHISPER_MODEL_SIZE=medium.en
WHISPER_PREVIEW_MODEL_SIZE=base.en
```

The checkpoint must match the current five-class Emotion2Vec + EmoBERTa fusion
architecture. Checkpoints are not committed. Missing checkpoints stop startup
unless mock mode is explicitly enabled. Initial startup downloads model weights
and can take several minutes; CPU inference is slower than CUDA inference.

Local API URLs:

- Health: <http://localhost:8000/api/health>
- Interactive API documentation: <http://localhost:8000/docs>

To test model loading directly, from `backend/` with the environment activated:

```bash
python test_model_loads.py /path/to/clip.wav
```

### Offline Emotion Evaluation

`backend/evaluate_emotions.py` is a labeled-audio evaluation tool, not an
API endpoint. It compares the previous pipeline with an audio-focused candidate;
the tool does not train or automatically promote variants.
It requires real inference dependencies, ffmpeg, the matching checkpoint, and
`emotion_model.predict` with configurable audio fusion parameters. It refuses
mock mode. Help needs no models:

```bash
python backend/evaluate_emotions.py --help
# Run from backend/ with the real-inference environment above activated:
cd backend
USE_MOCK_MODEL=false python evaluate_emotions.py /data/holdout/manifest.csv --samples-per-class 3 --output /data/upload-evaluation.json
USE_MOCK_MODEL=false python evaluate_emotions.py /data/holdout/manifest.csv --pipeline live --output /data/live-evaluation.json
```

The default is three evenly spaced clips per class (12 total); use
`--samples-per-class` to select between one and ten per class. The Modal runner
has a 20-minute timeout to prevent an oversized evaluation from lingering.

The CSV requires `path,label` headers; `transcript` is optional. Relative audio
paths resolve from the CSV's directory, not the working directory. Each row must
be one single utterance in a complete decodable audio file, nonempty and at most
eight seconds. Longer files fail evaluation rather than being silently truncated;
utterance boundaries and ground-truth labels are the curator's responsibility.

```csv
path,label,transcript
clips/neutral.wav,Neutral,Let me explain the next step
clips/happy.wav,Happy,I'm pleased with how this turned out
clips/sad.wav,Sad,This has been a difficult week
clips/angry.wav,Angry,That's not what we agreed on
clips/frustrated.wav,Frustrated,This keeps happening
```

Labels are case-sensitive: `Neutral`, `Happy`, `Sad`, `Angry`, `Frustrated`.
Evaluation uses the **four UI categories**, explicitly mapping ground truth and
predicted `Frustrated` to `Angry`. Four-label or five-label manifests are accepted;
full coverage means all four mapped categories, not all five backend labels.
Predictions map the backend's top label (they do not reselect the winner after
merging scores). JSON includes original five-class scores and four-class scores
with Angry and Frustrated summed.

All variants share each row's supplied nonblank transcript, or one STT pass on
the original decoded, unenhanced and unpadded audio. This controls transcription
differences; it is not a full end-to-end upload/live benchmark. The default
`--pipeline upload` baseline enhances then pads, matching a single normal upload
window without subject enrollment. `--pipeline live` pads, noise-gates at 0.01,
then enhances, matching completed-turn emotion preprocessing. Neither mode
simulates speech rejection, window splitting, speaker attribution, or streaming.

| Paired variant | Audio preprocessing | Audio boost | Keyword fallback |
| --- | --- | --- | --- |
| `baseline` | Selected upload/live pipeline | 2.0 | Enabled |
| `no_keyword_fallback` | Same as baseline | 2.0 | Disabled |
| `raw_no_fallback` | Raw decoded audio, padded only | 2.0 | Disabled |
| `raw_learned_gate` | Raw decoded audio, padded only | 1.0 | Disabled |
| `audio_focused` | Raw decoded audio, padded only | 1.0 | Disabled; blends the native Emotion2Vec audio head at 0.8 |

`raw_learned_gate` names a comparison using the existing learned fusion gate,
not a newly trained gate. The report prints JSON and optionally writes the same
report to `--output` (its parent directory must exist). It contains counts,
accuracy, per-class recall, macro recall over observed classes, all predictions
and scores, and baseline-correct/candidate-wrong regressions with path, expected,
baseline, and candidate labels. Missing-class recall is `null`.

A variant is listed in `candidate_only` only with complete four-class coverage,
strictly higher macro recall, strictly higher Happy and Sad recalls, and no class
recall decrease against the paired baseline. Incomplete coverage is diagnostic
only and never qualifies a recommendation. Passing is observed evidence on this
dataset, not a general guarantee or automatic promotion. Keep a labeled holdout
separate from any clips used for tuning preprocessing, biases, or thresholds;
do not tune repeatedly on the holdout and call the result independent evidence.

Production inference preserves the decoded waveform for Emotion2Vec, disables
keyword-based emotion replacement, leaves the learned audio/text gate unboosted,
and blends the pretrained Emotion2Vec emotion head with the existing fusion output
at 0.8. The blend is reduced when Emotion2Vec assigns much probability to
unsupported categories. Neutral, Angry, and Frustrated receive small negative
logit adjustments; Angry and Frustrated are both adjusted because the UI combines
them. These are initial configurable settings, not weights calibrated on an
independent holdout. The enhancement function remains available for comparison.

### Frontend

In terminal 2, from the repository root:

```bash
pnpm install
pnpm dev
```

Open <http://localhost:5173>. Vite proxies `/api` and `/ws` to the local backend
on port 8000 by default. No frontend `.env` is necessary for local mock-mode
development. There are currently no tracked `.env.example` files.

For Supabase auth or remote APIs in development, create a root `.env`:

```dotenv
VITE_BACKEND_ORIGIN=http://localhost:8000
VITE_CONTROL_ORIGIN=http://localhost:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

Do not commit `.env` files, credentials, or checkpoints.

## Authentication And Storage

Configure these backend values for authenticated operation and persistence:

```dotenv
DISABLE_AUTH=false
USE_MOCK_MODEL=false
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-server-side-privileged-key
ALLOWED_ORIGINS=http://localhost:5173,https://emphona.app
```

Supabase setup:

1. Create an `emotion_reports` table with `id` (UUID primary key, default
   `gen_random_uuid()`), `user_id` (UUID referencing `auth.users`), `data` (JSONB),
   and `created_at` (timestamp with time zone, default `now()`).
2. Create an `audio-uploads` storage bucket; profile avatar uploads use an
   `avatars` bucket as well.
3. Configure appropriate Row Level Security and storage policies. User-facing
   report reads must be restricted to `user_id = auth.uid()`.
4. Set the Auth site URL to the frontend domain and allow the recovery redirect
   `https://emphona.app/reset-password` (plus local development URLs if needed).

The app supports password login, recovery, password changes, and authenticator
MFA. Password changes sign the user out after success. Session checks run on
navigation, focus, visibility, periodically, and after API authentication errors.
Revocation detection depends on Supabase's token/session behavior, not an
instant cross-device broadcast.

Never expose `SUPABASE_SECRET_KEY`, service-role credentials, or Modal tokens
to the browser. `DISABLE_AUTH=true` is only for local development. Missing
Supabase credentials do not automatically disable backend authentication.

## API And Analysis

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Public service/model health |
| `GET /api/quote` | Public daily ZenQuotes response with an attributed fallback |
| `POST /api/analyze-file` | Authenticated multipart audio analysis |
| `GET /api/reports` | Authenticated saved reports |
| `DELETE /api/reports` | Authenticated deletion with JSON body `{"ids": [...]}` |
| `WS /ws/live-session` | Live PCM16 transcription and emotion analysis |

The backend root `/` is not a webpage and returns `{"detail":"Not Found"}`.

### Uploads

Uploads support formats decodable by ffmpeg, including WAV, MP3, M4A, OGG,
FLAC, and WebM. The upload limit is 50 MiB; subject samples are limited to 10 MiB.
Audio is decoded to 16 kHz mono and split into model windows. The normal window
size is eight seconds; subject-enrolled uploads use `UPLOAD_WINDOW_SECONDS`
(four seconds by default).

Uploads are rejected if the first ten seconds contain no detectable speech
(or the entire clip for shorter files). Trim long silent introductions before
uploading. This check runs before subject enrollment and emotion analysis.

For a multi-person recording, submit an optional subject voice sample:

```bash
# Local dev with DISABLE_AUTH=true; production also requires a Bearer JWT
curl -X POST http://localhost:8000/api/analyze-file \
  -F "file=@conversation.wav" \
  -F "subject_sample=@alex-5s.wav" \
  -F "subject_name=Alex"
```

`utterances` contains the conversation's windows and transcripts; `segments`
contains only analysed subject windows. Without a subject sample, all windows
are treated as the subject. If the subject is not found, the headline `emotion`
is null rather than another person's prediction.

Each segment has its own fused prediction. The saved summary uses majority
voting across segment labels, while the API's headline `emotion` is the
highest-confidence segment. The upload status card shows the latest analysed
segment, not an aggregate prediction of the entire file.

### Live Sessions

The browser streams raw 16 kHz mono PCM16, not partial WebM containers. The
WebSocket auth handshake includes:

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

Speaker indices are zero-based. For multiple speakers, send `begin_enrollment`
and `end_enrollment` around each reference recording, then `start_analysis`.
`set_subject` changes the analysed speaker after enrollment. Other speakers
remain in the transcript with `isSubject: false` and `emotion: null`.

The client sends `flush` on turn boundaries and `end` to finalize the session.
Final `reading` messages include transcript, speaker, fused emotion, confidence,
and modality details. Rolling `preview` messages update provisional captions
and emotion display but do not enter saved reports. Completed live recordings
navigate to Analytics.

## Deployment

Production uses a Cloudflare **Worker with static assets**, not Cloudflare Pages.
Modal exposes separate GPU inference and CPU control APIs.

### Modal Backend

Install and authenticate the CLI:

```bash
python3.12 -m pip install modal
modal token new
```

In the Modal dashboard, create `emotion-monitor-secrets` with `SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, `ALLOWED_ORIGINS`, `DISABLE_AUTH=false`, and
`USE_MOCK_MODEL=false`. Set `WHISPER_MODEL_SIZE=medium.en` and
`WHISPER_PREVIEW_MODEL_SIZE=base.en` if overriding defaults. Existing secret
values take precedence over the transcription defaults in code.

Create the model volume once and upload the checkpoint:

```bash
modal volume create emotion-monitor-models
modal volume put emotion-monitor-models \
  backend/checkpoints/iemocap_e2v_large_model.pt \
  /iemocap_e2v_large_model.pt
modal deploy deploy/modal_app.py
```

The GPU service uses L4 by default, forces CUDA and real authenticated inference,
and mounts the model volume at `/models`. The volume also stores model caches.
To choose a different GPU, use `MODAL_GPU=<gpu-name>` when deploying. Keep auth
enabled in the shared secret because the CPU service uses that configuration.

The GPU service scales down after 180 seconds idle; the CPU control service
scales down after 60 seconds. GPU cold starts are expected after that window.
Ordinary health, quote, and report requests use the CPU service to avoid waking
the GPU. Configure workspace budgets and spending limits in Modal before use;
GPU hosting is not unlimited free compute.

### Cloudflare Frontend

`wrangler.toml` declares the Worker, static assets, custom-domain route, and
public runtime variables:

- `VITE_BACKEND_ORIGIN`: Modal GPU origin.
- `VITE_CONTROL_ORIGIN`: Modal CPU control origin.
- `VITE_SUPABASE_URL`: Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: browser-safe publishable key.

Update these values and the domain/zone route when deploying to another account
or project. Keep declared settings synchronized with the Cloudflare dashboard:
deploying local configuration can overwrite Dashboard-only settings.

```bash
npx wrangler login
pnpm build
npx wrangler deploy
```

For Git-connected Worker builds, use repository root, build command `pnpm build`,
and deployment command `npx wrangler deploy`.

Production configuration comes from `/config.js`, generated by `worker/index.js`
from Worker bindings. It is authoritative and does not fall back to local Vite
`.env` values. The Worker serves `dist/` with SPA routing fallback.

### Deployment Checks

- Frontend: <https://emphona.app>
- Runtime configuration: <https://emphona.app/config.js>
- GPU health: <https://freshflick--emotion-monitor-backend-fastapi-app.modal.run/api/health>
- CPU health: <https://freshflick--emotion-monitor-backend-control-api.modal.run/api/health>

GPU health should report `model_loaded=true`, `mock_mode=false`, and
`auth_disabled=false`. CPU health intentionally reports `model_loaded=false`:
it does not load inference models. Check login, recovery, upload, microphone
permissions, live captions, finalization, and saved reports in the browser.

## Configuration Reference

| Backend variable | Default / purpose |
| --- | --- |
| `DISABLE_AUTH` / `USE_MOCK_MODEL` | Both false; explicit local-only bypass/mock flags |
| `FUSION_MODEL_CHECKPOINT` | `checkpoints/iemocap_e2v_large_model.pt` |
| `DEVICE` | `cpu` locally; forced `cuda` on Modal GPU |
| `ALLOWED_ORIGINS` | Local Vite origins; comma-separated production allowlist |
| `WHISPER_MODEL_SIZE` / `WHISPER_PREVIEW_MODEL_SIZE` | `medium.en` / `base.en` |
| `SPEAKER_MODEL_NAME` | `speechbrain/spkrec-ecapa-voxceleb` |
| `SUBJECT_MATCH_SIMILARITY` | `0.45`; subject embedding similarity cutoff |
| `UPLOAD_WINDOW_SECONDS` | `4.0`; subject-enrolled upload windows |
| `MAX_UTTERANCE_SECS` / `MIN_UTTERANCE_SECS` | `8.0` / `0.6`; live analysis chunk bounds (natural pauses usually end a turn earlier) |
| `MAX_LIVE_SESSION_SECS` | `1500`; live WebSocket closes cleanly at 25 minutes, before Modal's 30-minute request timeout |
| `AUDIO_MODALITY_BOOST` | `1.0`; leaves the learned audio/text gate unboosted |
| `EMOTION2VEC_CLASSIFIER_BLEND` | `0.8`; gives Emotion2Vec's native four-class projection most of the final blend |
| `USE_TEXT_EMOTION_FALLBACK` | `false`; keyword fallback is opt-in |
| `NEUTRAL_LOGIT_ADJUSTMENT` / `ANGRY_LOGIT_ADJUSTMENT` / `FRUSTRATED_LOGIT_ADJUSTMENT` | `-0.15` / `-0.25` / `-0.10`; small additive inference calibration |
| `PREVIEW_INTERVAL_SECS` / `PREVIEW_MIN_SECS` | `0.8` / `0.5`; preview timing |
| `INFERENCE_WORKERS` | CPU count capped at four |

## Repository Layout

```text
README.md                         Shared project documentation
frontend/src/app/components/      Pages and UI
frontend/src/app/contexts/        Auth, profiles, session loading, accents
frontend/src/app/api/             REST/WebSocket clients, adapters, wire types
frontend/src/app/config/runtime.ts Runtime configuration precedence
frontend/src/styles/              Theme and shared styles
backend/main.py                  GPU API and upload pipeline
backend/control_app.py           CPU health, quotes, and report routes
backend/websocket_handler.py     Live session protocol
backend/auth.py                  JWT verification and development bypass
backend/storage.py               Supabase persistence
backend/config.py                Environment-driven backend settings
backend/models/                  Fusion, transcription, audio preprocessing
backend/checkpoints/             Local checkpoints (not committed)
deploy/modal_app.py              Modal deployment definition
worker/index.js                  Runtime configuration and static assets
wrangler.toml                    Cloudflare Worker configuration
```

## Verification And Troubleshooting

```bash
pnpm typecheck
pnpm build
python3 -m compileall -q backend
```

- **Checkpoint missing:** check the path relative to the backend working
  directory and use the matching fusion checkpoint. Mock mode must be explicit.
- **Audio decoding fails:** confirm `ffmpeg -version` works and the upload is a
  supported, complete audio file.
- **Backend unavailable:** check both health endpoints, CORS, and `/config.js`.
  An empty config usually means missing Worker bindings.
- **Slow inference:** GPU cold starts and model loading take time. Smaller
  Whisper models reduce latency but may lower transcription accuracy.
- **Password recovery redirect fails:** allow `/reset-password` in Supabase Auth
  redirect URLs and use a fresh recovery email.
- **Reports missing:** check Supabase credentials, table/bucket setup, policies,
  and the loading/error state rather than interpreting initial zeroes as data.
- **Build warnings:** the classic runtime `/config.js` script is intentionally
  external. Vite may also warn about large bundles and mixed imports.

Transcription is English-only and can mishear short/noisy clips. Speaker
attribution works best when people take turns; overlapping voices are not
separated. The fusion model uses eight-second audio inputs, and live PCM16
streaming uses approximately 32 KB/s upstream. Model outputs are estimates,
not definitive assessments of a person's emotions.
