import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Activity, Clock, Brain, Sparkles, Mic, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { useUser } from "../contexts/UserContext";
import { getTimeBasedGreeting, getSessionQuote } from "../utils/userProfile";
import { getSessions } from "../utils/emotionEngine";
import type { Emotion } from "../utils/emotionEngine";

const EMOTION_COLORS: { [key in Emotion]: string } = {
  happy: "#f59e0b",
  sad: "#6ea8fe",
  angry: "#f87171",
  neutral: "#a0a0c0",
  fearful: "#c084fc",
  surprised: "#fb923c",
};

export function Dashboard() {
  const { user } = useUser();
  const [sessions, setSessions] = useState(getSessions());
  const [quote] = useState(getSessionQuote());
  const [greeting] = useState(getTimeBasedGreeting());

  useEffect(() => {
    const interval = setInterval(() => setSessions(getSessions()), 5000);
    return () => clearInterval(interval);
  }, []);

  const totalSessions = sessions.length;
  const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
  const avgConfidence =
    sessions.length > 0
      ? sessions.reduce((sum, s) => sum + s.summary.averageConfidence, 0) / sessions.length
      : 0;

  const emotionDistribution: { [key in Emotion]: number } = {
    happy: 0, sad: 0, angry: 0, neutral: 0, fearful: 0, surprised: 0,
  };
  sessions.forEach((session) => {
    Object.entries(session.summary.emotionDistribution).forEach(([emotion, value]) => {
      emotionDistribution[emotion as Emotion] += value;
    });
  });

  const pieData = Object.entries(emotionDistribution).map(([emotion, value]) => ({
    name: emotion.charAt(0).toUpperCase() + emotion.slice(1),
    db_value: value,
    color: EMOTION_COLORS[emotion as Emotion],
  }));

  const timelineData = sessions.slice(0, 10).reverse().map((session, index) => ({
    name: `S${index + 1}`,
    confidence: parseFloat((session.summary.averageConfidence * 100).toFixed(1)),
  }));

  const trendData = sessions.slice(0, 8).reverse().map((session, index) => {
    const data: any = { name: `S${index + 1}` };
    Object.entries(session.summary.emotionDistribution).forEach(([emotion, value]) => {
      data[`db_${emotion}`] = parseFloat((value * 100).toFixed(1));
    });
    return data;
  });

  const tooltipStyle = {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    color: "var(--card-foreground)",
    fontSize: 12,
  };

  return (
    <div className="p-7 min-h-full bg-background">

      {/* Greeting */}
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-foreground mb-0.5">
          {greeting}, {user.name}!
        </h1>
        <p className="text-sm text-muted-foreground">
          Your emotion monitoring dashboard is live and ready.
        </p>
      </div>

      {/* System status pill */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
          <span className="size-2 rounded-full bg-emerald-400 inline-block" />
          <span className="text-xs text-muted-foreground">All systems online</span>
        </div>
      </div>

      {/* Quote Card */}
      <Card className="mb-6 border-border bg-muted/40">
        <CardContent className="py-4 px-5">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-accent rounded-lg flex-shrink-0 mt-0.5">
              <Sparkles className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm italic text-foreground/80 leading-relaxed">"{quote.text}"</p>
              <p className="text-xs text-muted-foreground mt-1">— {quote.author}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link to="/live">
          <Button className="w-full h-16 bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-sm" size="lg">
            <Mic className="size-4" />
            Start Live Analysis
          </Button>
        </Link>
        <Link to="/upload">
          <Button className="w-full h-16 gap-2 border-border bg-card text-foreground hover:bg-accent" variant="outline" size="lg">
            <Upload className="size-4" />
            Upload Audio File
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Sessions", value: totalSessions, sub: "All time", icon: Activity, iconBg: "bg-primary/10", iconColor: "text-primary" },
          { label: "Total Duration", value: `${Math.round(totalDuration / 60)}m`, sub: "Minutes analyzed", icon: Clock, iconBg: "bg-emerald-500/10", iconColor: "text-emerald-500" },
          { label: "Avg Confidence", value: `${(avgConfidence * 100).toFixed(1)}%`, sub: "Model accuracy", icon: Brain, iconBg: "bg-primary/10", iconColor: "text-primary" },
        ].map(({ label, value, sub, icon: Icon, iconBg, iconColor }) => (
          <Card key={label} className="border-border bg-card">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                  <div className="text-2xl font-semibold text-foreground">{value}</div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
                </div>
                <div className={`p-2 rounded-xl ${iconBg}`}>
                  <Icon className={`size-4 ${iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      {sessions.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-16 text-center">
            <div className="size-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Brain className="size-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium text-foreground mb-2">No sessions yet</h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-xs mx-auto">
              Start a live analysis or upload an audio file to begin analyzing emotions
            </p>
            <div className="flex gap-3 justify-center">
              <Link to="/live"><Button className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm">Start Live Analysis</Button></Link>
              <Link to="/upload"><Button variant="outline" className="text-sm border-border">Upload File</Button></Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 px-5 pt-5">
              <CardTitle className="text-sm font-semibold text-foreground">Emotion Distribution</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={90} dataKey="db_value">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-2 px-5 pt-5">
              <CardTitle className="text-sm font-semibold text-foreground">Session Confidence</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={timelineData} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="confidence" fill="var(--primary)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border bg-card lg:col-span-2">
            <CardHeader className="pb-2 px-5 pt-5">
              <CardTitle className="text-sm font-semibold text-foreground">Emotion Trends</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {(["happy", "sad", "angry", "neutral"] as Emotion[]).map((e) => (
                    <Line key={e} type="monotone" dataKey={`db_${e}`} name={e} stroke={EMOTION_COLORS[e]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
