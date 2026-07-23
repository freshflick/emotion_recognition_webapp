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
    happy: (data.fused.happy * 100).toFixed(1),
    sad: (data.fused.sad * 100).toFixed(1),
    angry: (data.fused.angry * 100).toFixed(1),
    neutral: (data.fused.neutral * 100).toFixed(1),
    fearful: (data.fused.fearful * 100).toFixed(1),
    surprised: (data.fused.surprised * 100).toFixed(1),
  }));

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl mb-2">Audio File Analysis</h1>
          <p className="text-gray-600">
            Upload audio recordings for comprehensive emotion analysis
          </p>
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
                    <Line
                      type="monotone"
                      dataKey="happy"
                      stroke={EMOTION_COLORS.happy}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="sad"
                      stroke={EMOTION_COLORS.sad}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="angry"
                      stroke={EMOTION_COLORS.angry}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="neutral"
                      stroke={EMOTION_COLORS.neutral}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="fearful"
                      stroke={EMOTION_COLORS.fearful}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="surprised"
                      stroke={EMOTION_COLORS.surprised}
                      strokeWidth={2}
                    />
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
