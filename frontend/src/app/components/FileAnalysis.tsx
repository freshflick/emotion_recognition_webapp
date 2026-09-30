import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { Upload, FileAudio, Loader2, CheckCircle2, Mic, Square } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import {
  addSession, calculateSessionSummary, getSessions,
  type EmotionData, type Emotion, type Session, type TranscriptEntry,
} from "../utils/emotionEngine";
import {
  labelToEmotion, segmentsToEmotionData, utterancesToTranscript,
} from "../api/adapters";
import { analyzeFile as analyzeFileApi } from "../api/client";
import { useSessions } from "../contexts/SessionsContext";
import { toast } from "sonner";
import {SessionDetailsDialog} from "./SessionDetailsDialog.tsx";

export const EMOTION_COLORS: { [key in Emotion]: string } = {
  happy: "#c07c20", sad: "#1e5f8a", angry: "#b8312f",
  neutral: "#786c5c"
};
export const serif = "'Playfair Display', Georgia, serif";
export const sans = "'IBM Plex Sans', system-ui, sans-serif";
export const mono = "'IBM Plex Mono', monospace";

function getDominant(scores: { [key in Emotion]: number }) {
  const entries = Object.entries(scores) as [Emotion, number][];
  return entries.reduce((a, b) => (a[1] > b[1] ? a : b));
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")} min`;
}

/** Seconds into the file as m:ss, for transcript timestamps. */
export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function timeAgo(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1d ago";
  return `${diffDays}d ago`;
}

/* ── Current Emotion Status Panel ──
   The model produces one fused prediction, not per-modality labels — what
   varies by modality is the trust weighting it learned for this utterance.
   So: the real prediction, then the real audio/text split beside it. */
