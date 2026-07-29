import { useState, useRef } from "react";
import { useNavigate } from "react-router";
import { Upload, FileAudio, Loader2, CheckCircle2 } from "lucide-react";
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
import { Progress } from "./ui/progress";
import {
  generateMockEmotionData, generateMockTranscript, addSession,
  calculateSessionSummary, getSessions, type EmotionData, type Emotion, type Session,
} from "../utils/emotionEngine";
import { toast } from "sonner";

const EMOTION_COLORS: { [key in Emotion]: string } = {
  happy: "#c07c20", sad: "#1e5f8a", angry: "#b8312f",
  neutral: "#786c5c", fearful: "#7a3a8a", surprised: "#2e7d52",
};
const EMOTION_EMOJI: { [key in Emotion]: string } = {
  happy: "😊",
  sad: "😢",
  angry: "😠",
  neutral: "😐",
  fearful: "😨",
  surprised: "😮",
};

function getDominantWithScore(scores: { [key in Emotion]: number }) {
  const entries = Object.entries(scores) as [Emotion, number][];
  const dominant = entries.reduce((a, b) => (a[1] > b[1] ? a : b));
  return { emotion: dominant[0], confidence: dominant[1] };
}

const serif = "'Playfair Display', Georgia, serif";
const sans = "'IBM Plex Sans', system-ui, sans-serif";
const mono = "'IBM Plex Mono', monospace";

function getDominant(scores: { [key in Emotion]: number }) {
  const entries = Object.entries(scores) as [Emotion, number][];
  return entries.reduce((a, b) => (a[1] > b[1] ? a : b));
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")} min`;
}

function timeAgo(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1d ago";
  return `${diffDays}d ago`;
}

