# Deployment

The recommended production layout is:

```text
Cloudflare Pages (Vite frontend)
        |
        | HTTPS + WebSocket
        v
Modal A10G GPU (FastAPI backend + live inference)
        |
        v
Supabase Auth, Storage, and Reports
```

## 1. Modal authentication

Install the Modal CLI and authenticate locally. Do not paste the token into
the repository or chat:

```bash
python -m pip install modal
modal token new
```

Create the backend secret in Modal. The values are entered interactively and are
not written to this repository:

```bash
modal secret create emotion-monitor-secrets \
  SUPABASE_URL="https://your-project.supabase.co" \
  SUPABASE_SECRET_KEY="your-server-side-key" \
  SUPABASE_JWKS_URL="https://your-project.supabase.co/auth/v1/.well-known/jwks.json" \
  ALLOWED_ORIGINS="https://your-pages-domain.pages.dev" \
  DISABLE_AUTH="false" \
  DEVICE="cuda" \
  USE_MOCK_MODEL="false" \
  WHISPER_MODEL_SIZE="small.en" \
  WHISPER_PREVIEW_MODEL_SIZE="base.en"
```

Never use `DISABLE_AUTH=true` on the public deployment.

## 2. Upload the trained checkpoint

The checkpoint is intentionally not included in Git. Upload it to the Modal
Volume once:

```bash
modal volume put emotion-monitor-models \
  backend/checkpoints/iemocap_e2v_large_model.pt \
  /iemocap_e2v_large_model.pt
```

The volume also stores downloaded Whisper, Emotion2Vec, EmoBERTa, and ECAPA
files after the first startup, avoiding repeated model downloads.

## 3. Deploy the backend

Run this from the repository root:

```bash
modal deploy deploy/modal_app.py
```

Modal prints the HTTPS backend URL. Keep it for the Cloudflare Pages variable
below. The same origin supports REST calls and the `/ws/live-session` WebSocket.

Modal also prints a CPU control-service URL. Set that as
`VITE_CONTROL_ORIGIN`; it handles health, quotes, and reports without waking
the GPU. Set the GPU URL as `VITE_BACKEND_ORIGIN`; it is used only for file
analysis and live sessions.

To use a different GPU, set it at deploy time:

```bash
MODAL_GPU=L4 modal deploy deploy/modal_app.py
```

The default L4 GPU is recommended because this application loads the
large fusion stack, Whisper models, and ECAPA at the same time.

## 4. Deploy the frontend to Cloudflare Pages

Authenticate locally:

```bash
npx wrangler login
```

Build with the Modal URL:

```bash
VITE_BACKEND_ORIGIN="https://your-modal-url.modal.run" pnpm build
npx wrangler pages deploy dist --project-name emotion-monitor-frontend
```

For Git-based automatic deploys, create a Cloudflare Pages project connected to
this repository with:

| Setting | Value |
| --- | --- |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Root directory | repository root |
| Environment variable | `VITE_BACKEND_ORIGIN=https://your-modal-url.modal.run` |

Also set:

```text
VITE_CONTROL_ORIGIN=https://your-control-api.modal.run
```

Also configure the public Supabase frontend values used by the login flow:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-anon-or-publishable-key
```

The publishable/anon key is intended for browser use. Never put
`SUPABASE_SECRET_KEY` or any service-role key in Cloudflare Pages variables.

The frontend uses relative `/api` and `/ws` paths in development. In Pages,
`VITE_BACKEND_ORIGIN` directs both REST and WebSocket traffic to Modal.

## 5. First deployment checks

Replace the backend URL and run:

```bash
curl https://your-modal-url.modal.run/api/health
```

The response must contain:

```json
{
  "model_loaded": true,
  "mock_mode": false,
  "auth_disabled": false
}
```

Then open the Pages URL and verify login, file upload, microphone permission,
live partial captions, finalization, and report persistence.

## Cost and cold starts

Modal Starter currently includes monthly free compute, but it is not an
unlimited always-on free GPU. This deployment uses `min_containers=0` by
default and a 60-second `scaledown_window`, so the GPU is allocated only when
an API request or WebSocket connection reaches the backend. It shuts down after
one minute without traffic; the next request has a model-loading cold start.

Before deploying, set both billing safeguards in Modal Usage & Billing:

- **Workspace budget:** cap total usage at the value covered by your credits.
- **Workspace spend limit:** set this to `$0` if Modal accepts it, or the
  smallest allowed amount. This caps out-of-pocket charges after credits are
  exhausted.

The budget limits usage before credits are applied; the spend limit caps what
can actually be charged to your card. Do not deploy until both limits are
visible in the dashboard.