function CurrentEmotionStatus({ latestEmotion }: { latestEmotion: EmotionData }) {
  const [fusedDominant, fusedConf] = getDominant(latestEmotion.fused);
  const weights = latestEmotion.modalityWeights;

  const columns = [
    {
      label: "Fused Prediction",
      emotion: fusedDominant,
      confidence: fusedConf,
      weight: "Model output",
    },
    ...(weights
      ? [
          {
            label: "Audio Trust",
            emotion: fusedDominant,
            confidence: weights.audio,
            weight: "Weight given to voice",
          },
          {
            label: "Text Trust",
            emotion: fusedDominant,
            confidence: weights.text,
            weight: "Weight given to words",
          },
        ]
      : []),
  ];

  return (
      <div className="border" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
        {/* Header row */}
        <div
            className="flex items-center justify-between px-5 py-3 border-b"
            style={{ borderColor: "var(--border)" }}
        >
        <span
            className="text-[11px] tracking-[0.22em] uppercase text-foreground font-normal"
            style={{ fontFamily: sans }}
        >
          Current Emotion Status
        </span>
          <span
              className="text-[11px] tracking-[0.1em] px-2.5 py-1 border text-muted-foreground font-normal"
              style={{ borderColor: "var(--border)", fontFamily: mono }}
          >
          {latestEmotion.isMock ? "Placeholder result — no checkpoint" : "Gated Fusion (Audio + Text)"}
        </span>
        </div>

        {/* Prediction, then the learned modality trust split */}
        <div
            className="grid divide-x"
            style={{ borderColor: "var(--border)", gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          {columns.map(({ label, emotion, confidence, weight }, i) => (
              <div key={label} className="p-5">
                <p
                    className="text-[11px] tracking-[0.14em] uppercase text-muted-foreground font-normal mb-3"
                    style={{ fontFamily: sans }}
                >
                  {label}
                </p>

                {/* Column 0 is the predicted emotion; the trust columns show
                    the weight itself, not a repeat of the same label. */}
                <div
                    className="flex items-center justify-center py-5 mb-3"
                    style={{
                      border: "1.5px dashed var(--border)",
                      backgroundColor: "var(--background)",
                    }}
                >
                  {i === 0 ? (
                      <span
                          className="text-2xl font-bold uppercase tracking-widest"
                          style={{ fontFamily: serif, color: EMOTION_COLORS[emotion] }}
                      >
                        {emotion}
                      </span>
                  ) : (
                      <span
                          className="text-2xl font-bold tabular-nums"
                          style={{ fontFamily: serif, color: "var(--foreground)" }}
                      >
                        {(confidence * 100).toFixed(0)}%
                      </span>
                  )}
                </div>

                {/* Confidence / weight bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                <span
                    className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal"
                    style={{ fontFamily: sans }}
                >
                  {weight}
                </span>
                    <span
                        className="text-[11px] tabular-nums text-muted-foreground font-normal"
                        style={{ fontFamily: mono }}
                    >
                  {(confidence * 100).toFixed(0)}%
                </span>
                  </div>
                  <div className="h-1.5 w-full" style={{ backgroundColor: "var(--muted)" }}>
                    <div
                        className="h-full transition-all duration-500"
                        style={{
                          width: `${(confidence * 100).toFixed(0)}%`,
                          backgroundColor: i === 0 ? EMOTION_COLORS[emotion] : "var(--foreground)",
                        }}
                    />
                  </div>
                </div>
              </div>
          ))}
        </div>
      </div>
  );
}

/* ── Recent Uploads Panel ── */
function RecentUploads({ onViewSession }: { onViewSession?: (session: Session) => void }) {
  const sessions = getSessions().filter((s) => s.type === "upload").slice(0, 5);

  if (sessions.length === 0) return null;

  return (
      <div>
        <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-normal mb-3" style={{ fontFamily: sans }}>
          Recent Uploads
        </p>
        <div className="border" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
        {/* List */}
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {sessions.map((session, i) => {
            const dominant = session.summary.dominantEmotion;
            return (
                <div
                    key={session.id}
                    className="flex items-center gap-4 px-5 py-4"
                >
                  {/* File icon */}
                  <div
                      className="flex-shrink-0 flex items-center justify-center border"
                      style={{
                        width: 40, height: 40,
                        borderColor: "var(--border)",
                        backgroundColor: "var(--muted)",
                      }}
                  >
                    <FileAudio style={{ width: 16, height: 16, color: "var(--muted-foreground)" }} />
                  </div>

                  {/* Metadata */}
                  <div className="flex-1 min-w-0">
                    <p
                        className="text-sm font-normal text-foreground truncate"
                        style={{ fontFamily: sans }}
                    >
                      {session.filename ?? `upload_${i + 1}`}
                    </p>
                    <p
                        className="text-xs text-muted-foreground mt-0.5 font-normal"
                        style={{ fontFamily: sans }}
                    >
                      {formatDuration(session.duration)}&nbsp;·&nbsp;
                      Uploaded {timeAgo(session.timestamp)}&nbsp;·&nbsp;
                      <span style={{ color: EMOTION_COLORS[dominant] }} className="capitalize">
                    {dominant}
                  </span>
                    </p>
                  </div>

                  {/* View button */}
                  <button
                      className="flex-shrink-0 px-3 py-1.5 border text-[11px] tracking-[0.14em] uppercase font-normal transition-colors hover:bg-muted"
                      style={{
                        borderColor: "var(--border)",
                        fontFamily: sans,
                        color: "var(--foreground)",
                      }}
                      onClick={() => onViewSession?.(session)}
                  >
                    View
                  </button>
                </div>
            );
          })}
          </div>
        </div>
      </div>
  );
}

/* ── Main FileAnalysis page ── */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // matches the backend's limit
const SUBJECT_SAMPLE_SECONDS = 5;

/**
 * Records a short sample of the one person the user wants analysed.
 *
 * A single microphone can't pull two voices out of a recording, so instead of
 * trying to separate them the backend matches each window against this one
 * profile: the subject's windows get an emotion, everyone else's get a
 * transcript only. Recording it here rather than uploading a second file
 * means the sample is taken in the same room as the conversation.
 */
function SubjectSampleRecorder({
  sample,
  onSample,
  disabled,
}: {
  sample: Blob | null;
  onSample: (blob: Blob | null) => void;
  disabled: boolean;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(SUBJECT_SAMPLE_SECONDS);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setIsRecording(false);
    setSecondsLeft(SUBJECT_SAMPLE_SECONDS);
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    recorderRef.current = null;
  }, []);

  const start = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access denied — allow it to record a voice sample."
          : "Could not access the microphone.",
      );
      return;
    }

    chunksRef.current = [];
    // webm/opus is what every browser here can record; the backend decodes it
    // with ffmpeg, so the browser's preferred type is fine as-is.
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      if (blob.size === 0) {
        setError("Nothing was recorded — try again.");
        onSample(null);
      } else {
        onSample(blob);
      }
    };

    setIsRecording(true);
    setSecondsLeft(SUBJECT_SAMPLE_SECONDS);
    recorder.start();

    let remaining = SUBJECT_SAMPLE_SECONDS;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) stop();
    }, 1000);
  };

  if (sample) {
    return (
      <div className="border px-3 py-2 flex items-center justify-between" style={{ borderColor: "var(--primary)" }}>
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider" style={{ fontFamily: sans, color: "var(--primary)" }}>
          <CheckCircle2 style={{ width: 13, height: 13 }} />
          Voice sample ready
        </span>
        <button
            type="button"
            onClick={() => onSample(null)}
            className="text-[10px] uppercase tracking-wider underline"
            style={{ fontFamily: sans, color: "var(--muted-foreground)" }}
        >
          Re-record
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled || isRecording}
        onClick={() => void start()}
        className="w-full border px-3 py-2 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        style={{ borderColor: "var(--border)", fontFamily: sans }}
      >
        {isRecording ? (
            <>
              <Square style={{ width: 12, height: 12 }} />
              Recording · {secondsLeft}s
            </>
        ) : (
            <>
              <Mic style={{ width: 13, height: 13 }} />
              Record {SUBJECT_SAMPLE_SECONDS}s voice sample
            </>
        )}
      </button>
      {isRecording && (
          <button
              type="button"
              onClick={stop}
              className="mt-1.5 w-full text-[10px] uppercase tracking-wider text-muted-foreground underline"
              style={{ fontFamily: sans }}
          >
            Done early
          </button>
      )}
      {error && (
          <p className="mt-1.5 text-[10px]" style={{ fontFamily: sans, color: "#b8312f" }}>
            {error}
          </p>
      )}
    </div>
  );
}

