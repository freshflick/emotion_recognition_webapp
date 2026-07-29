import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { getSessions, type Emotion } from "../utils/emotionEngine";

const EMOTION_COLORS: { [key in Emotion]: string } = {
  happy: "#c07c20",
  sad: "#1e5f8a",
  angry: "#b8312f",
  neutral: "#786c5c",
  fearful: "#7a3a8a",
  surprised: "#2e7d52",
};

const serif = "'Playfair Display', Georgia, serif";
const sans = "'IBM Plex Sans', system-ui, sans-serif";

type TimeRange = "week" | "month" | "quarter" | "year";

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className="text-[9px] tracking-[0.22em] uppercase text-muted-foreground/60" style={{ fontFamily: sans }}>
        — {label}
      </span>
      <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
    </div>
  );
}

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>
        {title}
      </p>
      <div className="border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
        {children}
      </div>
    </div>
  );
}

export function Analytics() {
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const [activeTab, setActiveTab] = useState("overview");
  const sessions = getSessions();

  // Filter sessions by time range
  const filterByTimeRange = (range: TimeRange) => {
    const now = new Date();
    return sessions.filter((session) => {
      const sessionDate = new Date(session.timestamp);
      const daysAgo = { week: 7, month: 30, quarter: 90, year: 365 }[range];
      return sessionDate >= new Date(now.getTime() - daysAgo * 86400000);
    });
  };

  const filteredSessions = filterByTimeRange(timeRange);

  // Emotion counts for the period
  const emotionCounts: { [key in Emotion]: number } = {
    happy: 0,
    sad: 0,
    angry: 0,
    neutral: 0,
    fearful: 0,
    surprised: 0,
  };
  filteredSessions.forEach((s) => { emotionCounts[s.summary.dominantEmotion]++; });

  filteredSessions.forEach((session) => {
    emotionCounts[session.summary.dominantEmotion]++;
  });

  // Bar chart data - emotion counts
  const barChartData = Object.entries(emotionCounts).map(([emotion, count]) => ({
    emotion: emotion.charAt(0).toUpperCase() + emotion.slice(1),
    count,
    fill: EMOTION_COLORS[emotion as Emotion],
  }));

  // Pie chart data - emotion distribution
  const pieChartData = Object.entries(emotionCounts)
    .filter(([_, count]) => count > 0)
    .map(([emotion, count]) => ({
      name: emotion.charAt(0).toUpperCase() + emotion.slice(1),
      value: count,
      color: EMOTION_COLORS[emotion as Emotion],
    }));

  // Daily emotion breakdown
  const dailyBreakdown: {
    [date: string]: { [key in Emotion]: number } & { date: string };
  } = {};

  filteredSessions.forEach((session) => {
    const date = new Date(session.timestamp).toLocaleDateString();
    if (!dailyBreakdown[date]) {
      dailyBreakdown[date] = {
        date: date.split("/").slice(0, 2).join("/"),
        happy: 0,
        sad: 0,
        angry: 0,
        neutral: 0,
        fearful: 0,
        surprised: 0,
      };
    }
    dailyBreakdown[date][session.summary.dominantEmotion]++;
  });
  const dailyChartData = Object.values(dailyBreakdown).slice(-14);

  // Radar chart data - average emotion intensity
  const emotionIntensity: { [key in Emotion]: number } = {
    happy: 0,
    sad: 0,
    angry: 0,
    neutral: 0,
    fearful: 0,
    surprised: 0,
  };

  let intensityCount = 0;
  filteredSessions.forEach((session) => {
    session.emotionData.forEach((data) => {
      Object.entries(data.fused).forEach(([emotion, value]) => {
        emotionIntensity[emotion as Emotion] += value;
      });
      intensityCount++;
    });
  });

  const radarData = Object.entries(emotionIntensity).map(([emotion, total]) => ({
    emotion: emotion.charAt(0).toUpperCase() + emotion.slice(1),
    value: intensityCount > 0 ? ((total / intensityCount) * 100).toFixed(1) : 0,
  }));

  // Emotion timeline (area chart)
  const timelineData = filteredSessions.slice(-20).map((session, index) => {
    const data: any = { 
      session: `S${index + 1}`,
      time: new Date(session.timestamp).toLocaleDateString(),
    };
    Object.entries(session.summary.emotionDistribution).forEach(([emotion, value]) => {
      data[`an_${emotion}`] = (value * 100).toFixed(1);
    });
    return data;
  });

  // Statistics
  const totalSessions = filteredSessions.length;
  const dominantEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0];
  const avgConfidence =
    totalSessions > 0
      ? filteredSessions.reduce((sum, s) => sum + s.summary.averageConfidence, 0) /
        totalSessions
      : 0;
  const totalDuration = filteredSessions.reduce((sum, s) => sum + s.duration, 0);

  const tooltipStyle = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 0,
    boxShadow: "none", color: "var(--card-foreground)", fontSize: 11, fontFamily: sans,
  };
  const axisStyle = { fontSize: 10, fill: "var(--muted-foreground)", fontFamily: sans };
  const legendStyle = { fontSize: 10, fontFamily: sans, textTransform: "uppercase" as const, letterSpacing: "0.08em" };

  return (
    <div className="p-8 bg-background min-h-full">

      {/* Header */}
      <div className="border-b mb-8 pb-6" style={{ borderColor: "var(--border)" }}>
        <p className="text-[9px] tracking-[0.22em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>
          — Emotion Analytics / Deep Pattern Analysis
        </p>
        <div className="flex items-end justify-between gap-4">
          <h1
            className="font-bold text-foreground leading-tight"
            style={{ fontFamily: serif, fontSize: "clamp(1.75rem, 3vw, 2.5rem)", letterSpacing: "-0.02em" }}
          >
            Emotion <em style={{ fontStyle: "italic", color: "var(--primary)" }}>Analytics</em>
          </h1>
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger
              className="w-36 border text-xs"
              style={{ borderColor: "var(--border)", borderRadius: 0, fontFamily: sans, letterSpacing: "0.06em" }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={{ borderRadius: 0, fontFamily: sans }}>
              <SelectItem value="week">Last Week</SelectItem>
              <SelectItem value="month">Last Month</SelectItem>
              <SelectItem value="quarter">Last Quarter</SelectItem>
              <SelectItem value="year">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary stats */}
      <div className="mb-8">
        <SectionRule label="Period Summary" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: "Total Sessions", value: totalSessions, sub: "In selected period" },
            {
              label: "Dominant Emotion",
              value: dominantEmotion ? dominantEmotion[0] : "N/A",
              sub: dominantEmotion ? `${dominantEmotion[1]} occurrences` : "No data",
              color: dominantEmotion ? EMOTION_COLORS[dominantEmotion[0] as Emotion] : undefined,
            },
            { label: "Avg Confidence", value: `${(avgConfidence * 100).toFixed(1)}%`, sub: "Model accuracy" },
            { label: "Total Duration", value: `${Math.round(totalDuration / 60)}m`, sub: "Minutes analyzed" },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="border-l-2 pl-4 py-1" style={{ borderColor: "var(--border)" }}>
              <p className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1" style={{ fontFamily: sans }}>
                {label}
              </p>
              <div
                className="text-2xl font-bold leading-none mb-1 capitalize"
                style={{ fontFamily: serif, letterSpacing: "-0.02em", color: color || "var(--foreground)" }}
              >
                {value}
              </div>
              <p className="text-[10px] text-muted-foreground" style={{ fontFamily: sans }}>{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <div className="border-b" style={{ borderColor: "var(--border)" }}>
          <TabsList className="bg-transparent h-auto p-0 gap-0">
            {["overview", "trends", "intensity", "comparison"].map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent px-4 pb-3 pt-0 text-[10px] tracking-[0.14em] uppercase"
                style={{ fontFamily: sans }}
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartShell title="Emotion Count by Type">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={barChartData}>
                  <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" />
                  <XAxis dataKey="emotion" tick={axisStyle} />
                  <YAxis tick={axisStyle} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" radius={0}>
                    {barChartData.map((entry, index) => (
                      <Cell key={`bar-cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
            <ChartShell title="Emotion Distribution">
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={pieChartData} cx="50%" cy="50%" labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={110} dataKey="value">
                    {pieChartData.map((entry, index) => (
                      <Cell key={`pie-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>
          <ChartShell title="Daily Emotion Breakdown">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" />
                <XAxis dataKey="date" tick={axisStyle} />
                <YAxis tick={axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={legendStyle} />
                <Bar name="daily-happy" dataKey="happy" stackId="a" fill={EMOTION_COLORS.happy} />
                <Bar name="daily-sad" dataKey="sad" stackId="a" fill={EMOTION_COLORS.sad} />
                <Bar name="daily-angry" dataKey="angry" stackId="a" fill={EMOTION_COLORS.angry} />
                <Bar name="daily-neutral" dataKey="neutral" stackId="a" fill={EMOTION_COLORS.neutral} />
                <Bar name="daily-fearful" dataKey="fearful" stackId="a" fill={EMOTION_COLORS.fearful} />
                <Bar name="daily-surprised" dataKey="surprised" stackId="a" fill={EMOTION_COLORS.surprised} />
              </BarChart>
            </ResponsiveContainer>
          </ChartShell>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6 mt-6">
          <ChartShell title="Emotion Timeline — Area View">
            <ResponsiveContainer width="100%" height={360}>
              <AreaChart data={timelineData}>
                <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" />
                <XAxis dataKey="session" tick={axisStyle} />
                <YAxis tick={axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={legendStyle} />
                <Area name="area-happy" type="monotone" dataKey="happy" stackId="1" stroke={EMOTION_COLORS.happy} fill={EMOTION_COLORS.happy} fillOpacity={0.5} />
                <Area name="area-sad" type="monotone" dataKey="sad" stackId="1" stroke={EMOTION_COLORS.sad} fill={EMOTION_COLORS.sad} fillOpacity={0.5} />
                <Area name="area-angry" type="monotone" dataKey="angry" stackId="1" stroke={EMOTION_COLORS.angry} fill={EMOTION_COLORS.angry} fillOpacity={0.5} />
                <Area name="area-neutral" type="monotone" dataKey="neutral" stackId="1" stroke={EMOTION_COLORS.neutral} fill={EMOTION_COLORS.neutral} fillOpacity={0.5} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartShell>
          <ChartShell title="Emotion Trends — Line View">
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" />
                <XAxis dataKey="session" tick={axisStyle} />
                <YAxis tick={axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={legendStyle} />
                <Line name="line-happy" type="monotone" dataKey="happy" stroke={EMOTION_COLORS.happy} strokeWidth={2} dot={false} />
                <Line name="line-sad" type="monotone" dataKey="sad" stroke={EMOTION_COLORS.sad} strokeWidth={2} dot={false} />
                <Line name="line-angry" type="monotone" dataKey="angry" stroke={EMOTION_COLORS.angry} strokeWidth={2} dot={false} />
                <Line name="line-neutral" type="monotone" dataKey="neutral" stroke={EMOTION_COLORS.neutral} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartShell>
        </TabsContent>

        <TabsContent value="intensity" className="space-y-6 mt-6">
          <ChartShell title="Average Emotion Intensity — Radar">
            <ResponsiveContainer width="100%" height={400}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="emotion" tick={axisStyle} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={axisStyle} />
                <Radar name="Intensity" dataKey="value" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.3} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={legendStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartShell>
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(emotionIntensity).map(([emotion, total]) => (
              <div key={emotion} className="border-l-2 pl-4 py-1" style={{ borderColor: EMOTION_COLORS[emotion as Emotion] }}>
                <p className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1" style={{ fontFamily: sans }}>
                  {emotion}
                </p>
                <div className="text-2xl font-bold leading-none" style={{ fontFamily: serif, color: EMOTION_COLORS[emotion as Emotion] }}>
                  {intensityCount > 0 ? ((total / intensityCount) * 100).toFixed(1) : "0"}%
                </div>
                <p className="text-[10px] text-muted-foreground" style={{ fontFamily: sans }}>Average intensity</p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="comparison" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartShell title="Positive vs Negative vs Neutral">
              {(() => {
                const positive = emotionCounts.happy + emotionCounts.surprised;
                const negative = emotionCounts.sad + emotionCounts.angry + emotionCounts.fearful;
                const neutral = emotionCounts.neutral;
                const total = positive + negative + neutral;
                const comparisonData = [
                  { name: "Positive", value: positive, color: "#2e7d52" },
                  { name: "Negative", value: negative, color: "#b8312f" },
                  { name: "Neutral", value: neutral, color: "#786c5c" },
                ];
                return (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={comparisonData} cx="50%" cy="50%" labelLine={false}
                        label={({ name, value }) => total > 0 ? `${name}: ${((value / total) * 100).toFixed(0)}%` : `${name}: 0%`}
                        outerRadius={100} dataKey="value">
                        {comparisonData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                );
              })()}
            </ChartShell>
            <div>
              <p className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>
                Emotion Frequency
              </p>
              <div className="border p-5 space-y-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                {Object.entries(emotionCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([emotion, count]) => {
                    const pct = totalSessions > 0 ? (count / totalSessions) * 100 : 0;
                    return (
                      <div key={emotion}>
                        <div className="flex justify-between mb-1.5">
                          <span
                            className="text-[10px] uppercase tracking-wide capitalize flex items-center gap-2"
                            style={{ fontFamily: sans, color: EMOTION_COLORS[emotion as Emotion] }}
                          >
                            {emotion}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                            {count} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="w-full h-1" style={{ backgroundColor: "var(--muted)" }}>
                          <div
                            className="h-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: EMOTION_COLORS[emotion as Emotion] }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
