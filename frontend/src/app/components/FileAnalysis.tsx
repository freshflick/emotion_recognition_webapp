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
  neutral: "#6b7280",
  fearful: "#a855f7",
  surprised: "#f97316",
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
      // Check if it's an audio file
      if (!file.type.startsWith("audio/")) {
        toast.error("Please select an audio file");
        return;
      }
      setSelectedFile(file);
      setAnalysisComplete(false);
      setEmotionData([]);
      toast.success("File selected successfully");
    }
  };

  const analyzeFile = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setProgress(0);
    setEmotionData([]);

    // Simulate audio analysis process
    const duration = 30; // Simulate 30 seconds of audio
    const dataPoints = 15; // Generate 15 emotion data points
    const interval = 100; // Update every 100ms

    for (let i = 0; i <= dataPoints; i++) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      
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
      const transcript = generateMockTranscript();
      const emotion = generateMockEmotionData(timestamp, transcript);
      allEmotionData.push(emotion);
    }

    const summary = calculateSessionSummary(allEmotionData);
    addSession({
      id: `session-${Date.now()}`,
      timestamp: Date.now(),
      duration,
      type: "upload",
      emotionData: allEmotionData,
      summary,
    });

    setIsProcessing(false);
    setAnalysisComplete(true);
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

  return (
    <div className="p-7 bg-background min-h-full">
      <div className="max-w-7xl mx-auto">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-slate-700 dark:text-slate-200 mb-0.5">Audio File Analysis</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Upload audio recordings for comprehensive emotion analysis
          </p>
        </div>

        {/* ML model status signals */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { label: "RoBERTa NLP", status: isProcessing ? "processing" : "ready", dot: isProcessing ? "bg-violet-400 animate-pulse" : "bg-emerald-400", text: isProcessing ? "text-violet-500" : "text-emerald-500" },
            { label: "Speech Encoder", status: isProcessing ? "active" : "standby", dot: isProcessing ? "bg-emerald-400 animate-pulse" : "bg-slate-300 dark:bg-slate-600", text: isProcessing ? "text-emerald-500" : "text-slate-400" },
            { label: "Fusion Model", status: analysisComplete ? "done" : isProcessing ? "running" : "idle", dot: analysisComplete ? "bg-emerald-400" : isProcessing ? "bg-sky-400 animate-pulse" : "bg-slate-300 dark:bg-slate-600", text: analysisComplete ? "text-emerald-500" : isProcessing ? "text-sky-500" : "text-slate-400" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
              <span className={`size-2 rounded-full ${s.dot}`} />
              <span className="text-xs text-slate-500 dark:text-slate-400">{s.label}</span>
              <span className={`text-[10px] font-medium ${s.text} capitalize`}>{s.status}</span>
            </div>
          ))}
        </div>

        {/* File Upload Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Upload Audio File</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Drop Zone */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg mb-2">
                  {selectedFile ? selectedFile.name : "Click to upload or drag and drop"}
                </p>
                <p className="text-sm text-gray-500">
                  Supported formats: MP3, WAV, M4A, OGG (Max 50MB)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {/* File Info */}
              {selectedFile && (
                <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
                  <FileAudio className="size-10 text-blue-600" />
                  <div className="flex-1">
                    <div className="font-semibold">{selectedFile.name}</div>
                    <div className="text-sm text-gray-600">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                  {analysisComplete && (
                    <CheckCircle2 className="size-6 text-green-600" />
                  )}
                </div>
              )}

              {/* Analyze Button */}
              {selectedFile && !analysisComplete && (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={analyzeFile}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="size-5 mr-2 animate-spin" />
                      Processing... {progress.toFixed(0)}%
                    </>
                  ) : (
                    <>
                      <Upload className="size-5 mr-2" />
                      Analyze Audio
                    </>
                  )}
                </Button>
              )}

              {/* Progress Bar */}
              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-center text-gray-600">
                    Analyzing audio and extracting emotion features...
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Real-Time Emotion Prediction Panel */}
        {(isProcessing || analysisComplete) && (() => {
          const hasData = emotionData.length > 0;
          const current = hasData ? emotionData[emotionData.length - 1] : null;
          const audioResult = current ? getDominantWithScore(current.audio) : null;
          const textResult = current ? getDominantWithScore(current.text) : null;
          const fusedResult = current ? getDominantWithScore(current.fused) : null;

          return (
            <div className="rounded-xl border border-border bg-card shadow-sm p-5 mb-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Real-Time Emotion Prediction
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                  <span className={`size-1.5 rounded-full ${isProcessing ? "bg-primary animate-pulse" : "bg-emerald-400"}`} />
                  <span className={isProcessing ? "text-primary" : "text-emerald-500"}>
                    {isProcessing ? "Analyzing" : "Complete"}
                  </span>
                </span>
              </div>

              {/* Column labels */}
              <div className="grid grid-cols-3 gap-3 mb-2">
                <span className="text-sm font-semibold text-foreground">Audio Emotion</span>
                <span className="text-sm font-semibold text-foreground">Text Emotion</span>
                <span className="text-sm font-semibold text-foreground">Fused Output (R20)</span>
              </div>

              {/* Columns */}
              <div className="grid grid-cols-3 gap-3">
                {/* Audio */}
                <div className="rounded-lg border border-dashed border-border bg-muted/40 flex flex-col items-center justify-center py-7 gap-1.5 min-h-[120px]">
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
                      <span className="text-lg font-semibold text-muted-foreground/50 mb-0.5">--</span>
                      <span className="text-xs text-muted-foreground/50">Confidence: --%</span>
                    </>
                  )}
                </div>

                {/* Text */}
                <div className="rounded-lg border border-dashed border-border bg-muted/40 flex flex-col items-center justify-center py-7 gap-1.5 min-h-[120px]">
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
                      <span className="text-lg font-semibold text-muted-foreground/50 mb-0.5">--</span>
                      <span className="text-xs text-muted-foreground/50">Confidence: --%</span>
                    </>
                  )}
                </div>

                {/* Fused */}
                <div className="rounded-lg border border-border bg-muted/60 flex flex-col items-center justify-center py-7 gap-1.5 min-h-[120px]">
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
                      <span className="text-lg font-semibold text-muted-foreground/50 mb-0.5">--</span>
                      <span className="text-xs text-muted-foreground/50">Confidence: --%</span>
                    </>
                  )}
                </div>
              </div>

              {/* Fused score breakdown — only when data available */}
              {current && (
                <div className="mt-4 space-y-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Fused Score Breakdown</span>
                  {(Object.entries(current.fused) as [Emotion, number][])
                    .sort((a, b) => b[1] - a[1])
                    .map(([emotion, value]) => (
                    <div key={emotion} className="flex items-center gap-2.5">
                      <span className="text-xs w-16 capitalize text-muted-foreground">{emotion}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${(value * 100).toFixed(1)}%`, backgroundColor: EMOTION_COLORS[emotion] }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{(value * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Analysis Results */}
        {analysisComplete && emotionData.length > 0 && (
          <>
            {/* Summary Card */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Analysis Summary</CardTitle>
              </CardHeader>
              <CardContent>
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
                      <div
                        key={emotion}
                        className="text-center p-4 bg-gray-50 rounded-lg"
                      >
                        <div className="text-sm text-gray-600 mb-1 capitalize">
                          {emotion}
                        </div>
                        <div
                          className="text-2xl"
                          style={{ color: EMOTION_COLORS[emotion as Emotion] }}
                        >
                          {count}x
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Emotion Timeline Chart */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Emotion Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="fa_happy" name="Happy" stroke={EMOTION_COLORS.happy} strokeWidth={2} />
                    <Line type="monotone" dataKey="fa_sad" name="Sad" stroke={EMOTION_COLORS.sad} strokeWidth={2} />
                    <Line type="monotone" dataKey="fa_angry" name="Angry" stroke={EMOTION_COLORS.angry} strokeWidth={2} />
                    <Line type="monotone" dataKey="fa_neutral" name="Neutral" stroke={EMOTION_COLORS.neutral} strokeWidth={2} />
                    <Line type="monotone" dataKey="fa_fearful" name="Fearful" stroke={EMOTION_COLORS.fearful} strokeWidth={2} />
                    <Line type="monotone" dataKey="fa_surprised" name="Surprised" stroke={EMOTION_COLORS.surprised} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Transcript */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Generated Transcript</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  {emotionData.map((data, index) => (
                    <div key={index} className="text-sm">
                      <span className="text-gray-500">[{data.timestamp}s]</span>{" "}
                      <span className="capitalize text-xs font-semibold mr-2"
                        style={{ color: EMOTION_COLORS[data.dominantEmotion] }}>
                        {data.dominantEmotion}
                      </span>
                      {data.transcript}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedFile(null);
                  setAnalysisComplete(false);
                  setEmotionData([]);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              >
                Analyze Another File
              </Button>
              <Button onClick={() => navigate("/")}>View Dashboard</Button>
              <Button variant="outline" onClick={() => navigate("/reports")}>
                Generate Report
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