/* ── Current Emotion Status Panel ── */
function CurrentEmotionStatus({ latestEmotion }: { latestEmotion: EmotionData }) {
  const [audioDominant, audioConf] = getDominant(latestEmotion.audio);
  const [textDominant, textConf] = getDominant(latestEmotion.text);
  const [fusedDominant, fusedConf] = getDominant(latestEmotion.fused);

  const columns = [
    { label: "Audio Model", emotion: audioDominant, confidence: audioConf, weight: "60% weight" },
    { label: "Text Model", emotion: textDominant, confidence: textConf, weight: "40% weight" },
    { label: "Fused Output", emotion: fusedDominant, confidence: fusedConf, weight: "Final · R20" },
  ];

  return (
    <div className="border" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
      {/* Header row */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <span
          className="text-[9px] tracking-[0.22em] uppercase text-foreground font-semibold"
          style={{ fontFamily: sans }}
        >
          Current Emotion Status
        </span>
        <span
          className="text-[9px] tracking-[0.1em] px-2.5 py-1 border text-muted-foreground"
          style={{ borderColor: "var(--border)", fontFamily: mono }}
        >
          R20: High Reliability Fusion (Audio + Text)
        </span>
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-3 divide-x" style={{ borderColor: "var(--border)" }}>
        {columns.map(({ label, emotion, confidence, weight }, i) => (
          <div key={label} className="p-5">
            <p
              className="text-[9px] tracking-[0.14em] uppercase text-muted-foreground mb-3"
              style={{ fontFamily: sans }}
            >
              {label}
            </p>

            {/* Dashed emotion box */}
            <div
              className="flex items-center justify-center py-5 mb-3"
              style={{
                border: "1.5px dashed var(--border)",
                backgroundColor: "var(--background)",
              }}
            >
              <span
                className="text-xl font-bold uppercase tracking-widest"
                style={{ fontFamily: serif, color: EMOTION_COLORS[emotion] }}
              >
                {emotion}
              </span>
            </div>

            {/* Confidence bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span
                  className="text-[9px] uppercase tracking-wider text-muted-foreground"
                  style={{ fontFamily: sans }}
                >
                  {weight}
                </span>
                <span
                  className="text-[9px] tabular-nums text-muted-foreground"
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
                    backgroundColor: i === 2 ? "var(--foreground)" : EMOTION_COLORS[emotion],
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
    <div className="border" style={{ borderColor: "var(--border)" }}>
      {/* Header */}
      <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <span
          className="text-[9px] tracking-[0.22em] uppercase text-foreground font-semibold"
          style={{ fontFamily: sans }}
        >
          Recent Uploads
        </span>
      </div>

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
                  className="text-sm font-semibold text-foreground truncate"
                  style={{ fontFamily: sans }}
                >
                  recording_{i + 1}.wav
                </p>
                <p
                  className="text-[10px] text-muted-foreground mt-0.5"
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
                className="flex-shrink-0 px-3 py-1.5 border text-[9px] tracking-[0.14em] uppercase transition-colors hover:bg-muted"
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
  );
}

/* ── Main FileAnalysis page ── */
export function FileAnalysis() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [emotionData, setEmotionData] = useState<EmotionData[]>([]);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("audio/")) { toast.error("Please select an audio file"); return; }
      setSelectedFile(file); setAnalysisComplete(false); setEmotionData([]);
      toast.success("File selected");
    }
  };

  const analyzeFile = async () => {
    if (!selectedFile) return;
    setIsProcessing(true); setProgress(0); setEmotionData([]);
    const duration = 30; const dataPoints = 15;
    for (let i = 0; i <= dataPoints; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const timestamp = Math.floor((i / dataPoints) * duration);
      const transcript = generateMockTranscript();
      const newEmotion = generateMockEmotionData(timestamp, transcript);
      
      setEmotionData((prev) => [...prev, newEmotion]);
      setProgress(((i + 1) / (dataPoints + 1)) * 100);
    }

    // Save session
    const allEmotionData: EmotionData[] = [];
    for (let i = 0; i <= dataPoints; i++) {
      const timestamp = Math.floor((i / dataPoints) * duration);
      allEmotionData.push(generateMockEmotionData(timestamp, generateMockTranscript()));
    }

    const summary = calculateSessionSummary(allEmotionData);
    addSession({ id: `session-${Date.now()}`, timestamp: Date.now(), duration, type: "upload", emotionData: allEmotionData, summary });
    setIsProcessing(false); setAnalysisComplete(true);
    toast.success("Analysis complete!");
  };

  const chartData = emotionData.map((data) => ({
    time: `${data.timestamp}s`,
    fa_happy: (data.fused.happy * 100).toFixed(1),
    fa_sad: (data.fused.sad * 100).toFixed(1),
    fa_angry: (data.fused.angry * 100).toFixed(1),
    fa_neutral: (data.fused.neutral * 100).toFixed(1),
    fa_fearful: (data.fused.fearful * 100).toFixed(1),
    fa_surprised: (data.fused.surprised * 100).toFixed(1),
  }));

  const latestEmotion = emotionData[emotionData.length - 1] ?? null;

  const tooltipStyle = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 0,
    boxShadow: "none", color: "var(--card-foreground)", fontSize: 11, fontFamily: sans,
  };
  const axisStyle = { fontSize: 10, fill: "var(--muted-foreground)", fontFamily: sans };

  return (
    <div className="p-8 bg-background min-h-full">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="border-b mb-8 pb-6" style={{ borderColor: "var(--border)" }}>
          <p className="text-[9px] tracking-[0.22em] uppercase text-muted-foreground mb-2" style={{ fontFamily: sans }}>
            — File Analysis / Audio Upload
          </p>
          <h1
            className="font-bold text-foreground leading-tight"
            style={{ fontFamily: serif, fontSize: "clamp(1.75rem, 3vw, 2.5rem)", letterSpacing: "-0.02em" }}
          >
            Audio File{" "}
            <em style={{ fontStyle: "italic", color: "var(--primary)" }}>Analysis</em>
          </h1>
          <p className="text-xs text-muted-foreground mt-1.5" style={{ fontFamily: sans, fontWeight: 300 }}>
            Upload audio recordings for comprehensive multimodal emotion analysis.
          </p>
        </div>

        {/* ML Signal status */}
        <div className="flex flex-wrap gap-4 mb-8">
          {[
            { label: "RoBERTa NLP", status: isProcessing ? "processing" : "ready", color: isProcessing ? "#7a3a8a" : "#2e7d52" },
            { label: "Speech Encoder", status: isProcessing ? "active" : "standby", color: isProcessing ? "#2e7d52" : "var(--muted-foreground)" },
            { label: "Fusion Model", status: analysisComplete ? "done" : isProcessing ? "running" : "idle", color: analysisComplete ? "#2e7d52" : isProcessing ? "#1e5f8a" : "var(--muted-foreground)" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full inline-block" style={{ backgroundColor: s.color }} />
              <span className="text-[9px] tracking-widest uppercase text-muted-foreground" style={{ fontFamily: sans }}>
                {s.label}
              </span>
              <span className="text-[9px] tracking-widest uppercase font-semibold" style={{ color: s.color, fontFamily: sans }}>
                {s.status}
              </span>
            </div>
          ))}
        </div>

        {/* Upload zone */}
        <div className="mb-8">
          <p className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>
            Upload Audio File
          </p>
          <div
            className="border transition-colors cursor-pointer"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="p-12 text-center border-b border-dashed" style={{ borderColor: "var(--border)" }}>
              <Upload
                className="mx-auto mb-4"
                style={{ width: 36, height: 36, color: "var(--muted-foreground)", opacity: 0.4 }}
              />
              <p
                className="text-base mb-1.5"
                style={{ fontFamily: serif, fontWeight: 700, color: "var(--foreground)" }}
              >
                {selectedFile ? selectedFile.name : "Click to upload audio"}
              </p>
              <p className="text-[10px] text-muted-foreground tracking-wide uppercase" style={{ fontFamily: sans }}>
                MP3 · WAV · M4A · OGG — Max 50 MB
              </p>
              <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelect} className="hidden" />
            </div>

            {selectedFile && (
              <div className="flex items-center gap-4 p-4 border-t" style={{ borderColor: "var(--border)" }}>
                <FileAudio style={{ width: 28, height: 28, color: "var(--primary)" }} />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-foreground" style={{ fontFamily: sans }}>{selectedFile.name}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums" style={{ fontFamily: mono }}>
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
                {analysisComplete && <CheckCircle2 style={{ width: 18, height: 18, color: "#2e7d52" }} />}
              </div>
            )}
          </div>

          {selectedFile && !analysisComplete && (
            <div className="mt-4 space-y-3">
              <Button
                className="w-full text-[10px] tracking-[0.15em] uppercase py-3"
                onClick={analyzeFile}
                disabled={isProcessing}
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
                  <p className="text-[9px] tracking-widest uppercase text-muted-foreground text-center" style={{ fontFamily: sans }}>
                    Extracting emotion features...
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Current Emotion Status (shows during and after analysis) ── */}
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
              <p className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>
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
                      <p className="text-[9px] tracking-widest uppercase text-muted-foreground mb-1 capitalize" style={{ fontFamily: sans }}>
                        {emotion}
                      </p>
                      <div className="text-2xl font-bold" style={{ fontFamily: serif, color: EMOTION_COLORS[emotion as Emotion] }}>
                        {count}×
                      </div>
                      <p className="text-[9px] text-muted-foreground" style={{ fontFamily: sans }}>occurrences</p>
                    </div>
                  ))}
              </div>
            </div>

            {/* Timeline chart */}
            <div className="mb-8">
              <p className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>
                Emotion Timeline
              </p>
              <div className="border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" />
                    <XAxis dataKey="time" tick={axisStyle} />
                    <YAxis tick={axisStyle} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em" }} />
                    {(Object.keys(EMOTION_COLORS) as Emotion[]).map((e) => (
                      <Line key={e} type="monotone" dataKey={e} stroke={EMOTION_COLORS[e]} strokeWidth={1.5} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Transcript */}
            <div className="mb-8">
              <p className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>
                Generated Transcript
              </p>
              <div className="border p-4 space-y-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                {emotionData.map((data, index) => (
                  <div key={index} className="flex items-start gap-3 text-sm border-b py-2" style={{ borderColor: "var(--border)" }}>
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums w-8 flex-shrink-0 pt-0.5" style={{ fontFamily: mono }}>
                      [{data.timestamp}s]
                    </span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 flex-shrink-0 tracking-widest uppercase font-semibold"
                      style={{ backgroundColor: "var(--muted)", color: EMOTION_COLORS[data.dominantEmotion], fontFamily: sans }}
                    >
                      {data.dominantEmotion}
                    </span>
                    <span className="text-sm text-foreground" style={{ fontFamily: sans, fontWeight: 300 }}>
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
                style={{ fontFamily: sans, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", borderRadius: 0, borderColor: "var(--border)" }}
              >
                Analyze Another File
              </Button>
              <Button
                onClick={() => navigate("/")}
                style={{ fontFamily: sans, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", borderRadius: 0, backgroundColor: "var(--foreground)", color: "var(--background)" }}
              >
                Dashboard
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/reports")}
                style={{ fontFamily: sans, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", borderRadius: 0, borderColor: "var(--border)" }}
              >
                Generate Report
              </Button>
            </div>
          </>
        )}

        {/* ── Recent Uploads ── */}
        <RecentUploads />
      </div>
    </div>
  );
}
