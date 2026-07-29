import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Mic, Square, Play, Pause, Waves } from "lucide-react";
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
  generateMockEmotionData, generateMockTranscript, addSession,
  calculateSessionSummary, type EmotionData, type Emotion,
} from "../utils/emotionEngine";
import { toast } from "sonner";

const EMOTION_COLORS: { [key in Emotion]: string } = {
  happy: "#c07c20", sad: "#1e5f8a", angry: "#b8312f",
  neutral: "#786c5c", fearful: "#7a3a8a", surprised: "#2e7d52",
};

const serif = "'Playfair Display', Georgia, serif";
const sans = "'IBM Plex Sans', system-ui, sans-serif";
const mono = "'IBM Plex Mono', monospace";

function WaveformBars({ active }: { active: boolean }) {
  return (
      <div className="flex items-center justify-center gap-[2px] h-8">
        {Array.from({ length: 32 }).map((_, i) => (
            <div
                key={i}
                style={{
                  width: 2,
                  backgroundColor: active ? "var(--primary)" : "var(--muted-foreground)",
                  opacity: active ? 0.6 : 0.2,
                  height: active ? `${20 + Math.random() * 60}%` : "15%",
                  animation: active ? `waveBar ${0.5 + (i % 5) * 0.12}s ease-in-out infinite alternate` : "none",
                  animationDelay: `${(i * 0.04) % 0.5}s`,
                  transition: "height 0.15s ease",
                }}
            />
        ))}
      </div>
  );
}

function getDominantWithScore(scores: { [key in Emotion]: number }) {
  const entries = Object.entries(scores) as [Emotion, number][];
  const dominant = entries.reduce((a, b) => (a[1] > b[1] ? a : b));
  return { emotion: dominant[0], confidence: dominant[1] };
}

