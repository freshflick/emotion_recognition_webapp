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
    <div className="flex items-center gap-[3px] h-10">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="w-1 rounded-full bg-indigo-400/70"
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

export function LiveRecording() {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [emotionData, setEmotionData] = useState<EmotionData[]>([]);
  const [currentEmotion, setCurrentEmotion] = useState<EmotionData | null>(null);
  const [transcript, setTranscript] = useState<{ time: number; text: string; emotion: Emotion }[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="min-h-full bg-[#f8f8fb] dark:bg-[#16161f]">
      <style>{`
        @keyframes waveBar {
          from { transform: scaleY(0.4); }
          to { transform: scaleY(1); }
        }
        @keyframes pulseRing {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .pulse-ring {
          animation: pulseRing 1.4s ease-out infinite;
        }
        .pulse-ring-2 {
          animation: pulseRing 1.4s ease-out 0.5s infinite;
        }
      `}</style>

      <div className="max-w-6xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Radio className="size-5 text-indigo-500" />
            <h1 className="text-2xl font-semibold text-slate-700 dark:text-slate-200">Live Emotion Recording</h1>
          </div>
          <p className="text-sm text-slate-400 dark:text-slate-500 ml-7">
            Real-time audio-text fusion · attention-based multimodal analysis
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left column: recorder + current emotion */}
          <div className="xl:col-span-1 space-y-5">

            {/* Recording Control Card */}
            <Card className="overflow-hidden border-0 shadow-sm bg-white dark:bg-[#1e1e2a]">
              <CardContent className="p-0">
                {/* Top gradient band */}
                <div className={`h-1.5 w-full transition-all duration-700 ${
                  isActiveRecording
                    ? "bg-gradient-to-r from-rose-400 via-pink-400 to-indigo-400"
                    : isPaused
                    ? "bg-gradient-to-r from-amber-300 to-orange-300"
                    : "bg-gradient-to-r from-indigo-300 to-purple-300"
                }`} />

                <div className="p-8 flex flex-col items-center gap-6">
                  {/* Mic button with pulse rings */}
                  <div className="relative flex items-center justify-center">
                    {isActiveRecording && (
                      <>
                        <div className="absolute size-28 rounded-full bg-rose-400/20 pulse-ring" />
                        <div className="absolute size-28 rounded-full bg-rose-400/15 pulse-ring-2" />
                      </>
                    )}
                    <button
                      onClick={!isRecording ? startRecording : undefined}
                      disabled={isRecording}
                      className={`relative size-24 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
                        !isRecording
                          ? "bg-indigo-500 hover:bg-indigo-600 hover:scale-105 cursor-pointer"
                          : isActiveRecording
                          ? "bg-rose-500 cursor-default"
                          : "bg-amber-400 cursor-default"
                      }`}
                    >
                      <Mic className="size-9 text-white" />
                    </button>
                  </div>

                  {/* Timer */}
                  <div className="text-center">
                    <div className={`text-5xl font-mono font-light tracking-widest tabular-nums ${
                      isActiveRecording ? "text-rose-500" : "text-slate-600 dark:text-slate-300"
                    }`}>
                      {formatDuration(duration)}
                    </div>
                    <div className="mt-2 flex items-center justify-center gap-2 h-6">
                      {isActiveRecording && (
                        <>
                          <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
                          <span className="text-xs font-medium text-rose-500 uppercase tracking-widest">Recording</span>
                        </>
                      )}
                      {isPaused && (
                        <>
                          <span className="size-2 rounded-full bg-amber-400" />
                          <span className="text-xs font-medium text-amber-500 uppercase tracking-widest">Paused</span>
                        </>
                      )}
                      {!isRecording && duration === 0 && (
                        <span className="text-xs text-slate-400">Tap the mic to begin</span>
                      )}
                    </div>
                  </div>

                  {/* Waveform */}
                  <div className="w-full px-2">
                    <WaveformBars active={isActiveRecording} />
                  </div>

                  {/* Control buttons */}
                  {isRecording && (
                    <div className="flex gap-3 w-full">
                      {!isPaused ? (
                        <Button
                          variant="outline"
                          onClick={pauseRecording}
                          className="flex-1 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                        >
                          <Pause className="size-4 mr-2" />
                          Pause
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={resumeRecording}
                          className="flex-1 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                        >
                          <Play className="size-4 mr-2" />
                          Resume
                        </Button>
                      )}
                      <Button
                        onClick={stopRecording}
                        className="flex-1 bg-slate-700 hover:bg-slate-800 text-white dark:bg-slate-600"
                      >
                        <Square className="size-4 mr-2" />
                        Stop & Save
                      </Button>
                    </div>
                  )}

                  {/* Data points badge */}
                  {emotionData.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Waves className="size-3.5" />
                      <span>{emotionData.length} data points captured</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Current Emotion Card */}
            {currentEmotion && (
              <Card className="border-0 shadow-sm bg-white dark:bg-[#1e1e2a]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Current Detection
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Dominant emotion pill */}
                  <div
                    className="flex items-center gap-3 p-4 rounded-xl"
                    style={{ backgroundColor: EMOTION_BG[currentEmotion.dominantEmotion] }}
                  >
                    <span className="text-3xl">{EMOTION_EMOJI[currentEmotion.dominantEmotion]}</span>
                    <div>
                      <div className="text-lg font-semibold capitalize" style={{ color: EMOTION_COLORS[currentEmotion.dominantEmotion] }}>
                        {currentEmotion.dominantEmotion}
                      </div>
                      <div className="text-xs" style={{ color: EMOTION_COLORS[currentEmotion.dominantEmotion] }}>
                        {(currentEmotion.confidence * 100).toFixed(0)}% confidence
                      </div>
                    </div>
                  </div>

                  {/* Fusion scores */}
                  <div className="space-y-2.5">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Fusion Scores</p>
                    {Object.entries(currentEmotion.fused)
                      .sort((a, b) => b[1] - a[1])
                      .map(([emotion, value]) => (
                      <div key={emotion} className="flex items-center gap-3">
                        <span className="text-sm w-16 capitalize text-slate-500 dark:text-slate-400 text-xs">{emotion}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${(value * 100).toFixed(1)}%`,
                              backgroundColor: EMOTION_COLORS[emotion as Emotion],
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 tabular-nums w-8 text-right">
                          {(value * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right column: chart + transcript */}
          <div className="xl:col-span-2 space-y-5">

            {/* Empty state */}
            {!isRecording && emotionData.length === 0 && (
              <Card className="border-0 shadow-sm bg-white dark:bg-[#1e1e2a]">
                <CardContent className="py-20 flex flex-col items-center justify-center text-center">
                  <div className="size-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-4">
                    <Mic className="size-7 text-indigo-400" />
                  </div>
                  <h3 className="text-base font-medium text-slate-600 dark:text-slate-300 mb-2">Ready to analyze</h3>
                  <p className="text-sm text-slate-400 max-w-xs">
                    Press the microphone button to start a live recording session. Emotion data and charts will appear here in real-time.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Real-time Chart */}
            {emotionData.length > 0 && (
              <Card className="border-0 shadow-sm bg-white dark:bg-[#1e1e2a]">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-300">Emotion Timeline</CardTitle>
                    {isActiveRecording && (
                      <Badge className="bg-rose-50 text-rose-500 border-rose-200 dark:bg-rose-900/20 dark:border-rose-800 text-xs">
                        <span className="size-1.5 rounded-full bg-rose-500 animate-pulse mr-1.5 inline-block" />
                        Live
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,160,0.08)" />
                      <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#8888a8" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#8888a8" }} />
                      <Tooltip
                        contentStyle={{
                          background: "white",
                          border: "1px solid rgba(100,100,160,0.15)",
                          borderRadius: "10px",
                          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, color: "#8888a8" }} />
                      <Line type="monotone" dataKey="happy" stroke={EMOTION_COLORS.happy} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="sad" stroke={EMOTION_COLORS.sad} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="angry" stroke={EMOTION_COLORS.angry} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="neutral" stroke={EMOTION_COLORS.neutral} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="fearful" stroke={EMOTION_COLORS.fearful} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="surprised" stroke={EMOTION_COLORS.surprised} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Live Transcript */}
            {transcript.length > 0 && (
              <Card className="border-0 shadow-sm bg-white dark:bg-[#1e1e2a]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-300">Live Transcript</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {transcript.map((entry, index) => (
                      <div key={index} className="flex items-start gap-3 group">
                        <span className="text-[11px] text-slate-300 dark:text-slate-600 tabular-nums pt-0.5 w-8 flex-shrink-0">
                          {entry.time}s
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                          style={{
                            backgroundColor: EMOTION_BG[entry.emotion],
                            color: EMOTION_COLORS[entry.emotion],
                          }}
                        >
                          {entry.emotion}
                        </span>
                        <span className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{entry.text}</span>
                      </div>
                    ))}
                    <div ref={transcriptEndRef} />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