export function FileAnalysis() {
  const navigate = useNavigate();
  const { health, isMock, refreshSessions } = useSessions();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [subjectSample, setSubjectSample] = useState<Blob | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [emotionData, setEmotionData] = useState<EmotionData[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [viewedSession, setViewedSession] = useState<Session | null>(null);

  const backendReachable = health !== null;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Some browsers report an empty type for .m4a/.ogg, so fall back to the
    // extension rather than rejecting a valid file.
    const looksLikeAudio =
      file.type.startsWith("audio/") ||
      /\.(mp3|wav|m4a|ogg|flac|webm)$/i.test(file.name);
    if (!looksLikeAudio) {
      toast.error("Please select an audio file");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("File is larger than the 50 MB limit");
      return;
    }

    setSelectedFile(file);
    setAnalysisComplete(false);
    setEmotionData([]);
    toast.success("File selected");
  };

  const analyzeFile = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setProgress(0);
    setEmotionData([]);
    setTranscript([]);

    // The backend returns one response when the whole file is done, so there
    // is no real progress to report. This creeps toward 90% at a rate scaled
    // to file size, then jumps to 100% on completion — honest about being an
    // estimate, and better than a bar that sits at 0.
    const estimatedMs = Math.max(3000, (selectedFile.size / 1_000_000) * 4000);
    const startedAt = Date.now();
    const ticker = setInterval(() => {
      setProgress(Math.min(90, ((Date.now() - startedAt) / estimatedMs) * 90));
    }, 200);

    try {
      const result = await analyzeFileApi(selectedFile, subjectSample, subjectName);
      const data = segmentsToEmotionData(result.segments);
      // Every window, not just the analysed ones — this is what keeps the
      // other participants in the conversation.
      const conversation = result.utterances?.length
        ? utterancesToTranscript(result.utterances, result.segments)
        : [];

      setEmotionData(data);
      setTranscript(conversation);
      setProgress(100);
      setAnalysisComplete(true);

      // Prefer the backend's stored dominant so the just-saved session
      // agrees with the DB immediately, not only after a refresh.
      const summary = calculateSessionSummary(data);
      if (result.summary?.dominant_label) {
        summary.dominantEmotion = labelToEmotion(result.summary.dominant_label);
      }

      addSession({
        id: result.report_id ?? `local-${Date.now()}`,
        timestamp: Date.now(),
        duration: Math.round(result.duration_secs),
        type: "upload",
        filename: selectedFile.name,
        emotionData: data,
        transcript: conversation,
        subjectSpeaker: result.subject_speaker ?? undefined,
        subjectName: result.subject_name ?? undefined,
        speakerCount: result.speaker_count ?? 1,
        summary,
      });

      if (data.length === 0 && subjectSample) {
        // The sample matched nobody, which is worth saying plainly — reporting
        // the most confident window as the subject's would be a lie.
        toast.warning("The subject's voice wasn't found in this file — only the transcript was saved.");
      } else if (result.report_id) {
        toast.success("Analysis complete");
        void refreshSessions();
      } else {
        toast.warning("Analysis complete, but it could not be saved to the server");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      clearInterval(ticker);
      setIsProcessing(false);
    }
  };

  const chartData = emotionData.map((data) => ({
    time: `${data.timestamp}s`,
    happy: Number((data.fused.happy * 100).toFixed(1)),
    sad: Number((data.fused.sad * 100).toFixed(1)),
    angry: Number((data.fused.angry * 100).toFixed(1)),
    neutral: Number((data.fused.neutral * 100).toFixed(1)),
  }));

  const latestEmotion = emotionData[emotionData.length - 1] ?? null;

  const tooltipStyle = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 0,
    boxShadow: "none", color: "var(--card-foreground)", fontSize: 11, fontFamily: sans,
  };
  const axisStyle = { fontSize: 11, fill: "var(--muted-foreground)", fontFamily: sans };

  return (
      <div className="page-shell">
        <div className="page-container">

          {/* Header */}
          <div className="page-header" style={{ borderColor: "var(--border)" }}>
            <h1
                className="font-bold text-foreground leading-tight"
                style={{ fontFamily: serif, fontSize: "clamp(1.75rem, 3vw, 2.5rem)", letterSpacing: "-0.02em" }}
            >
              Audio File{" "}
              <em style={{ fontStyle: "italic", color: "var(--primary)" }}>Analysis</em>
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5" style={{ fontFamily: sans, fontWeight: 300 }}>
              Upload audio recordings for comprehensive multimodal emotion analysis.
            </p>
          </div>

          {!backendReachable && (
              <div className="border-l-2 px-4 py-3 mb-8" style={{ borderColor: "#b8312f", backgroundColor: "var(--card)" }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: "#b8312f", fontFamily: sans }}>
                  Backend unreachable
                </p>
                <p className="text-xs text-muted-foreground" style={{ fontFamily: sans }}>
                  Start it with <span style={{ fontFamily: mono }}>cd backend &amp;&amp; uvicorn main:app --reload --port 8000</span>, then reload this page.
                </p>
              </div>
          )}
          {backendReachable && isMock && (
              <div className="border-l-2 px-4 py-3 mb-8" style={{ borderColor: "#c07c20", backgroundColor: "var(--card)" }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: "#c07c20", fontFamily: sans }}>
                  Mock mode
                </p>
                <p className="text-xs text-muted-foreground" style={{ fontFamily: sans }}>
                  Results below are randomised placeholders — the trained checkpoint isn't loaded. Your file is still uploaded and segmented for real.
                </p>
              </div>
          )}

          {/* Upload zone */}
          <div className="mb-8">
            <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-normal mb-3" style={{ fontFamily: sans }}>
              Upload Audio File
            </p>
            <div
                className="border transition-colors cursor-pointer"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
                onClick={() => fileInputRef.current?.click()}
            >
               <div className="p-6 sm:p-10 text-center border-b border-dashed" style={{ borderColor: "var(--border)" }}>
                <Upload
                    className="mx-auto mb-4"
                    style={{ width: 36, height: 36, color: "var(--muted-foreground)", opacity: 0.4 }}
                />
                <p
                    className="text-base mb-1.5 font-bold"
                    style={{ fontFamily: serif, color: "var(--foreground)" }}
                >
                  {selectedFile ? selectedFile.name : "Click to upload audio"}
                </p>
                <p className="text-xs text-muted-foreground tracking-wide uppercase font-normal" style={{ fontFamily: sans }}>
                  MP3 · WAV · M4A · OGG — Max 50 MB
                </p>
                <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelect} className="hidden" />
              </div>

              {selectedFile && (
                  <div className="flex items-center gap-4 p-4 border-t" style={{ borderColor: "var(--border)" }}>
                    <FileAudio style={{ width: 28, height: 28, color: "var(--primary)" }} />
                    <div className="flex-1">
                      <div className="text-sm font-normal text-foreground" style={{ fontFamily: sans }}>{selectedFile.name}</div>
                      <div className="text-xs text-muted-foreground tabular-nums font-normal" style={{ fontFamily: mono }}>
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                    {analysisComplete && <CheckCircle2 style={{ width: 18, height: 18, color: "#2e7d52" }} />}
                  </div>
              )}
            </div>

            {selectedFile && !analysisComplete && (
                <div className="mt-4 space-y-3">
                  {/*
                    Optional, and deliberately so: without a sample the file is
                    analysed as a single speaker, which is still the right answer
                    for a solo recording.
                  */}
                  <div className="border p-4 space-y-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                    <div>
                      <p className="text-[11px] tracking-[0.14em] uppercase text-muted-foreground" style={{ fontFamily: sans }}>
                        Whose emotions?
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1 leading-snug" style={{ fontFamily: sans }}>
                        A microphone can't pull two voices apart, so record a short sample of
                        the person you care about. Their turns get analysed; everyone else's
                        are transcribed only. Skip this for a single-speaker recording.
                      </p>
                    </div>
                    <SubjectSampleRecorder
                        sample={subjectSample}
                        onSample={setSubjectSample}
                        disabled={isProcessing}
                    />
                    {subjectSample && (
                        <input
                            type="text"
                            value={subjectName}
                            maxLength={60}
                            onChange={(e) => setSubjectName(e.target.value)}
                            placeholder="Name (optional)"
                            className="w-full border px-3 py-2 text-xs bg-transparent"
                            style={{
                              borderColor: "var(--border)",
                              color: "var(--foreground)",
                              fontFamily: sans,
                              outline: "none",
                            }}
                        />
                    )}
                  </div>

                  <Button
                      className="w-full text-[11px] tracking-[0.15em] uppercase py-3 font-normal"
                      onClick={analyzeFile}
                      disabled={isProcessing || !backendReachable}
                      style={{
                        fontFamily: sans, borderRadius: 0, height: "auto",
                        backgroundColor: "var(--foreground)", color: "var(--background)",
                      }}
                  >
                    {isProcessing ? (
                        <><Loader2 style={{ width: 13, height: 13, marginRight: 8 }} className="animate-spin" />Processing... {progress.toFixed(0)}%</>
                    ) : (
                        <><Upload style={{ width: 13, height: 13, marginRight: 8 }} />Analyze Audio</>
                    )}
                  </Button>
                  {isProcessing && (
                      <div className="space-y-1.5">
                        <Progress value={progress} className="h-0.5 rounded-none" />
                        <p className="text-[11px] tracking-widest uppercase text-muted-foreground text-center font-normal" style={{ fontFamily: sans }}>
                           Extracting emotion features…
                        </p>
                      </div>
                  )}
                </div>
            )}

          {/* Full conversation — every speaker, not just the analysed one */}
          {analysisComplete && transcript.length > 0 && (
              <div className="mb-8">
                <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-normal mb-3" style={{ fontFamily: sans }}>
                  Transcript
                </p>
                <div className="border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                  <div className="max-h-72 overflow-y-auto space-y-3" style={{ backgroundColor: "var(--background)" }}>
                    {transcript.map((entry, i) => (
                        <div
                            key={i}
                            className="flex items-start gap-3"
                            style={{ opacity: entry.isSubject ? 1 : 0.62 }}
                        >
                          <span
                              className="text-xs text-muted-foreground/60 tabular-nums pt-0.5 w-12 flex-shrink-0"
                              style={{ fontFamily: mono }}
                          >
                            {formatTime(entry.offsetSecs ?? entry.timestamp)}
                          </span>
                          <span
                              className="text-[10px] px-1.5 py-0.5 flex-shrink-0 tracking-wider uppercase font-semibold"
                              style={{
                                backgroundColor: "var(--muted)",
                                color: entry.isSubject ? "var(--primary)" : "var(--muted-foreground)",
                                fontFamily: sans,
                              }}
                          >
                            {entry.isSubject ? subjectName.trim() || "Subject" : "Other"}
                          </span>
                          {entry.emotion && (
                              <span
                                  className="text-[10px] px-1.5 py-0.5 flex-shrink-0 tracking-wider uppercase font-semibold"
                                  style={{
                                    backgroundColor: "var(--muted)",
                                    color: EMOTION_COLORS[entry.emotion.dominantEmotion],
                                    fontFamily: sans,
                                  }}
                              >
                                {entry.emotion.dominantEmotion}
                              </span>
                          )}
                          <span
                              className="text-sm text-foreground leading-relaxed"
                              style={{ fontFamily: sans, fontWeight: 400, wordBreak: "break-word" }}
                          >
                            {entry.transcript}
                          </span>
                        </div>
                    ))}
                  </div>
                </div>
              </div>
          )}
          </div>

          {/* ── Current Emotion Status ── */}
          {latestEmotion && (
              <div className="mb-8">
                <CurrentEmotionStatus latestEmotion={latestEmotion} />
              </div>
          )}

          {/* Results */}
          {analysisComplete && emotionData.length > 0 && (
              <>
                {/* Summary */}
                <div className="mb-8">
                  <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-normal mb-3" style={{ fontFamily: sans }}>
                    Analysis Summary
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    {Object.entries(
                        emotionData.reduce((acc, data) => {
                          acc[data.dominantEmotion] = (acc[data.dominantEmotion] || 0) + 1;
                          return acc;
                        }, {} as Record<Emotion, number>)
                    )
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([emotion, count]) => (
                            <div key={emotion} className="border-l-2 pl-4 py-1" style={{ borderColor: EMOTION_COLORS[emotion as Emotion] }}>
                              <p className="text-[11px] tracking-widest uppercase text-muted-foreground mb-1 font-normal" style={{ fontFamily: sans }}>
                                {emotion}
                              </p>
                              <div className="text-2xl font-bold" style={{ fontFamily: serif, color: EMOTION_COLORS[emotion as Emotion] }}>
                                {count}×
                              </div>
                              <p className="text-[11px] text-muted-foreground font-normal" style={{ fontFamily: sans }}>occurrences</p>
                            </div>
                        ))}
                  </div>
                </div>

                {/* Timeline chart */}
                <div className="mb-8">
                  <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-normal mb-3" style={{ fontFamily: sans }}>
                    Emotion Timeline
                  </p>
                  <div className="border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" />
                        <XAxis dataKey="time" tick={axisStyle} />
                        <YAxis tick={axisStyle} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 11, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em" }} />
                        {(Object.keys(EMOTION_COLORS) as Emotion[]).map((e) => (
                            <Line key={e} type="monotone" dataKey={e} stroke={EMOTION_COLORS[e]} strokeWidth={1.5} dot={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Transcript */}
                <div className="mb-8">
                  <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-normal mb-3" style={{ fontFamily: sans }}>
                    Generated Transcript
                  </p>
                  <div className="border p-4 space-y-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                    {emotionData.map((data, index) => (
                        <div key={index} className="flex items-start gap-3 text-sm border-b py-2" style={{ borderColor: "var(--border)" }}>
                    <span className="text-[11px] text-muted-foreground/50 tabular-nums w-8 flex-shrink-0 pt-0.5 font-normal" style={{ fontFamily: mono }}>
                      [{data.timestamp}s]
                    </span>
                          <span
                              className="text-[11px] px-1.5 py-0.5 flex-shrink-0 tracking-widest uppercase font-normal"
                              style={{ backgroundColor: "var(--muted)", color: EMOTION_COLORS[data.dominantEmotion], fontFamily: sans }}
                          >
                      {data.dominantEmotion}
                    </span>
                          <span className="text-sm text-foreground font-normal" style={{ fontFamily: sans }}>
                      {data.transcript}
                    </span>
                        </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mb-8">
                  <Button
                      variant="outline"
                      onClick={() => { setSelectedFile(null); setAnalysisComplete(false); setEmotionData([]); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", borderRadius: 0, borderColor: "var(--border)" }}
                      className="font-normal"
                  >
                    Analyze Another File
                  </Button>
                  <Button
                      onClick={() => navigate("/")}
                      style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", borderRadius: 0, backgroundColor: "var(--foreground)", color: "var(--background)" }}
                      className="font-normal"
                  >
                    Dashboard
                  </Button>
                  <Button
                      variant="outline"
                      onClick={() => navigate("/reports")}
                      style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", borderRadius: 0, borderColor: "var(--border)" }}
                      className="font-normal"
                  >
                    Generate Report
                  </Button>
                </div>
              </>
          )}

          {/* ── Recent Uploads ── */}
          <RecentUploads onViewSession={setViewedSession} />
        </div>

        {/* ── Session Details Dialog ── */}
        <SessionDetailsDialog session={viewedSession} onClose={() => setViewedSession(null)} />
      </div>
  );
}
