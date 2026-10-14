/**
 * REST calls to the FastAPI backend.
 *
 * In development, an empty VITE_BACKEND_ORIGIN keeps requests relative so the
 * Vite proxy handles them. Cloudflare Pages sets that variable to the Modal
 * backend origin for production.
 */
import { getAccessToken } from "../lib/supabase";
import { BACKEND_ORIGIN, CONTROL_ORIGIN } from "../config/runtime";
import { BACKEND_LABELS } from "./types";
import type { AnalyzeFileResponse, HealthResponse, ReportRow } from "./types";

/** Thrown for any non-2xx response, carrying the status for call sites. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  // No token in dev mode — the backend accepts this when DISABLE_AUTH=true,
  // and returns 401 otherwise, which is the correct outcome either way.
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Pull a useful message out of FastAPI's error body, whatever shape it is. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      // FastAPI validation errors
      return body.detail.map((d: { msg?: string }) => d.msg).join("; ");
    }
    return JSON.stringify(body);
  } catch {
    return res.statusText || `Request failed (${res.status})`;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  origin = BACKEND_ORIGIN,
): Promise<T> {

  let res: Response;
  try {
    const authHeaders_ = await authHeaders();

    const headers = { ...authHeaders_, ...(init.headers ?? {}) };

    res = await fetch(`${origin}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    console.error('❌ Fetch error:', error);
    throw new ApiError(
        "Cannot reach the backend. Is it running on port 8000? (cd backend && uvicorn main:app --reload)",
        0,
    );
  }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("emphona:auth-invalid"));
    }
    const errorMsg = await errorMessage(res);
    console.error('❌ API error:', errorMsg, res.status);
    throw new ApiError(errorMsg, res.status);
  }

  return res.json() as Promise<T>;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health", {}, CONTROL_ORIGIN);
}

// Starting this request wakes Modal's GPU-backed app and loads its models.
// Keep it deduplicated because React StrictMode may mount effects twice in dev.
let inferenceWarmup: Promise<void> | null = null;
export function warmInferenceBackend(): Promise<void> {
  if (!inferenceWarmup) {
    inferenceWarmup = request<HealthResponse>("/api/health", {}, BACKEND_ORIGIN)
      .then(() => undefined)
      .catch((error) => {
        inferenceWarmup = null;
        throw error;
      });
  }
  return inferenceWarmup;
}

export interface QuoteResponse {
  text: string;
  author: string;
}

/** One quote per calendar day, fetched server-side (see main.py's /api/quote —
 *  it calls the upstream quotes API itself so the browser never has to deal
 *  with that API's own CORS policy). Unauthenticated; same for every user. */
export function getQuote(): Promise<QuoteResponse> {
  return request<QuoteResponse>("/api/quote", {}, CONTROL_ORIGIN);
}

/**
 * Upload one complete audio file and get a fused prediction back.
 *
 * `subjectSample` is an optional recording of the one person the user wants
 * analysed. With it, the backend attributes each window to either that person
 * or "someone else", and only the subject's windows come back with an emotion.
 * Without it the file is treated as a single speaker, which is all the earlier
 * behaviour was.
 */
export function analyzeFile(
  file: File,
  subjectSample?: Blob | null,
  subjectName?: string | null,
): Promise<AnalyzeFileResponse> {
  const form = new FormData();
  form.append("file", file);
  if (subjectSample && subjectSample.size > 0) {
    form.append("subject_sample", subjectSample, "subject-sample.webm");
  }
  const name = subjectName?.trim();
  if (name) form.append("subject_name", name.slice(0, 60));
  // No Content-Type header — the browser must set the multipart boundary.
  return request<AnalyzeFileResponse>("/api/analyze-file", {
    method: "POST",
    body: form,
  });
}

export function getReports(): Promise<ReportRow[]> {
  return request<ReportRow[]>("/api/reports", {}, CONTROL_ORIGIN);
}

/** Delete persisted session reports by id. Local-only sessions simply
 *  match nothing server-side; the caller drops them from the store anyway. */
export function deleteReports(ids: string[]): Promise<{ deleted: number }> {
  return request<{ deleted: number }>("/api/reports", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  }, CONTROL_ORIGIN);
}

/**
 * Warn (loudly, once) if the backend's label set has drifted from what the
 * UI adapter expects — e.g. someone retrains as 6-class and the frontend is
 * silently dropping two classes. Cheap insurance against a confusing demo.
 */
export function verifyLabels(health: HealthResponse): void {
  const expected = [...BACKEND_LABELS].sort().join(",");
  const actual = [...health.labels].sort().join(",");
  if (expected !== actual) {
    console.warn(
      `[api] Label mismatch — backend serves [${health.labels.join(", ")}] but ` +
        `the UI adapter maps [${BACKEND_LABELS.join(", ")}]. ` +
        `Update BACKEND_LABELS and LABEL_TO_EMOTION in src/app/api/.`,
    );
  }
}
