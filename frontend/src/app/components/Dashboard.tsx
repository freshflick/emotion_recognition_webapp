import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Activity, Clock, Brain, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { useUser } from "../contexts/UserContext";
import { getTimeBasedGreeting, getSessionQuote } from "../utils/userProfile";
import { getSessions } from "../utils/emotionEngine";
import type { Emotion } from "../utils/emotionEngine";

const EMOTION_COLORS: { [key in Emotion]: string } = {
  happy: "#f59e0b",
  sad: "#3b82f6",
  angry: "#ef4444",
  neutral: "#6b7280",
  fearful: "#a855f7",
  surprised: "#f97316",
};

export function Dashboard() {
  const { user } = useUser();
  const [sessions, setSessions] = useState(getSessions());
  const [quote] = useState(getSessionQuote());
  const [greeting] = useState(getTimeBasedGreeting());

  useEffect(() => {
    const interval = setInterval(() => {
      setSessions(getSessions());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalSessions = sessions.length;
  const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
  const avgConfidence =
    sessions.length > 0
      ? sessions.reduce((sum, s) => sum + s.summary.averageConfidence, 0) / sessions.length
      : 0;

  const emotionDistribution: { [key in Emotion]: number } = {
    happy: 0,
    sad: 0,
    angry: 0,
    neutral: 0,
    fearful: 0,
    surprised: 0,
  };

  sessions.forEach((session) => {
    Object.entries(session.summary.emotionDistribution).forEach(([emotion, value]) => {
      emotionDistribution[emotion as Emotion] += value;
    });
  });

  const pieData = Object.entries(emotionDistribution).map(([emotion, value]) => ({
    name: emotion.charAt(0).toUpperCase() + emotion.slice(1),
    value: value,
    color: EMOTION_COLORS[emotion as Emotion],
  }));

  const timelineData = sessions.slice(0, 10).reverse().map((session, index) => ({
    name: `S${index + 1}`,
    confidence: (session.summary.averageConfidence * 100).toFixed(1),
    duration: session.duration,
  }));

  const trendData = sessions.slice(0, 8).reverse().map((session, index) => {
    const data: any = { name: `Session ${index + 1}` };
    Object.entries(session.summary.emotionDistribution).forEach(([emotion, value]) => {
      data[emotion] = (value * 100).toFixed(1);
    });
    return data;
  });

  return (
    <div className="p-8">
      {/* Greeting Section */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">
          {greeting}, {user.name}!
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Welcome back to your emotion monitoring dashboard
        </p>
      </div>

      {/* Motivational Quote Card */}
      <Card className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-100 dark:border-blue-800">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <Sparkles className="size-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="text-lg italic mb-2 text-gray-800 dark:text-gray-200">
                "{quote.text}"
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">— {quote.author}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overview Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">Overview</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Real-time multimodal emotion analysis with audio-text fusion
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Link to="/live">
          <Button className="w-full h-20 text-lg bg-blue-600 hover:bg-blue-700" size="lg">
            <Activity className="size-5 mr-2" />
            Start Live Recording
          </Button>
        </Link>
        <Link to="/upload">
          <Button className="w-full h-20 text-lg" variant="outline" size="lg">
            <svg className="size-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            Upload Audio File
          </Button>
        </Link>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Sessions</CardTitle>
            <Activity className="size-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalSessions}</div>
            <p className="text-xs text-gray-500 mt-1">Across all time periods</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Duration</CardTitle>
            <Clock className="size-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">{Math.round(totalDuration / 60)}m</div>
            <p className="text-xs text-gray-500 mt-1">Minutes analyzed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Confidence</CardTitle>
            <Brain className="size-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">{(avgConfidence * 100).toFixed(1)}%</div>
            <p className="text-xs text-gray-500 mt-1">Model accuracy</p>
          </CardContent>
        </Card>
      </div>

      {sessions.length === 0 ? (
        <Card className="p-12 text-center">
          <Brain className="size-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">No sessions yet</h3>
          <p className="text-gray-500 mb-6">
            Start a live recording or upload an audio file to begin analyzing emotions
          </p>
          <div className="flex gap-4 justify-center">
            <Link to="/live">
              <Button className="bg-blue-600 hover:bg-blue-700">Start Live Recording</Button>
            </Link>
            <Link to="/upload">
              <Button variant="outline">Upload File</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Emotion Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Emotion Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={100}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Confidence Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Sessions Confidence</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="confidence" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Emotion Trends */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Emotion Trends Over Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="happy" stroke={EMOTION_COLORS.happy} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sad" stroke={EMOTION_COLORS.sad} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="angry" stroke={EMOTION_COLORS.angry} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="neutral" stroke={EMOTION_COLORS.neutral} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