export function LiveRecording() {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [emotionData, setEmotionData] = useState<EmotionData[]>([]);
  const [currentEmotion, setCurrentEmotion] = useState<EmotionData | null>(null);
  const [transcript, setTranscript] = useState<{ time: number; text: string; emotion: Emotion }[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // @ts-ignore
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  useEffect(() => {
    if (isRecording && !isPaused) {
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000);
        setDuration(elapsed);
        if (elapsed % 2 === 0 && elapsed > 0) {
          const newTranscript = generateMockTranscript();
          const newEmotion = generateMockEmotionData(elapsed, newTranscript);
          setEmotionData((prev) => [...prev, newEmotion]);
          setCurrentEmotion(newEmotion);
          setTranscript((prev) => [...prev, { time: elapsed, text: newTranscript, emotion: newEmotion.dominantEmotion }]);
        }
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRecording, isPaused]);

  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [transcript]);

  const startRecording = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsRecording(true);
      setIsPaused(false);
      startTimeRef.current = Date.now();
      pausedTimeRef.current = 0;
      setDuration(0);
      setEmotionData([]);
      setTranscript([]);
      setCurrentEmotion(null);
      toast.success("Recording started");
    } catch { toast.error("Could not access microphone"); }
  };

  const pauseRecording = () => {
    setIsPaused(true);
    toast.info("Recording paused");
  };

  const resumeRecording = () => {
    const pauseStartTime = Date.now();
    pausedTimeRef.current += pauseStartTime - startTimeRef.current;
    startTimeRef.current = pauseStartTime;
    setIsPaused(false);
    toast.info("Recording resumed");
  };

  const stopRecording = () => {
    if (emotionData.length === 0) {
      toast.error("No data recorded");
      setIsRecording(false);
      return;
    }
    const summary = calculateSessionSummary(emotionData);
    addSession({
      id: `session-${Date.now()}`,
      timestamp: Date.now(),
      duration,
      type: "live",
      emotionData,
      summary,
    });
    setIsRecording(false);
    setIsPaused(false);
    toast.success("Recording saved successfully");
    setTimeout(() => navigate("/"), 1500);
  };

  const chartData = emotionData.slice(-20).map((data) => ({
    time: `${data.timestamp}s`,
    happy: (data.fused.happy * 100).toFixed(1),
    sad: (data.fused.sad * 100).toFixed(1),
    angry: (data.fused.angry * 100).toFixed(1),
    neutral: (data.fused.neutral * 100).toFixed(1),
    fearful: (data.fused.fearful * 100).toFixed(1),
    surprised: (data.fused.surprised * 100).toFixed(1),
  }));

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isActive = isRecording && !isPaused;
  const audioResult = currentEmotion ? getDominantWithScore(currentEmotion.audio) : null;
  const textResult = currentEmotion ? getDominantWithScore(currentEmotion.text) : null;
  const fusedResult = currentEmotion ? getDominantWithScore(currentEmotion.fused) : null;

  const tooltipStyle = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 0,
    boxShadow: "none", color: "var(--card-foreground)", fontSize: 12, fontFamily: sans,
  };
  const axisStyle = { fontSize: 11, fill: "var(--muted-foreground)", fontFamily: sans };

  return (
      <div className="min-h-full bg-background">
        <style>{`
        @keyframes waveBar { from { transform: scaleY(0.3); } to { transform: scaleY(1); } }
      `}</style>

        <div className="max-w-7xl mx-auto p-8">
          {/* Page header */}
          <div className="border-b mb-8 pb-6" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2" style={{ fontFamily: sans }}>
                  — Live Session / Multimodal Emotion Recording
                </p>
                <h1
                    className="font-bold text-foreground leading-tight"
                    style={{ fontFamily: serif, fontSize: "clamp(1.75rem, 3vw, 2.5rem)", letterSpacing: "-0.02em" }}
                >
                  Live Emotion{" "}
                  <em style={{ fontStyle: "italic", color: "var(--primary)" }}>Recording</em>
                </h1>
                <p className="text-sm text-muted-foreground mt-1.5" style={{ fontFamily: sans, fontWeight: 300 }}>
                  Real-time audio-text fusion · attention-based multimodal analysis
                </p>
              </div>
              {isActive && (
                  <div
                      className="flex items-center gap-2 px-3 py-1.5 border"
                      style={{ borderColor: "var(--primary)", color: "var(--primary)" }}
                  >
                <span
                    className="size-1.5 rounded-full animate-pulse inline-block"
                    style={{ backgroundColor: "var(--primary)" }}
                />
                    <span className="text-xs tracking-[0.2em] uppercase font-semibold" style={{ fontFamily: sans }}>
                  Live
                </span>
                  </div>
              )}
            </div>

            {/* Signal status */}
            <div className="flex flex-wrap gap-4 mt-4">
              {[
                { label: "Microphone", status: isActive ? "active" : isPaused ? "paused" : "ready", color: isActive ? "#b8312f" : isPaused ? "#c07c20" : "#2e7d52" },
                { label: "Speech Encoder", status: isActive ? "processing" : "standby", color: isActive ? "var(--primary)" : "var(--muted-foreground)" },
                { label: "Fusion Model", status: isActive ? "online" : "idle", color: isActive ? "#2e7d52" : "var(--muted-foreground)" },
              ].map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                    <span className="text-xs tracking-[0.12em] uppercase text-muted-foreground" style={{ fontFamily: sans }}>
                  {s.label}
                </span>
                    <span className="text-xs tracking-widest uppercase font-semibold" style={{ color: s.color, fontFamily: sans }}>
                  {s.status}
                </span>
                  </div>
              ))}
            </div>
          </div>

          {/* Main layout */}
          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-8">

            {/* ── Recorder Control ── */}
            <div className="space-y-6">
              <div>
                <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>
                  Recording Control
                </p>
                <div
                    className="border"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
                >
                  {/* Color bar */}
                  <div
                      className="h-0.5 w-full transition-all duration-700"
                      style={{
                        backgroundColor: isActive ? "var(--primary)" : isPaused ? "#c07c20" : "var(--muted)",
                      }}
                  />

                  <div className="p-7 flex flex-col items-center gap-5">
                    {/* Mic button */}
                    <div className="relative flex items-center justify-center mt-2">
                      {isActive && (
                          <>
                            <div className="absolute size-28 opacity-10 animate-ping" style={{ backgroundColor: "var(--primary)", borderRadius: 0 }} />
                            <div className="absolute size-20 opacity-10" style={{ backgroundColor: "var(--primary)", borderRadius: 0, animation: "ping 1.4s ease-out 0.5s infinite" }} />
                          </>
                      )}
                      <button
                          onClick={!isRecording ? startRecording : undefined}
                          disabled={isRecording}
                          className="relative flex items-center justify-center transition-all duration-200"
                          style={{
                            width: 80, height: 80,
                            borderRadius: 0,
                            backgroundColor: !isRecording ? "var(--foreground)" : isActive ? "var(--primary)" : "#c07c20",
                            cursor: !isRecording ? "pointer" : "default",
                          }}
                      >
                        <Mic style={{ width: 28, height: 28, color: isActive ? "var(--card)" : "var(--background)" }} />
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
                          Recording
                        </span>
                        )}
                        {isPaused && (
                            <span className="text-xs tracking-[0.2em] uppercase font-semibold" style={{ color: "#c07c20", fontFamily: sans }}>
                          Paused
                        </span>
                        )}
                        {!isRecording && duration === 0 && (
                            <span className="text-xs text-muted-foreground tracking-wider" style={{ fontFamily: sans }}>
                          Tap to begin
                        </span>
                        )}
                      </div>
                    </div>

                    <div className="w-full"><WaveformBars active={isActive} /></div>

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
                              className="flex-1 text-xs font-semibold uppercase tracking-wider py-2"
                              style={{
                                fontFamily: sans, borderRadius: 0,
                                backgroundColor: "var(--foreground)", color: "var(--background)",
                              }}
                          >
                            <Square style={{ width: 14, height: 14, marginRight: 6 }} />
                            Stop & Save
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
                        <span className="text-xs w-16 capitalize tracking-wide uppercase text-muted-foreground" style={{ fontFamily: sans }}>
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
                      className="min-h-[130px] max-h-48 overflow-y-auto border p-4 space-y-3"
                      style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
                  >
                    {transcript.length === 0 ? (
                        <p className="text-sm text-muted-foreground/50 italic" style={{ fontFamily: serif }}>
                          Transcribed text will appear here in real-time...
                        </p>
                    ) : (
                        transcript.map((entry, index) => (
                            <div key={index} className="flex items-start gap-3">
                        <span className="text-xs text-muted-foreground/60 tabular-nums pt-0.5 w-7 flex-shrink-0" style={{ fontFamily: mono }}>
                          {entry.time}s
                        </span>
                              <span
                                  className="text-xs px-1.5 py-0.5 flex-shrink-0 tracking-widest uppercase font-semibold"
                                  style={{ backgroundColor: "var(--muted)", color: EMOTION_COLORS[entry.emotion], fontFamily: sans }}
                              >
                          {entry.emotion}
                        </span>
                              <span className="text-sm text-foreground leading-relaxed" style={{ fontFamily: sans, fontWeight: 400 }}>
                          {entry.text}
                        </span>
                            </div>
                        ))
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
                    {isActive ? "Analyzing" : currentEmotion ? "Last Result" : "Awaiting Input"}
                </span>
                </div>

                <div
                    className="border p-5"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
                >
                  {/* Column labels */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {["Audio Emotion", "Text Emotion", "Fused Output"].map((label, i) => (
                        <span
                            key={label}
                            className="text-xs tracking-[0.14em] uppercase font-semibold"
                            style={{ fontFamily: sans, color: i === 2 ? "var(--foreground)" : "var(--muted-foreground)" }}
                        >
                      {label}
                    </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {/* Audio */}
                    <div
                        className="border p-4 flex flex-col items-center justify-center gap-1.5 min-h-[110px]"
                        style={{ borderColor: "var(--border)", borderStyle: "dashed", backgroundColor: "var(--background)" }}
                    >
                      {audioResult ? (
                          <>
                            <span className="text-2xl">{getEmoji(audioResult.emotion)}</span>
                            <span className="text-sm font-bold capitalize" style={{ fontFamily: serif, color: EMOTION_COLORS[audioResult.emotion] }}>
                          {audioResult.emotion}
                        </span>
                            <span className="text-xs text-muted-foreground" style={{ fontFamily: mono }}>
                          {(audioResult.confidence * 100).toFixed(0)}% conf.
                        </span>
                            <span className="text-xs text-muted-foreground/60 tracking-wider uppercase" style={{ fontFamily: sans }}>
                          60% weight
                        </span>
                          </>
                      ) : (
                          <span className="text-sm text-muted-foreground/50 italic" style={{ fontFamily: serif }}>—</span>
                      )}
                    </div>

                    {/* Text */}
                    <div
                        className="border p-4 flex flex-col items-center justify-center gap-1.5 min-h-[110px]"
                        style={{ borderColor: "var(--border)", borderStyle: "dashed", backgroundColor: "var(--background)" }}
                    >
                      {textResult ? (
                          <>
                            <span className="text-2xl">{getEmoji(textResult.emotion)}</span>
                            <span className="text-sm font-bold capitalize" style={{ fontFamily: serif, color: EMOTION_COLORS[textResult.emotion] }}>
                          {textResult.emotion}
                        </span>
                            <span className="text-xs text-muted-foreground" style={{ fontFamily: mono }}>
                          {(textResult.confidence * 100).toFixed(0)}% conf.
                        </span>
                            <span className="text-xs text-muted-foreground/60 tracking-wider uppercase" style={{ fontFamily: sans }}>
                          40% weight
                        </span>
                          </>
                      ) : (
                          <span className="text-sm text-muted-foreground/50 italic" style={{ fontFamily: serif }}>—</span>
                      )}
                    </div>

                    {/* Fused */}
                    <div
                        className="border p-4 flex flex-col items-center justify-center gap-1.5 min-h-[110px]"
                        style={{ borderColor: "var(--foreground)", backgroundColor: "var(--muted)" }}
                    >
                      {fusedResult ? (
                          <>
                            <span className="text-2xl">{getEmoji(fusedResult.emotion)}</span>
                            <span className="text-sm font-bold capitalize" style={{ fontFamily: serif, color: EMOTION_COLORS[fusedResult.emotion] }}>
                          {fusedResult.emotion}
                        </span>
                            <span className="text-xs text-muted-foreground" style={{ fontFamily: mono }}>
                          {(fusedResult.confidence * 100).toFixed(0)}% conf.
                        </span>
                            <span className="text-xs text-muted-foreground/75 tracking-wider uppercase" style={{ fontFamily: sans }}>
                          Fused · final
                        </span>
                          </>
                      ) : (
                          <span className="text-sm text-muted-foreground/50 italic" style={{ fontFamily: serif }}>—</span>
                      )}
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
      </div>
  );
}

function getEmoji(emotion: Emotion): string {
  const map: { [key in Emotion]: string } = {
    happy: "😊", sad: "😢", angry: "😠", neutral: "😐", fearful: "😨", surprised: "😮",
  };
  return map[emotion];
}