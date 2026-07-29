import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Mic, Square, Play, Pause, Radio, Waves } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  generateMockEmotionData,
  generateMockTranscript,
  addSession,
  calculateSessionSummary,
  type EmotionData,
  type Emotion,
} from "../utils/emotionEngine";
import { toast } from "sonner";

const EMOTION_COLORS: { [key in Emotion]: string } = {
  happy: "#f59e0b",
  sad: "#3b82f6",
  angry: "#ef4444",
  neutral: "#8b8ba8",
  fearful: "#a855f7",
  surprised: "#f97316",
};

const EMOTION_BG: { [key in Emotion]: string } = {
  happy: "#fef3c7",
  sad: "#dbeafe",
  angry: "#fee2e2",
  neutral: "#ededf5",
  fearful: "#f3e8ff",
  surprised: "#ffedd5",
};

const EMOTION_EMOJI: { [key in Emotion]: string } = {
  happy: "😊",
  sad: "😢",
  angry: "😠",
  neutral: "😐",
  fearful: "😨",
  surprised: "😮",
};

function WaveformBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-center justify-center gap-[3px] h-8">
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-primary/50"
          style={{
            height: active ? `${20 + Math.random() * 60}%` : "20%",
            animation: active ? `waveBar ${0.6 + (i % 5) * 0.12}s ease-in-out infinite alternate` : "none",
            animationDelay: `${(i * 0.05) % 0.5}s`,
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
        const now = Date.now();
        const elapsed = Math.floor((now - startTimeRef.current - pausedTimeRef.current) / 1000);
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
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRecording, isPaused]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

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
    } catch {
      toast.error("Could not access microphone");
    }
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

  const isActiveRecording = isRecording && !isPaused;

  const signalStatuses = [
    {
      label: "Microphone",
      status: isActiveRecording ? "active" : isPaused ? "paused" : "ready",
      dot: isActiveRecording ? "bg-rose-400 animate-pulse" : isPaused ? "bg-amber-400" : "bg-emerald-400",
      text: isActiveRecording ? "text-rose-500" : isPaused ? "text-amber-500" : "text-emerald-500",
    },
    {
      label: "Speech Encoder",
      status: isActiveRecording ? "processing" : "standby",
      dot: isActiveRecording ? "bg-primary animate-pulse" : "bg-muted-foreground/30",
      text: isActiveRecording ? "text-primary" : "text-muted-foreground",
    },
    {
      label: "Fusion Model (R20)",
      status: isActiveRecording ? "online" : "idle",
      dot: isActiveRecording ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/30",
      text: isActiveRecording ? "text-emerald-500" : "text-muted-foreground",
    },
  ];

  const audioResult = currentEmotion ? getDominantWithScore(currentEmotion.audio) : null;
  const textResult = currentEmotion ? getDominantWithScore(currentEmotion.text) : null;
  const fusedResult = currentEmotion ? getDominantWithScore(currentEmotion.fused) : null;

  return (
    <div className="min-h-full bg-background">
      <style>{`
        @keyframes waveBar {
          from { transform: scaleY(0.4); }
          to { transform: scaleY(1); }
        }
        @keyframes pulseRing {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .pulse-ring { animation: pulseRing 1.4s ease-out infinite; }
        .pulse-ring-2 { animation: pulseRing 1.4s ease-out 0.5s infinite; }
      `}</style>

      <div className="max-w-7xl mx-auto p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Radio className="size-5 text-primary" />
              <h1 className="text-2xl font-semibold text-foreground">Live Emotion Recording</h1>
            </div>
            <p className="text-sm text-muted-foreground ml-[30px]">
              Real-time audio-text fusion · attention-based multimodal analysis (R20)
            </p>
          </div>
          {isActiveRecording && (
            <Badge className="bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900 flex items-center gap-1.5 px-3 py-1.5 text-xs">
              <span className="size-1.5 rounded-full bg-rose-500 animate-pulse inline-block" />
              LIVE
            </Badge>
          )}
        </div>

        {/* Signal status bar */}
        <div className="flex flex-wrap gap-2 mb-6">
          {signalStatuses.map((s) => (
            <div key={s.label} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
              <span className={`size-2 rounded-full ${s.dot}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className={`text-[10px] font-semibold ${s.text} uppercase tracking-wide`}>{s.status}</span>
            </div>
          ))}
        </div>

        {/* Main layout: left recorder, right panels */}
        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">

          {/* ── Left: Recording Control ── */}
          <div className="space-y-5">
            <Card className="border border-border shadow-sm bg-card overflow-hidden">
              <CardContent className="p-0">
                <div className={`h-1 w-full transition-all duration-700 ${
                  isActiveRecording
                    ? "bg-gradient-to-r from-rose-400 via-pink-400 to-primary"
                    : isPaused
                    ? "bg-gradient-to-r from-amber-300 to-orange-300"
                    : "bg-gradient-to-r from-primary/60 to-primary/30"
                }`} />

                <div className="p-7 flex flex-col items-center gap-5">
                  {/* Mic button */}
                  <div className="relative flex items-center justify-center mt-2">
                    {isActiveRecording && (
                      <>
                        <div className="absolute size-28 rounded-full bg-rose-400/20 pulse-ring" />
                        <div className="absolute size-28 rounded-full bg-rose-400/10 pulse-ring-2" />
                      </>
                    )}
                    <button
                      onClick={!isRecording ? startRecording : undefined}
                      disabled={isRecording}
                      className={`relative size-22 w-22 h-22 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
                        !isRecording
                          ? "bg-primary hover:bg-primary/90 hover:scale-105 cursor-pointer"
                          : isActiveRecording
                          ? "bg-rose-500 cursor-default"
                          : "bg-amber-400 cursor-default"
                      }`}
                      style={{ width: 88, height: 88 }}
                    >
                      <Mic className="size-9 text-primary-foreground" />
                    </button>
                  </div>

                  {/* Timer */}
                  <div className="text-center">
                    <div className={`text-5xl font-mono font-light tracking-widest tabular-nums ${
                      isActiveRecording ? "text-rose-500" : "text-foreground"
                    }`}>
                      {formatDuration(duration)}
                    </div>
                    <div className="mt-1.5 flex items-center justify-center gap-2 h-5">
                      {isActiveRecording && (
                        <>
                          <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
                          <span className="text-[11px] font-semibold text-rose-500 uppercase tracking-widest">Recording</span>
                        </>
                      )}
                      {isPaused && (
                        <>
                          <span className="size-1.5 rounded-full bg-amber-400" />
                          <span className="text-[11px] font-semibold text-amber-500 uppercase tracking-widest">Paused</span>
                        </>
                      )}
                      {!isRecording && duration === 0 && (
                        <span className="text-xs text-muted-foreground">Tap the mic to begin</span>
                      )}
                    </div>
                  </div>

                  {/* Waveform */}
                  <div className="w-full">
                    <WaveformBars active={isActiveRecording} />
                  </div>

                  {/* Controls */}
                  {isRecording && (
                    <div className="flex gap-2.5 w-full">
                      {!isPaused ? (
                        <Button variant="outline" onClick={pauseRecording} className="flex-1 text-foreground">
                          <Pause className="size-3.5 mr-1.5" />
                          Pause
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={resumeRecording} className="flex-1 text-foreground">
                          <Play className="size-3.5 mr-1.5" />
                          Resume
                        </Button>
                      )}
                      <Button onClick={stopRecording} className="flex-1 bg-foreground hover:bg-foreground/90 text-background">
                        <Square className="size-3.5 mr-1.5" />
                        Stop & Save
                      </Button>
                    </div>
                  )}

                  {emotionData.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Waves className="size-3.5" />
                      <span>{emotionData.length} data points captured</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Current Detection summary */}
            {currentEmotion && (
              <Card className="border border-border shadow-sm bg-card">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Fused Score Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-2.5">
                  {Object.entries(currentEmotion.fused)
                    .sort((a, b) => b[1] - a[1])
                    .map(([emotion, value]) => (
                    <div key={emotion} className="flex items-center gap-2.5">
                      <span className="text-xs w-16 capitalize text-muted-foreground">{emotion}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(value * 100).toFixed(1)}%`,
                            backgroundColor: EMOTION_COLORS[emotion as Emotion],
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                        {(value * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Right: Transcription + Prediction + Chart ── */}
          <div className="space-y-4">

            {/* ── LIVE TRANSCRIPTION ── */}
            <div className="rounded-xl border border-border bg-card shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Live Transcription
                </span>
                {isActiveRecording && (
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-500 uppercase tracking-wide">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Streaming
                  </span>
                )}
              </div>
              <div className="min-h-[130px] max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-4 space-y-2.5">
                {transcript.length === 0 ? (
                  <p className="text-sm text-muted-foreground/40 font-mono select-none">
                    [Transcribed text will appear here in real-time...]
                  </p>
                ) : (
                  transcript.map((entry, index) => (
                    <div key={index} className="flex items-start gap-2.5">
                      <span className="text-[11px] text-muted-foreground/40 tabular-nums pt-0.5 w-7 flex-shrink-0">
                        {entry.time}s
                      </span>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-semibold"
                        style={{ backgroundColor: EMOTION_BG[entry.emotion], color: EMOTION_COLORS[entry.emotion] }}
                      >
                        {entry.emotion}
                      </span>
                      <span className="text-sm text-foreground leading-relaxed">{entry.text}</span>
                    </div>
                  ))
                )}
                <div ref={transcriptEndRef} />
              </div>
            </div>

            {/* ── REAL-TIME EMOTION PREDICTION ── */}
            <div className="rounded-xl border border-border bg-card shadow-sm p-5">
              {/* Header row */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Real-Time Emotion Prediction
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className={`size-1.5 rounded-full ${isActiveRecording ? "bg-primary animate-pulse" : "bg-muted-foreground/30"}`} />
                  {isActiveRecording ? "Analyzing" : currentEmotion ? "Last Result" : "Analyzing"}
                </span>
              </div>

              {/* Column labels row */}
              <div className="grid grid-cols-3 gap-3 mb-2">
                <span className="text-xs font-semibold text-foreground">Audio Emotion</span>
                <span className="text-xs font-semibold text-foreground">Text Emotion</span>
                <span className="text-xs font-semibold text-foreground">Fused Output (R20)</span>
              </div>

              {/* Column boxes row */}
              <div className="grid grid-cols-3 gap-3">
                {/* Audio — dashed */}
                <div className="rounded-lg border border-dashed border-border bg-background flex flex-col items-center justify-center py-6 gap-1.5 min-h-[110px]">
                  {audioResult ? (
                    <>
                      <span className="text-2xl mb-0.5">{EMOTION_EMOJI[audioResult.emotion]}</span>
                      <span className="text-sm font-semibold capitalize" style={{ color: EMOTION_COLORS[audioResult.emotion] }}>
                        {audioResult.emotion}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Confidence: <span className="font-medium text-foreground">{(audioResult.confidence * 100).toFixed(0)}%</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground/40 mt-0.5">60% weight</span>
                    </>
                  ) : (
                    <>
                      <span className="text-base font-medium text-muted-foreground/50">--</span>
                      <span className="text-xs text-muted-foreground/50">Confidence: --%</span>
                    </>
                  )}
                </div>

                {/* Text — dashed */}
                <div className="rounded-lg border border-dashed border-border bg-background flex flex-col items-center justify-center py-6 gap-1.5 min-h-[110px]">
                  {textResult ? (
                    <>
                      <span className="text-2xl mb-0.5">{EMOTION_EMOJI[textResult.emotion]}</span>
                      <span className="text-sm font-semibold capitalize" style={{ color: EMOTION_COLORS[textResult.emotion] }}>
                        {textResult.emotion}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Confidence: <span className="font-medium text-foreground">{(textResult.confidence * 100).toFixed(0)}%</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground/40 mt-0.5">40% weight</span>
                    </>
                  ) : (
                    <>
                      <span className="text-base font-medium text-muted-foreground/50">--</span>
                      <span className="text-xs text-muted-foreground/50">Confidence: --%</span>
                    </>
                  )}
                </div>

                {/* Fused — solid + muted bg (highlighted per wireframe) */}
                <div className="rounded-lg border border-border bg-muted/60 flex flex-col items-center justify-center py-6 gap-1.5 min-h-[110px]">
                  {fusedResult ? (
                    <>
                      <span className="text-2xl mb-0.5">{EMOTION_EMOJI[fusedResult.emotion]}</span>
                      <span className="text-sm font-bold capitalize" style={{ color: EMOTION_COLORS[fusedResult.emotion] }}>
                        {fusedResult.emotion}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Confidence: <span className="font-semibold text-foreground">{(fusedResult.confidence * 100).toFixed(0)}%</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground/40 mt-0.5">Fused · final</span>
                    </>
                  ) : (
                    <>
                      <span className="text-base font-medium text-muted-foreground/50">--</span>
                      <span className="text-xs text-muted-foreground/50">Confidence: --%</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ── Emotion Timeline Chart ── */}
            {emotionData.length > 0 && (
              <div className="rounded-xl border border-border bg-card shadow-sm p-5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-4">
                  Emotion Timeline
                </span>
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "10px",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                        fontSize: 12,
                        color: "var(--card-foreground)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="happy" stroke={EMOTION_COLORS.happy} strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="sad" stroke={EMOTION_COLORS.sad} strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="angry" stroke={EMOTION_COLORS.angry} strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="neutral" stroke={EMOTION_COLORS.neutral} strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="fearful" stroke={EMOTION_COLORS.fearful} strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="surprised" stroke={EMOTION_COLORS.surprised} strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
