import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Mic, Square, Play, Pause, Waves, Mic as MicIcon} from "lucide-react";
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
import {
  addSession, calculateSessionSummary, useSessionStore, type EmotionData, type Emotion, type Session,
} from "../utils/emotionEngine";
import { LiveSession } from "../api/liveSession";
import { labelToEmotion, toEmotionData } from "../api/adapters";
import { useSessions } from "../contexts/SessionsContext";
import { toast } from "sonner";
import {SessionDetailsDialog} from "./SessionDetailsDialog.tsx";
import { LoadingPanel } from "./LoadingPanel";
import { SessionLoadingIndicator } from "./SessionLoadingIndicator";
import { SessionPagination } from "./SessionPagination";

const EMOTION_COLORS: { [key in Emotion]: string } = {
  happy: "#c07c20", sad: "#1e5f8a", angry: "#b8312f",
  neutral: "#786c5c"
};

const serif = "'Playfair Display', Georgia, serif";
const sans = "'IBM Plex Sans', system-ui, sans-serif";
const mono = "'IBM Plex Mono', monospace";
const SPEAKER_COLORS = ["#6040c8", "#2e7d52", "#c07c20", "#b8312f"];

/**
 * Tells everyone in the room whose turn it is.
 *
 * This exists because a single mic gives no natural feedback about when to
 * speak: without it, people interrupt because they can't tell that a pause
 * was just interpreted as "your turn is over". Three states, chosen to match
 * what the endpointing code on the other end is actually doing:
 *
 *   - someone is mid-utterance: hold, they're still going
 *   - the room has just gone quiet and the server is working: that turn is
 *     sealed, and speaking now will not be cut in half
 *   - everything is settled: it's open, go ahead
 *
 * It is deliberately a hint and not a gate — audio is still captured from
 * whoever talks, and nothing is dropped.
 */
function TurnIndicator({
  speaking,
  finalising,
  speakerName,
  subjectName,
  open,
}: {
  speaking: boolean;
  finalising: boolean;
  speakerName: string | null;
  subjectName: string | null;
  open: boolean;
}) {
  let tone: string;
  let label: string;
  let detail: string;
  let pulse = false;

  if (speaking) {
    tone = "var(--primary)";
    pulse = true;
    const who = speakerName ?? subjectName ?? "Someone";
    label = `${who} is speaking`;
    detail = "Wait for their pause — then it's your turn";
  } else if (finalising) {
    tone = "var(--primary)";
    pulse = true;
    label = "Finishing that turn";
    detail = "Pausing ends a turn, so the last sentence isn't cut off";
  } else {
    tone = "var(--muted-foreground)";
    label = open ? "Your turn" : "Listening";
    detail = open
      ? "Speak naturally — a short pause sends your turn"
      : "Waiting for someone to speak";
  }

  return (
      <div
          className="w-full flex flex-col items-center gap-1 py-3 px-4 text-center border"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--card)", borderRadius: 0 }}
          role="status"
          aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <span
              className={`size-2 rounded-full inline-block ${pulse ? "animate-pulse" : ""}`}
              style={{ backgroundColor: tone }}
          />
          <span
              className="text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ fontFamily: sans, color: tone }}
          >
            {label}
          </span>
        </div>
        <span className="text-[11px]" style={{ fontFamily: sans, color: "var(--muted-foreground)" }}>
          {detail}
        </span>
      </div>
  );
}

/**
 * Scrolling display of real microphone level. `level` is the peak amplitude
 * (0..1) of the most recent audio frame, pushed up from LiveSession — these
 * bars now reflect actual input rather than an animation, so a dead mic is
 * visible immediately instead of looking like it's working.
 */
function WaveformBars({ active, level }: { active: boolean; level: number }) {
  const BARS = 32;
  const [history, setHistory] = useState<number[]>(() => new Array(BARS).fill(0));

  useEffect(() => {
    if (!active) {
      setHistory(new Array(BARS).fill(0));
      return;
    }
    // Sampled on an interval rather than on every frame: audio callbacks fire
    // far faster than the display needs, and re-rendering on each would churn.
    const id = setInterval(() => {
      setHistory((prev) => [...prev.slice(1), levelRef.current]);
    }, 60);
    return () => clearInterval(id);
  }, [active]);

  const levelRef = useRef(level);
  levelRef.current = level;

  return (
      <div className="flex items-center justify-center gap-[2px] h-8">
        {history.map((v, i) => (
            <div
                key={i}
                style={{
                  width: 2,
                  backgroundColor: active ? "var(--primary)" : "var(--muted-foreground)",
                  opacity: active ? 0.35 + Math.min(v * 2, 1) * 0.65 : 0.2,
                  // sqrt curve: quiet speech is otherwise almost invisible
                  height: active ? `${Math.max(8, Math.sqrt(Math.min(v, 1)) * 100)}%` : "15%",
                  transition: "height 0.08s linear, opacity 0.08s linear",
                }}
            />
        ))}
      </div>
  );
}

