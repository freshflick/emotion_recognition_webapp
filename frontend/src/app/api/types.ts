/**
 * Wire types — these mirror the FastAPI responses exactly.
 *
 * Keep this file honest about what the backend actually sends. The
 * translation into the shapes the UI components want lives in adapters.ts.
 */

/**
 * The labels the trained model predicts, in the order preprocess.py's
 * LABEL_MAP defines (neu=0, hap=1, sad=2, ang=3).
 *
 * The backend is the source of truth here — GET /api/health returns this
 * same list, and `verifyLabels()` in client.ts warns if the two ever drift
 * apart (e.g. someone retrains with a 6-class setup and forgets the UI).
 */
export const BACKEND_LABELS = ["Neutral", "Happy", "Sad", "Angry", "Frustrated"] as const;
export type BackendLabel = (typeof BACKEND_LABELS)[number];

/** Per-utterance trust weighting produced by the model's modality_judge. */
export interface ModalityWeights {
  audio: number;
  text: number;
}

export interface EmotionResult {
  probs: Record<BackendLabel, number>;
  top_label: BackendLabel;
  confidence: number;
  modality_weights: ModalityWeights;
  audio_emotion?: { label: BackendLabel; confidence: number };
  text_emotion?: { label: BackendLabel; confidence: number };
  mock?: boolean;
}

/**
 * One window of an uploaded file that the subject spoke.
 *
 * `segments` only ever contains these, so charts and summaries fed from
 * `segments` describe the subject alone. `utterances` holds every window.
 */
export interface AnalysisSegment {
  start: number;
  end: number;
  transcript: string;
  emotion: EmotionResult;
}

/** One window of an uploaded file, whoever spoke in it. */
export interface Utterance {
  start: number;
  end: number;
  transcript: string;
  isSubject: boolean;
  /** ECAPA cosine similarity against the subject profile; null when no
   *  sample was supplied and the file was treated as a single speaker. */
  matchScore: number | null;
}

export interface AnalyzeFileResponse {
  /** All segment transcripts joined. */
  transcript: string;
  /** Highest-confidence subject segment, or null when the subject never
   *  spoke (their voice was enrolled but doesn't appear in the file). */
  emotion: EmotionResult | null;
  /** The subject's real timeline — the model window is fixed at 8s, so long
   *  files are analysed as consecutive windows rather than truncated. */
  segments: AnalysisSegment[];
  /** Every window with its speaker attribution, so the full conversation is
   *  available even though only `segments` was analysed for emotion. */
  utterances: Utterance[];
  /** Majority vote across the subject's windows (first-seen wins ties) — the
   *  same value persisted with the report. Absent on rows written before it
   *  existed. */
  summary?: {
    dominant_label: BackendLabel | null;
    label_distribution: Record<string, number>;
    average_confidence: number;
    /** Total windows, and how many of them were the subject's. */
    utterances?: number;
    analysed_utterances?: number;
  };
  duration_secs: number;
  /** "Speaker 1" when a subject sample was enrolled, else null. */
  subject_speaker: string | null;
  subject_name: string | null;
  speaker_count: number;
  report_id: string | null;
}

export interface HealthResponse {
  status: string;
  model_loaded: boolean;
  mock_mode: boolean;
  auth_disabled: boolean;
  persistence_enabled: boolean;
  labels: string[];
  audio_model: string;
  text_model: string;
}

/** One stored row from GET /api/reports. `data` is the jsonb blob we wrote. */
export interface ReportRow {
  id: string;
  user_id: string;
  created_at: string;
  data: {
    type?: "live" | "upload";
    transcript?: string;
    emotion?: EmotionResult;
    segments?: AnalysisSegment[];
    duration_secs?: number;
    filename?: string;
    readings?: LiveReading[];
    num_chunks?: number;
    /** Subject attribution, present on rows written by the subject-aware
     *  backend. Absent on older rows, which were single-speaker. */
    subject_speaker?: string | null;
    subject_name?: string | null;
    speaker_count?: number;
    /** Full per-window conversation, stored for upload reports. */
    utterances?: Utterance[];
    summary?: {
      dominant_label: BackendLabel | null;
      label_distribution: Record<string, number>;
      average_confidence: number;
      utterances?: number;
      analysed_utterances?: number;
    };
  };
}

// ── Live WebSocket messages ────────────────────────────────────────────────

export interface LiveReading {
  transcript: string;
  /** Null for anyone other than the subject — their turn is transcribed but
   *  deliberately not run through the emotion model. */
  emotion: EmotionResult | null;
  timestamp: number;
  speaker?: string;
  speakerConfidence?: number;
  isSubject?: boolean;
}

export type LiveServerMessage =
  | { type: "ready"; chunkBytes: number; previewBytes: number; previewMinBytes: number; sampleRate: number; mock: boolean; expectedSpeakers: number; requiresEnrollment: boolean; subjectSpeaker: string | null }
  | { type: "enrollment_started"; speakerIndex: number }
  | { type: "enrollment_complete"; speakerIndex: number }
  | { type: "enrollment_error"; message: string }
  | { type: "analysis_started" }
  /**
   * The server finished analysing a committed utterance. Sent after every
   * `flush`, including ones that held no speech, so the client never waits on
   * a reading that will not arrive.
   */
  | { type: "flush_done" }
  /** Acknowledges a `set_subject` message, echoing the resolved subject. */
  | { type: "subject_updated"; subjectSpeaker: string | null }
  | {
      type: "reading";
      transcript: string;
      emotion: EmotionResult | null;
      timestamp: number;
      chunkIndex: number;
      speaker: string;
      speakerConfidence: number;
      isSubject: boolean;
    }
  | {
      type: "preview";
      previewIndex: number;
      transcript: string;
      emotion: EmotionResult | null;
      timestamp: number;
      speaker: string;
      speakerConfidence: number;
      isSubject: boolean;
    }
  | {
      type: "preview_transcript";
      previewIndex: number;
      transcript: string;
      timestamp: number;
    }
  | { type: "preview_done"; previewIndex: number }
  | { type: "preview_error"; previewIndex: number; message: string }
  | { type: "summary"; reportId: string | null; numReadings: number }
  | { type: "error"; message: string };