function LatencyMonitor({
  values,
}: {
  values: Partial<Record<"microphone" | "connection" | "preview-transcript" | "preview-emotion" | "final", number>>;
}) {
  const rows = [
    ["Mic", values.microphone],
    ["Connect", values.connection],
    ["Preview text", values["preview-transcript"]],
    ["Preview emotion", values["preview-emotion"]],
    ["Final turn", values.final],
  ] as const;
  return (
    <details className="border" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
      <summary className="cursor-pointer list-none px-4 py-3 text-xs text-muted-foreground" style={{ fontFamily: sans }}>
        <span className="uppercase tracking-[0.16em]">Timing</span>
        <span className="ml-3" style={{ fontFamily: mono }}>
          {values.final == null ? "Waiting for a turn" : `Last turn ${Math.round(values.final)} ms`}
        </span>
      </summary>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t px-4 py-3 sm:grid-cols-5" style={{ borderColor: "var(--border)" }}>
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 sm:block">
            <div className="text-[10px] text-muted-foreground truncate" style={{ fontFamily: sans }}>{label}</div>
            <div className="text-xs font-semibold" style={{ fontFamily: mono }}>
              {value == null ? "--" : `${Math.round(value)} ms`}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function getDominantWithScore(scores: { [key in Emotion]: number }) {
  const entries = Object.entries(scores) as [Emotion, number][];
  const dominant = entries.reduce((a, b) => (a[1] > b[1] ? a : b));
  return { emotion: dominant[0], confidence: dominant[1] };
}

/* ── Recent Live Sessions Panel ── */
function RecentLiveSessions({ onViewSession }: { onViewSession?: (session: Session) => void }) {
  const allSessions = useSessionStore().filter((s) => s.type === "live");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(allSessions.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const sessions = allSessions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (sessions.length === 0) return null;

  return (
      <div>
        <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-normal mb-3" style={{ fontFamily: sans }}>
          Recent Live Sessions
        </p>
        <div className="border" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {sessions.map((session) => {
            const dominant = session.summary.dominantEmotion;
            return (
                <div key={session.id} className="flex items-center gap-4 px-5 py-4">
                  <div
                      className="flex-shrink-0 flex items-center justify-center border"
                      style={{ width: 40, height: 40, borderColor: "var(--border)", backgroundColor: "var(--muted)" }}
                  >
                    <MicIcon style={{ width: 16, height: 16, color: "var(--muted-foreground)" }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-normal text-foreground truncate" style={{ fontFamily: sans }}>
                      Live session · {new Date(session.timestamp).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-normal" style={{ fontFamily: sans }}>
                      {Math.floor(session.duration / 60)}:{(session.duration % 60).toString().padStart(2, "0")} min
                      &nbsp;·&nbsp;
                      <span style={{ color: EMOTION_COLORS[dominant] }} className="capitalize">{dominant}</span>
                    </p>
                  </div>

                  <button
                      className="flex-shrink-0 px-3 py-1.5 border text-[11px] tracking-[0.14em] uppercase font-normal transition-colors hover:bg-muted"
                      style={{ borderColor: "var(--border)", fontFamily: sans, color: "var(--foreground)" }}
                      onClick={() => onViewSession?.(session)}
                  >
                    View
                  </button>
                </div>
            );
          })}
          </div>
        </div>
        <SessionPagination
          page={currentPage}
          pageSize={pageSize}
          totalItems={allSessions.length}
          onPageChange={setPage}
        />
      </div>
  );
}

export function LiveRecording() {
  const navigate = useNavigate();
  const { health, isMock, isCheckingHealth, refreshSessions } = useSessions();
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [latency, setLatency] = useState<Partial<Record<"microphone" | "connection" | "preview-transcript" | "preview-emotion" | "final", number>>>({});
  // Endpointing state, pushed up from LiveSession's silence detector. Drives
  // the turn prompt so people know when to start and when they've finished.
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  // Who the most recent completed turn belonged to. This is the honest answer
  // to "whose turn is it": the server's diarizer knows, and it is the same
  // attribution used for the subject's emotion, so it cannot disagree with it.
  const [lastSpeaker, setLastSpeaker] = useState<string | null>(null);
  const [expectedSpeakers, setExpectedSpeakers] = useState(1);
  const [enrolledSpeakers, setEnrolledSpeakers] = useState<number[]>([]);
  const [enrollingSpeaker, setEnrollingSpeaker] = useState<number | null>(null);
  const [enrollmentSeconds, setEnrollmentSeconds] = useState(0);
  // Which enrolled speaker's emotions to report. Null means "nobody picked
  // yet", which the backend treats as analyse-everyone — a sensible fallback
  // for a single-speaker session and for people who don't pick a subject.
  const [subjectIndex, setSubjectIndex] = useState<number | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [duration, setDuration] = useState(0);
  const [level, setLevel] = useState(0);
  const [emotionData, setEmotionData] = useState<EmotionData[]>([]);
  const [currentEmotion, setCurrentEmotion] = useState<EmotionData | null>(null);
  const windowEmotionDataRef = useRef<EmotionData[]>([]);
  const WINDOW_SECS = 5;
  const [transcript, setTranscript] = useState<{
    time: number;
    text: string;
    /** Null for anyone but the subject — they are transcribed, not analysed. */
    emotion: Emotion | null;
    /** The full reading, kept so the saved session can carry real EmotionData
     *  rather than a label that would have to be converted back. */
    data?: EmotionData;
    speaker?: string;
    speakerConfidence?: number;
    isSubject: boolean;
  }[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const [viewedSession, setViewedSession] = useState<Session | null>(null);

  const sessionRef = useRef<LiveSession | null>(null);
  const stopRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const lastPreviewErrorRef = useRef<{ message: string; at: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const pauseStartRef = useRef<number>(0);

  // Elapsed-time display only. Predictions arrive from the server whenever a
  // chunk completes — they are not on this clock.
  useEffect(() => {
    if (isRecording && !isPaused) {
      intervalRef.current = setInterval(() => {
        setDuration(
          Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000),
        );
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRecording, isPaused]);

  // Releases the mic and socket if the user navigates away mid-session.
  useEffect(() => () => sessionRef.current?.teardown(), []);

  // The subject picker only becomes available once everyone has enrolled —
  // which is *after* the socket was opened to do that enrollment. So the
  // subject in the auth handshake is always stale, and the choice has to be
  // pushed to the open socket instead. Fires on mount too, where setSubject
  // is a no-op because no session exists yet.
  useEffect(() => {
    sessionRef.current?.setSubject(subjectIndex, subjectName);
  }, [subjectIndex, subjectName]);

  // Auto-follow new transcript lines while recording. Skipped when the
  // transcript is empty so navigating to the page doesn't yank the scroll
  // position down on mount.
  useEffect(() => {
    if (transcript.length === 0 && !partialTranscript) return;
    const container = transcriptScrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [transcript, partialTranscript]);

  const buildSession = () => new LiveSession({
      onLatency: ({ kind, ms }) => setLatency((previous) => ({ ...previous, [kind]: ms })),
      onLevel: setLevel,
      onProcessing: (processing) => {
        setIsProcessing(processing);
        // A final turn supersedes any provisional rolling estimate. Keep the
        // preview badge visible between preview acknowledgements so it does
        // not flicker every 1.5 seconds.
        setIsPreviewing(false);
      },
      onPreview: ({ emotion, timestamp, speaker, speakerConfidence, isSubject }) => {
        setIsPreviewing(true);
        if (!emotion || !isSubject) return;
        const elapsed = Math.max(
            0,
            Math.round((timestamp * 1000 - startTimeRef.current) / 1000),
        );
        // Preview estimates update the live card only. They intentionally do
        // not enter emotionData, transcript, charts, or saved sessions.
        setCurrentEmotion(
            toEmotionData(elapsed, "", emotion, speaker, speakerConfidence),
        );
      },
      onPartialTranscript: ({ transcript: text }) => {
        if (text.trim()) setPartialTranscript(text);
      },
      onTurn: ({ speaking }) => setIsSpeaking(speaking),
      onReading: ({ transcript: text, emotion, timestamp, speaker, speakerConfidence, isSubject }) => {
        setIsPreviewing(false);
        setPartialTranscript("");
        const elapsed = Math.max(
            0,
            Math.round((timestamp * 1000 - startTimeRef.current) / 1000),
        );
        // Backends that predate subject selection omit the flag, and those
        // sessions were single-speaker — so absent means "the subject".
        const subject = isSubject ?? true;

        // Only the subject reaches the emotion model, so a null emotion is
        // expected for everyone else rather than an error to swallow.
        let reading: EmotionData | undefined;
        if (emotion) {
          const analysed = toEmotionData(elapsed, text, emotion, speaker, speakerConfidence);
          reading = analysed;
          setEmotionData((prev) => [...prev, analysed]);

          // Rolling window average, kept in a ref rather than state — this is
          // an internal computation input, not something the UI renders
          // directly, so it doesn't need to trigger its own re-render.
          const windowStart = elapsed - WINDOW_SECS;
          const updated = [...windowEmotionDataRef.current, analysed].filter(
              (r) => r.timestamp >= windowStart,
          );
          windowEmotionDataRef.current = updated;

          if (updated.length > 0) {
            const avgFused = {happy: 0, sad: 0, angry: 0, neutral: 0};
            for (const r of updated) {
              for (const k of Object.keys(avgFused) as (keyof typeof avgFused)[]) {
                avgFused[k] += r.fused[k];
              }
            }
            for (const k of Object.keys(avgFused) as (keyof typeof avgFused)[]) {
              avgFused[k] /= updated.length;
            }
            const entries = Object.entries(avgFused) as [Emotion, number][];
            const dominant = entries.reduce((a, b) => (a[1] > b[1] ? a : b));

            setCurrentEmotion({
              timestamp: elapsed,
              fused: avgFused,
              audio: avgFused,
              text: avgFused,
              dominantEmotion: dominant[0],
              confidence: dominant[1],
              isMock: analysed.isMock,
              modalityWeights: analysed.modalityWeights,
              audioEmotion: analysed.audioEmotion,
              textEmotion: analysed.textEmotion,
              speaker: analysed.speaker,
              speakerConfidence: analysed.speakerConfidence,
            });
          }
        }

        // Whisper returns "" for silence — no point adding an empty line.
        // Everyone is added regardless of subject so the transcript is the
        // whole conversation.
        if (text.trim()) {
          setTranscript((prev) => [
            ...prev,
            {
              time: elapsed,
              text,
              emotion: emotion ? labelToEmotion(emotion.top_label) : null,
              data: reading,
              speaker,
              speakerConfidence,
              isSubject: subject,
            },
          ]);
        }

        // The turn has settled, so name whose it was — that's what the other
        // person is waiting on. Falls back to the raw label for speakers
        // without a chosen name.
        if (speaker) {
          const label = speaker.replace(/^Speaker (\d+)$/, (_, n) => {
            const idx = Number(n) - 1;
            return subjectIndex === idx && subjectName.trim()
              ? subjectName.trim()
              : `Speaker ${n}`;
          });
          setLastSpeaker(label);
        }
      },
      onError: (message) => {
        const now = Date.now();
        const previous = lastPreviewErrorRef.current;
        if (previous && previous.message === message && now - previous.at < 2000) return;
        lastPreviewErrorRef.current = { message, at: now };
        toast.error(message);
      },
      onDisconnected: (reason) => {
        toast.error(`${reason} Saving the results available in this browser.`);
        void stopRecordingRef.current?.();
      },
    }, expectedSpeakers);

  const connectSession = async () => {
    const existing = sessionRef.current;
    if (existing) return existing;
    const session = buildSession();
    // Must be set before start(), because the auth handshake is the socket's
    // first message and carries the subject with it.
    session.setSubject(subjectIndex, subjectName);
    await session.start();
    sessionRef.current = session;
    return session;
  };

  const handleConnectionError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof DOMException) {
      toast.error(
          err.name === "NotAllowedError"
              ? "Microphone access denied. Allow it in your browser settings and try again."
              : "Could not access the microphone.",
      );
    } else {
      toast.error(message);
    }
  };

  const enrollSpeaker = async (speakerIndex: number) => {
    setIsConnecting(true);
    try {
      const session = await connectSession();
      setIsConnecting(false);
      setEnrollingSpeaker(speakerIndex);
      setEnrollmentSeconds(5);
      session.beginEnrollment(speakerIndex);

      for (let remaining = 4; remaining >= 0; remaining--) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (sessionRef.current !== session) return;
        setEnrollmentSeconds(remaining);
      }

      await session.finishEnrollment();
      setEnrolledSpeakers((current) =>
          current.includes(speakerIndex) ? current : [...current, speakerIndex],
      );
      toast.success(`Speaker ${speakerIndex + 1} enrolled`);
    } catch (err) {
      handleConnectionError(err);
    } finally {
      setIsConnecting(false);
      setEnrollingSpeaker(null);
      setEnrollmentSeconds(0);
    }
  };

  const changeExpectedSpeakers = (count: number) => {
    sessionRef.current?.teardown();
    sessionRef.current = null;
    setExpectedSpeakers(count);
    setEnrolledSpeakers([]);
    setEnrollingSpeaker(null);
    setEnrollmentSeconds(0);
    // The old subject index may not exist in the new speaker set.
    setSubjectIndex(null);
  };

  const startRecording = async () => {
    if (expectedSpeakers > 1 && enrolledSpeakers.length !== expectedSpeakers) {
      toast.error("Enroll every expected speaker before starting analysis");
      return;
    }

    setIsConnecting(true);
    setEmotionData([]);
    windowEmotionDataRef.current = [];
    setTranscript([]);
    setCurrentEmotion(null);
    setDuration(0);

    let session: LiveSession | null = null;

    try {
      session = await connectSession();
      await session.beginAnalysis();
    } catch (err) {
      session?.teardown();
      sessionRef.current = null;
      setIsConnecting(false);
      handleConnectionError(err);
      return;
    }

    startTimeRef.current = Date.now();
    pausedTimeRef.current = 0;
    setIsConnecting(false);
    setIsRecording(true);
    setIsPaused(false);
    toast.success(
        isMock ? "Analysis started (mock mode — placeholder results)" : "Analysis started",
    );
  };

  const pauseRecording = () => {
    pauseStartRef.current = Date.now();
    sessionRef.current?.setMuted(true);
    setIsPaused(true);
    setLevel(0);
    toast.info("Analysis paused");
  };

  const resumeRecording = () => {
    pausedTimeRef.current += Date.now() - pauseStartRef.current;
    sessionRef.current?.setMuted(false);
    setIsPaused(false);
    toast.info("Analysis resumed");
  };

  const stopRecording = async () => {
    const session = sessionRef.current;
    setIsSaving(true);
    setLevel(0);

    // The server still has to process the final partial chunk, so this can
    // take a few seconds — hence the saving state on the button.
    const reportId = (await session?.stop()) ?? null;
    sessionRef.current = null;
    if (expectedSpeakers > 1) setEnrolledSpeakers([]);

    setIsRecording(false);
    setIsPaused(false);
    setIsSaving(false);
    setIsProcessing(false);

    if (emotionData.length === 0) {
      // An empty session is discarded completely and returns to a fresh state.
      setDuration(0);
      setEmotionData([]);
      windowEmotionDataRef.current = [];
      setTranscript([]);
      setCurrentEmotion(null);
      startTimeRef.current = 0;
      pausedTimeRef.current = 0;
      pauseStartRef.current = 0;
      toast.error("No speech was analysed — nothing to save");
      return;
    }

    // Mirror the saved session locally so the dashboard updates instantly.
    // Using the backend's report id keeps this row from duplicating when the
    // store is later rehydrated from /api/reports.
    const subjectSpeaker =
        subjectIndex !== null ? `Speaker ${subjectIndex + 1}` : undefined;
    const savedEmotionData = emotionData;
    addSession({
      id: reportId ?? `local-${Date.now()}`,
      timestamp: Date.now(),
      duration,
      type: "live",
      emotionData: savedEmotionData,
      transcript: transcript.map((entry) => ({
        timestamp: entry.time,
        transcript: entry.text,
        speaker: entry.speaker ?? "Speaker 1",
        speakerConfidence: entry.speakerConfidence,
        isSubject: entry.isSubject,
        emotion: entry.data,
      })),
      subjectSpeaker,
      subjectName: subjectName.trim() || undefined,
      speakerCount: expectedSpeakers,
      summary: calculateSessionSummary(savedEmotionData),
    });

    if (reportId) {
      toast.success("Analysis saved");
      void refreshSessions();
    } else {
      toast.warning("Analysis complete, but it could not be saved to the server");
    }
    setTimeout(() => navigate("/analytics"), 1500);
  };
  stopRecordingRef.current = stopRecording;

  const chartData = emotionData.slice(-20).map((data) => ({
    time: `${data.timestamp}s`,
    happy: (data.fused.happy * 100).toFixed(1),
    sad: (data.fused.sad * 100).toFixed(1),
    angry: (data.fused.angry * 100).toFixed(1),
    neutral: (data.fused.neutral * 100).toFixed(1),
  }));

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isActive = isRecording && !isPaused;
  const fusedResult = currentEmotion ? getDominantWithScore(currentEmotion.fused) : null;
  const weights = currentEmotion?.modalityWeights ?? null;
  const backendReachable = health !== null;

  const tooltipStyle = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 0,
    boxShadow: "none", color: "var(--card-foreground)", fontSize: 12, fontFamily: sans,
  };
  const axisStyle = { fontSize: 11, fill: "var(--muted-foreground)", fontFamily: sans };

  return (
      <div className="page-shell">
        <style>{`
        @keyframes waveBar { from { transform: scaleY(0.3); } to { transform: scaleY(1); } }
      `}</style>

        <div className="page-container">
          {/* Page header */}
          <div className="page-header" style={{ borderColor: "var(--border)" }}>
             <div className="w-full flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1
                    className="font-bold text-foreground leading-tight"
                    style={{ fontFamily: serif, fontSize: "clamp(1.75rem, 3vw, 2.5rem)", letterSpacing: "-0.02em" }}
                >
                  Live Emotion{" "}
                  <em style={{ fontStyle: "italic", color: "var(--primary)" }}>Analysis</em>
                </h1>
                <p className="text-sm text-muted-foreground mt-1.5" style={{ fontFamily: sans, fontWeight: 300 }}>
                  Real-time audio-text fusion · attention-based multimodal analysis
                </p>
               </div>
               {Object.keys(latency).length > 0 && (
                   <div className="w-full max-w-sm lg:ml-auto lg:w-80">
                     <LatencyMonitor values={latency} />
                   </div>
               )}
             </div>
          </div>

          {/* Results shown here are only as real as the backend serving them —
              say so plainly rather than letting placeholders look like data. */}
           {isCheckingHealth && <LoadingPanel title="Backend loading" description="Checking the analysis service connection. Please wait before starting a recording." />}
           {(isSaving || isConnecting || isProcessing || enrollingSpeaker !== null) && (
             <LoadingPanel
               title={isSaving ? "Finalising and saving your recording" : isConnecting ? "Connecting to the model service" : enrollingSpeaker !== null ? "Preparing the speaker's voice profile" : "Analysing the latest speech"}
               description={isSaving ? "Processing the final turn and saving your results before opening Analytics." : isConnecting ? "Preparing the microphone and GPU models. The first connection after an idle period may take longer." : enrollingSpeaker !== null ? "Speak during the countdown, then wait while your sample is processed." : "Transcribing the completed turn and computing its emotion prediction."}
             />
           )}
           {!isCheckingHealth && !backendReachable && (
               <div className="border-l-2 px-4 py-3 mb-8" style={{ borderColor: "#b8312f", backgroundColor: "var(--card)" }}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: "#b8312f", fontFamily: sans }}>
                  Backend unreachable
                </p>
                <p className="text-xs text-muted-foreground" style={{ fontFamily: sans }}>
                  We could not connect to the analysis service. Check your connection and reload this page to try again.
                </p>
              </div>
          )}
          {backendReachable && isMock && (
              <div className="border-l-2 px-4 py-3 mb-8" style={{ borderColor: "#c07c20", backgroundColor: "var(--card)" }}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: "#c07c20", fontFamily: sans }}>
                  Mock mode
                </p>
                <p className="text-xs text-muted-foreground" style={{ fontFamily: sans }}>
                  Transcripts and emotion scores below are randomised placeholders — the trained checkpoint isn't loaded. The full pipeline is running; only the predictions are fake.
                </p>
              </div>
          )}

          {/* Main layout */}
          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-8 items-stretch">

            {/* ── Recorder Control ── */}
            <div className="flex flex-col gap-6 h-full">
              <div className="flex flex-1 flex-col">
                <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>
                  Analysis Control
                </p>
                <div
                    className="border flex flex-1 flex-col"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
                >
                  {/* Color bar */}
                  <div
                      className="h-0.5 w-full transition-all duration-700"
                      style={{
                        backgroundColor: isActive ? "var(--primary)" : isPaused ? "#c07c20" : "var(--muted)",
                      }}
                  />

                  <div className="p-7 flex flex-1 flex-col items-center justify-center gap-5">
                    {!isRecording && (
                        <div className="w-full border-b pb-4" style={{ borderColor: "var(--border)" }}>
                          <div className="flex items-center justify-between mb-2.5">
                            <span className="text-[11px] tracking-[0.14em] uppercase text-muted-foreground" style={{ fontFamily: sans }}>
                              Expected speakers
                            </span>
                             {expectedSpeakers > 1 && (
                                 <span className="text-xs text-muted-foreground" style={{ fontFamily: mono }}>
                                   {expectedSpeakers}
                                 </span>
                             )}
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[1, 2, 3, 4].map((count) => (
                                <button
                                    key={count}
                                    type="button"
                                    disabled={isConnecting || enrollingSpeaker !== null}
                                    onClick={() => changeExpectedSpeakers(count)}
                                    className="border py-1.5 text-xs transition-colors"
                                    style={{
                                      borderColor: count === expectedSpeakers ? "var(--primary)" : "var(--border)",
                                      backgroundColor: count === expectedSpeakers ? "var(--accent)" : "transparent",
                                      color: count === expectedSpeakers ? "var(--primary)" : "var(--muted-foreground)",
                                      fontFamily: mono,
                                    }}
                                >
                                  {count}
                                </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground/70 mt-2 leading-snug" style={{ fontFamily: sans }}>
                            {expectedSpeakers === 1
                                ? "No speaker enrollment required."
                                : "Enroll each person before starting analysis."}
                          </p>
                          {expectedSpeakers > 1 && (
                              <div className="mt-3 space-y-1.5">
                                {Array.from({ length: expectedSpeakers }, (_, index) => {
                                  const enrolled = enrolledSpeakers.includes(index);
                                  const enrolling = enrollingSpeaker === index;
                                  return (
                                      <button
                                          key={index}
                                          type="button"
                                          disabled={enrollingSpeaker !== null || isConnecting}
                                          onClick={() => void enrollSpeaker(index)}
                                          className="w-full border px-3 py-2 flex items-center justify-between text-left transition-colors"
                                          style={{
                                            borderColor: enrolled ? "var(--primary)" : "var(--border)",
                                            backgroundColor: enrolling ? "var(--accent)" : "transparent",
                                            fontFamily: sans,
                                          }}
                                      >
                                        <span className="text-[11px] uppercase tracking-wider text-foreground">
                                          Speaker {index + 1}
                                        </span>
                                        <span
                                            className="text-[10px] uppercase tracking-wider"
                                            style={{ color: enrolled ? "var(--primary)" : "var(--muted-foreground)" }}
                                        >
                                          {enrolling
                                              ? `Speak now · ${enrollmentSeconds}s`
                                              : enrolled
                                                ? "Enrolled"
                                                : "Record 5s"}
                                        </span>
                                      </button>
                                  );
                                })}
                              </div>
                          )}

                          {/*
                            Which speaker's emotions get analysed. Only shown
                            once everyone is enrolled, because until then the
                            speaker numbers aren't stable. Everyone is still
                            transcribed regardless of this choice.
                          */}
                          {expectedSpeakers > 1 && enrolledSpeakers.length === expectedSpeakers && (
                              <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                                <div className="flex items-center justify-between mb-2.5">
                                  <span className="text-[11px] tracking-[0.14em] uppercase text-muted-foreground" style={{ fontFamily: sans }}>
                                    Analyse emotions for
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  {Array.from({ length: expectedSpeakers }, (_, index) => (
                                      <button
                                          key={index}
                                          type="button"
                                          onClick={() => setSubjectIndex(index)}
                                          className="w-full border px-3 py-2 flex items-center gap-2.5 text-left transition-colors"
                                          style={{
                                            borderColor: subjectIndex === index ? "var(--primary)" : "var(--border)",
                                            backgroundColor: subjectIndex === index ? "var(--accent)" : "transparent",
                                            fontFamily: sans,
                                          }}
                                      >
                                        <span
                                            className="size-3 border flex items-center justify-center flex-shrink-0"
                                            style={{ borderColor: subjectIndex === index ? "var(--primary)" : "var(--muted-foreground)" }}
                                        >
                                          {subjectIndex === index && (
                                              <span className="size-1.5" style={{ backgroundColor: "var(--primary)" }} />
                                          )}
                                        </span>
                                        <span className="text-[11px] uppercase tracking-wider text-foreground">
                                          Speaker {index + 1}
                                        </span>
                                      </button>
                                  ))}
                                </div>
                                <input
                                    type="text"
                                    value={subjectName}
                                    maxLength={60}
                                    onChange={(e) => setSubjectName(e.target.value)}
                                    placeholder="Name (optional)"
                                    className="mt-2.5 w-full border px-3 py-2 text-xs bg-transparent"
                                    style={{
                                      borderColor: "var(--border)",
                                      color: "var(--foreground)",
                                      fontFamily: sans,
                                      outline: "none",
                                    }}
                                />
                                <p className="text-[10px] text-muted-foreground/70 mt-2 leading-snug" style={{ fontFamily: sans }}>
                                  {subjectIndex === null
                                      ? "Nobody selected — every speaker's emotions are analysed and counted together."
                                      : `Only Speaker ${subjectIndex + 1} feeds the emotion model, charts and reports. Everyone else is transcribed but not scored.`}
                                </p>
                              </div>
                          )}
                        </div>
                    )}

                    {/* Mic button */}
                    <div className="relative flex items-center justify-center mt-2">
                     {isActive && (
                          <>
                            <div className="absolute size-28 opacity-10 animate-ping" style={{ backgroundColor: "var(--primary)", borderRadius: 0 }} />
                            <div className="absolute size-20 opacity-10" style={{ backgroundColor: "var(--primary)", borderRadius: 0, animation: "ping 1.4s ease-out 0.5s infinite" }} />
                          </>
                     )}

                      <button
                          onClick={!isRecording && !isConnecting ? startRecording : undefined}
                          disabled={
                            isRecording
                            || isConnecting
                            || enrollingSpeaker !== null
                            || !backendReachable
                            || (expectedSpeakers > 1 && enrolledSpeakers.length !== expectedSpeakers)
                          }
                          title={
                            !backendReachable
                              ? (isCheckingHealth ? "Checking backend connection" : "Backend is unavailable")
                              : expectedSpeakers > 1 && enrolledSpeakers.length !== expectedSpeakers
                                ? "Enroll every speaker first"
                                : undefined
                          }
                          className="relative flex items-center justify-center transition-all duration-200"
                          style={{
                            width: 80, height: 80,
                            borderRadius: 0,
                            backgroundColor: !isRecording ? "var(--foreground)" : isActive ? "var(--primary)" : "#c07c20",
                            cursor: !isRecording
                                && backendReachable
                                && !isConnecting
                                && enrollingSpeaker === null
                                && (expectedSpeakers === 1 || enrolledSpeakers.length === expectedSpeakers)
                              ? "pointer"
                              : "not-allowed",
                            opacity: backendReachable ? 1 : 0.4,
                          }}
                      >
                        {isConnecting ? (
                            <span className="size-6 rounded-full border-2 border-background/30 border-t-background animate-spin" />
                        ) : (
                            <Mic style={{ width: 28, height: 28, color: isActive ? "var(--card)" : "var(--background)" }} />
                        )}
                      </button>
                    </div>

                    {/* Timer */}
                    <div className="text-center">
                      <div
                          className="text-5xl leading-none tabular-nums"
                          style={{
                            fontFamily: mono,
                            fontWeight: 400,
                            letterSpacing: "0.06em",
                            color: isActive ? "var(--primary)" : "var(--foreground)",
                          }}
                      >
                        {formatDuration(duration)}
                      </div>
                      <div className="mt-2 h-4 flex items-center justify-center">
                        {isActive && (
                            <span className="text-xs tracking-[0.2em] uppercase font-semibold" style={{ color: "var(--primary)", fontFamily: sans }}>
                          Analysing
                        </span>
                        )}
                        {isPaused && (
                            <span className="text-xs tracking-[0.2em] uppercase font-semibold" style={{ color: "#c07c20", fontFamily: sans }}>
                          Paused
                        </span>
                        )}
                        {isConnecting && (
                            <span className="text-xs tracking-[0.2em] uppercase font-semibold text-muted-foreground" style={{ fontFamily: sans }}>
                          Connecting
                        </span>
                        )}
                        {!isRecording && !isConnecting && duration === 0 && (
                            <span className="text-xs text-muted-foreground tracking-wider" style={{ fontFamily: sans }}>
                          {isCheckingHealth ? "Checking backend..." : backendReachable ? "Tap to begin" : "Backend offline"}
                        </span>
                        )}
                      </div>
                    </div>

                    <div className="w-full"><WaveformBars active={isActive} level={level} /></div>

                    {isActive && (
                        <TurnIndicator
                            speaking={isSpeaking}
                            finalising={isProcessing}
                            speakerName={lastSpeaker}
                            subjectName={subjectName.trim() || null}
                            open={!isSpeaking && !isProcessing}
                        />
                    )}


                    {isRecording && (
                        <div className="flex gap-2 w-full">
                          {!isPaused ? (
                              <Button
                                  variant="outline"
                                  onClick={pauseRecording}
                                  className="flex-1 text-xs font-semibold uppercase tracking-wider py-2"
                                  style={{ fontFamily: sans, borderRadius: 0, borderColor: "var(--border)" }}
                              >
                                <Pause style={{ width: 14, height: 14, marginRight: 6 }} />
                                Pause
                              </Button>
                          ) : (
                              <Button
                                  variant="outline"
                                  onClick={resumeRecording}
                                  className="flex-1 text-xs font-semibold uppercase tracking-wider py-2"
                                  style={{ fontFamily: sans, borderRadius: 0, borderColor: "var(--border)" }}
                              >
                                <Play style={{ width: 14, height: 14, marginRight: 6 }} />
                                Resume
                              </Button>
                          )}
                          <Button
                              onClick={stopRecording}
                              disabled={isSaving}
                              className="flex-1 text-xs font-semibold uppercase tracking-wider py-2"
                              style={{
                                fontFamily: sans, borderRadius: 0,
                                backgroundColor: "var(--foreground)", color: "var(--background)",
                              }}
                          >
                            {isSaving ? (
                                <>
                                  <span className="size-3 rounded-full border-2 border-background/30 border-t-background animate-spin mr-1.5" />
                                  Saving…
                                </>
                            ) : (
                                <>
                                  <Square style={{ width: 14, height: 14, marginRight: 6 }} />
                                  Stop & Save
                                </>
                            )}
                          </Button>
                        </div>
                    )}

                    {emotionData.length > 0 && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Waves style={{ width: 14, height: 14 }} />
                          <span className="text-xs tabular-nums" style={{ fontFamily: mono }}>
                        {emotionData.length} data points
                      </span>
                        </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Score breakdown */}
              {currentEmotion && (
                  <div>
                    <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>
                      Fused Score Breakdown
                    </p>
                    <div className="border p-4 space-y-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                      {Object.entries(currentEmotion.fused)
                          .sort((a, b) => b[1] - a[1])
                          .map(([emotion, value]) => (
                              <div key={emotion} className="flex items-center gap-3">
                        <span className="text-xs w-16 capitalize tracking-wide text-muted-foreground" style={{ fontFamily: sans }}>
                          {emotion}
                        </span>
                                <div className="flex-1 h-1.5" style={{ backgroundColor: "var(--muted)" }}>
                                  <div
                                      className="h-full transition-all duration-500"
                                      style={{ width: `${(value * 100).toFixed(1)}%`, backgroundColor: EMOTION_COLORS[emotion as Emotion] }}
                                  />
                                </div>
                                <span className="text-xs tabular-nums w-8 text-right text-muted-foreground" style={{ fontFamily: mono }}>
                          {(value * 100).toFixed(0)}%
                        </span>
                              </div>
                          ))}
                    </div>
                  </div>
              )}
            </div>

            {/* ── Right panel ── */}
            <div className="space-y-6">

              {/* Live Transcription */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground" style={{ fontFamily: sans }}>
                    Live Transcription
                  </p>
                  {isActive && (
                      <span className="flex items-center gap-1.5 text-xs tracking-widest uppercase font-semibold" style={{ color: "#2e7d52", fontFamily: sans }}>
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                    Streaming
                  </span>
                  )}
                </div>
                <div
                    className="border p-4"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
                >
                  <div
                       ref={transcriptScrollRef}
                       className="min-h-[130px] max-h-48 overflow-y-auto border p-4 space-y-3"
                      style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
                  >
                    {transcript.length === 0 ? (
                        <p className="text-sm text-muted-foreground/50 italic" style={{ fontFamily: serif }}>
                          Transcribed text will appear here in real-time...
                        </p>
                    ) : (
                        transcript.map((entry, index) => (
                            <div
                                key={index}
                                className="flex items-start gap-3"
                                // Other participants are context, not data —
                                // dim them so the subject's turns read first.
                                style={{ opacity: entry.isSubject ? 1 : 0.62 }}
                            >
                        <span className="text-xs text-muted-foreground/60 tabular-nums pt-0.5 w-7 flex-shrink-0" style={{ fontFamily: mono }}>
                          {entry.time}s
                        </span>
                              {entry.speaker && (
                                  <span
                                      className="text-[10px] px-1.5 py-0.5 flex-shrink-0 tracking-wider uppercase font-semibold"
                                      style={{
                                        backgroundColor: "var(--muted)",
                                        color: SPEAKER_COLORS[Math.max(0, Number(entry.speaker.replace(/\D/g, "")) - 1) % SPEAKER_COLORS.length],
                                        fontFamily: sans,
                                      }}
                                      title={entry.speakerConfidence != null ? `${(entry.speakerConfidence * 100).toFixed(0)}% speaker match` : undefined}
                                  >
                                    {entry.speaker}
                                    {entry.isSubject ? " · subject" : ""}
                                  </span>
                              )}
                              {entry.emotion ? (
                                  <span
                                      className="text-xs px-1.5 py-0.5 flex-shrink-0 tracking-widest uppercase font-semibold"
                                      style={{ backgroundColor: "var(--muted)", color: EMOTION_COLORS[entry.emotion], fontFamily: sans }}
                                  >
                            {entry.emotion}
                          </span>
                              ) : (
                                  <span
                                      className="text-[10px] px-1.5 py-0.5 flex-shrink-0 tracking-wider uppercase font-normal"
                                      style={{ backgroundColor: "transparent", color: "var(--muted-foreground)", fontFamily: sans }}
                                      title="Transcribed only — not analysed for emotion"
                                  >
                                    no analysis
                                  </span>
                              )}
                              <span className="text-sm text-foreground leading-relaxed" style={{ fontFamily: sans, fontWeight: 400, wordBreak: "break-word" }}>
                          {entry.text}
                        </span>
                            </div>
                        ))
                    )}
                    {partialTranscript && isActive && (
                        <div className="flex items-start gap-3 border-t pt-3" style={{ borderColor: "var(--border)", opacity: 0.72 }}>
                          <span className="text-xs text-muted-foreground/60 tabular-nums pt-0.5 w-7 flex-shrink-0" style={{ fontFamily: mono }}>now</span>
                          <span className="text-[10px] px-1.5 py-0.5 flex-shrink-0 tracking-wider uppercase font-semibold" style={{ backgroundColor: "var(--accent)", color: "var(--primary)", fontFamily: sans }}>live</span>
                          <span className="text-sm text-foreground leading-relaxed" style={{ fontFamily: sans, fontWeight: 400, wordBreak: "break-word" }}>
                            {partialTranscript}<span className="ml-1 inline-block animate-pulse">▌</span>
                          </span>
                        </div>
                    )}
                    <div ref={transcriptEndRef} />
                  </div>
                </div>
              </div>

              {/* Real-Time Prediction */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground" style={{ fontFamily: sans }}>
                    Real-Time Emotion Prediction
                  </p>
                  <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground" style={{ fontFamily: sans }}>
                  <span className="size-1.5 rounded-full inline-block" style={{ backgroundColor: isActive ? "var(--primary)" : "var(--muted-foreground)", opacity: isActive ? 1 : 0.4 }} />
                    {isProcessing ? "Finalising" : isPreviewing ? "Live estimate" : isActive ? "Listening" : currentEmotion ? "Last result" : "Awaiting input"}
                </span>
                </div>

                <div
                    className="border p-5"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
                >
                  {/*
                    The model has a single classifier over the fused audio+text
                    vector, so there is no audio-only or text-only emotion label
                    to show. What IS per-modality is the trust weighting the
                    model computes for each utterance (its modality_judge), so
                    that is what's displayed alongside the one real prediction.
                  */}
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-5">

                    {/* Fused prediction — the model's actual output */}
                    <div>
                      <span className="text-xs tracking-[0.14em] uppercase font-semibold block mb-3" style={{ fontFamily: sans, color: "var(--foreground)" }}>
                         {isPreviewing ? "Live Estimate" : "Fused Prediction"}
                      </span>
                      <div
                          className="border p-4 flex flex-col items-center justify-center gap-1.5 min-h-[130px]"
                          style={{ borderColor: "var(--foreground)", backgroundColor: "var(--muted)" }}
                      >
                        {fusedResult ? (
                            <>
                              <span className="text-lg font-bold capitalize" style={{ fontFamily: serif, color: EMOTION_COLORS[fusedResult.emotion] }}>
                            {fusedResult.emotion}
                          </span>
                              <span className="text-xs text-muted-foreground" style={{ fontFamily: mono }}>
                            {(fusedResult.confidence * 100).toFixed(0)}% confidence
                          </span>
                            </>
                        ) : (
                            <span className="text-sm text-muted-foreground/50 italic" style={{ fontFamily: serif }}>
                               Speak to see a live estimate…
                            </span>
                        )}
                      </div>
                    </div>

                    {/* Live modality trust weights */}
                    <div>
                      <span className="text-xs tracking-[0.14em] uppercase font-semibold block mb-3" style={{ fontFamily: sans, color: "var(--muted-foreground)" }}>
                        Modality Trust · Audio vs Text
                      </span>
                      <div
                          className="border p-4 min-h-[130px] flex flex-col justify-center gap-4"
                          style={{ borderColor: "var(--border)", borderStyle: "dashed", backgroundColor: "var(--background)" }}
                      >
                        {weights ? (
                            <>
                              {([
                                { label: "Audio", value: weights.audio, color: "var(--primary)", emotion: currentEmotion?.audioEmotion },
                                { label: "Text", value: weights.text, color: "#1e5f8a", emotion: currentEmotion?.textEmotion },
                              ] as const).map((row) => (
                                  <div key={row.label} className="flex items-center gap-3">
                                <span className="text-xs w-16 tracking-wide uppercase text-muted-foreground" style={{ fontFamily: sans }}>
                      {row.label}
                    </span>
                                    <div className="flex-1 h-2" style={{ backgroundColor: "var(--muted)" }}>
                                      <div
                                          className="h-full transition-all duration-500"
                                          style={{ width: `${(row.value * 100).toFixed(1)}%`, backgroundColor: row.color }}
                                      />
                                    </div>
                                    <span className="text-xs tabular-nums w-9 text-right text-muted-foreground" style={{ fontFamily: mono }}>
                                  {(row.value * 100).toFixed(0)}%
                                </span>
                                    {row.emotion && (
                                        <span
                                            className="text-xs px-1.5 py-0.5 uppercase font-semibold tracking-wider"
                                            style={{ backgroundColor: "var(--muted)", color: EMOTION_COLORS[row.emotion.label as Emotion] ?? "var(--foreground)", fontFamily: sans }}
                                        >
                                      {row.emotion.label}
                                    </span>
                                    )}
                                  </div>
                              ))}
                              <p className="text-xs text-muted-foreground/60 leading-snug mt-1" style={{ fontFamily: sans }}>
                                Audio = tone/pitch · Text = words · Fused = combined
                              </p>
                            </>
                        ) : (
                            <span className="text-sm text-muted-foreground/50 italic text-center" style={{ fontFamily: serif }}>—</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline chart */}
              {emotionData.length > 0 && (
                  <div>
                    <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>
                      Emotion Timeline
                    </p>
                    <div className="border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" />
                          <XAxis dataKey="time" tick={axisStyle} />
                          <YAxis tick={axisStyle} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Legend wrapperStyle={{ fontSize: 11, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)" }} />
                          {(Object.keys(EMOTION_COLORS) as Emotion[]).map((e) => (
                              <Line key={e} type="monotone" dataKey={e} stroke={EMOTION_COLORS[e]} strokeWidth={1.5} dot={false} />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
              )}

            </div>
          </div>
        </div>

        {/* Recent live sessions — hidden while a session is actively recording */}
        {!isRecording && (
            <div className="page-container pt-8 pb-8">
              <SessionLoadingIndicator><RecentLiveSessions onViewSession={setViewedSession} /></SessionLoadingIndicator>
            </div>
        )}

        <SessionDetailsDialog session={viewedSession} onClose={() => setViewedSession(null)} />
      </div>
  );
}
