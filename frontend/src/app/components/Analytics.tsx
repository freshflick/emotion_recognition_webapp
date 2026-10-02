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
import { useSessionStore, type Emotion } from "../utils/emotionEngine";
import { useSessions } from "../contexts/SessionsContext";
import { Loader2 } from "lucide-react";

const EMOTION_COLORS: { [key in Emotion]: string } = {
  happy: "#b58b4a",
  sad: "#7097a1",
  angry: "#a86f70",
  neutral: "#887b9c",
};

const EMOTION_CARD_BACKGROUNDS: { [key in Emotion]: string } = {
  happy: "#e8d9b8",
  sad: "#d2e0e1",
  angry: "#e3cecf",
  neutral: "#ddd7e4",
};

const serif = "'Playfair Display', Georgia, serif";
const sans = "'IBM Plex Sans', system-ui, sans-serif";
const mono = "'IBM Plex Mono', monospace";

type TimeRange = "week" | "month" | "quarter" | "year";

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
      <div>
        <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-3 font-normal" style={{ fontFamily: sans }}>
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
  const sessions = useSessionStore();
  const { isLoadingSessions, sessionsError } = useSessions();

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
  };

  filteredSessions.forEach((s) => {
    emotionCounts[s.summary.dominantEmotion]++;
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
    value: intensityCount > 0 ? Number(((total / intensityCount) * 100).toFixed(1)) : 0,
  }));

  // Emotion timeline (area & line chart data)
  const timelineData = filteredSessions.slice(-20).map((session, index) => {
    const data: Record<string, any> = {
      session: `S${index + 1}`,
      time: new Date(session.timestamp).toLocaleDateString(),
    };
    Object.entries(session.summary.emotionDistribution).forEach(([emotion, value]) => {
      data[emotion] = Number((value * 100).toFixed(1));
    });
    return data;
  });

  // Statistics
  const totalSessions = filteredSessions.length;
  const dominantEmotion = totalSessions > 0
      ? Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]
      : undefined;
  const avgConfidence =
      totalSessions > 0
          ? filteredSessions.reduce((sum, s) => sum + s.summary.averageConfidence, 0) /
          totalSessions
          : 0;
  const totalDuration = filteredSessions.reduce((sum, s) => sum + s.duration, 0);
  const dominantShare = totalSessions > 0 && dominantEmotion
      ? (dominantEmotion[1] / totalSessions) * 100
      : 0;
  const rankedEmotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]);

  const tooltipStyle = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 0,
    boxShadow: "none", color: "var(--card-foreground)", fontSize: 11, fontFamily: sans,
  };
  const axisStyle = { fontSize: 11, fill: "var(--muted-foreground)", fontFamily: sans };
  const legendStyle = { fontSize: 11, fontFamily: sans, textTransform: "uppercase" as const, letterSpacing: "0.08em" };

  return (
      <div className="page-shell">
        <div className="page-container">

        {/* Analytics masthead */}
         <div className="border-b pb-6 mb-8" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-[11px] tracking-[0.24em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>Signal report / selected period</p>
              <h1 className="font-bold text-foreground leading-tight" style={{ fontFamily: serif, fontSize: "clamp(1.75rem, 3vw, 2.5rem)", letterSpacing: "-0.02em" }}>
                Emotion <em style={{ fontStyle: "italic", color: "var(--primary)" }}>Analytics</em>
              </h1>
              <p className="text-sm text-muted-foreground mt-4 max-w-xl" style={{ fontFamily: sans, fontWeight: 300 }}>
                Find the emotional climate across your conversations, then trace how it changes over time.
              </p>
            </div>
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger className="w-40 border text-xs font-semibold uppercase tracking-[0.1em]" style={{ borderColor: "var(--border)", borderRadius: 0, fontFamily: sans }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={{ borderRadius: 0, fontFamily: sans }}>
                <SelectItem value="week">Last week</SelectItem>
                <SelectItem value="month">Last month</SelectItem>
                <SelectItem value="quarter">Last quarter</SelectItem>
                <SelectItem value="year">Last year</SelectItem>
              </SelectContent>
            </Select>
           </div>
         </div>

        {isLoadingSessions && (
           <div className="mb-8 flex items-center gap-3 border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", backgroundColor: "var(--accent)", color: "var(--accent-foreground)", fontFamily: sans }}>
             <Loader2 className="size-4 animate-spin" aria-hidden="true" />
             <span>Loading your emotional history...</span>
           </div>
        )}

        {sessionsError && !isLoadingSessions && (
          <div className="mb-8 border px-4 py-3 text-sm" style={{ borderColor: "var(--destructive)", backgroundColor: "color-mix(in srgb, var(--destructive) 12%, var(--background))", color: "var(--foreground)", fontFamily: sans }}>
            Analytics could not load saved sessions: {sessionsError}
          </div>
        )}

        {/* High-signal summary */}
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-6 mb-10">
           <div className="border p-6 sm:p-8" style={{ borderColor: "var(--border)", backgroundColor: dominantEmotion ? EMOTION_CARD_BACKGROUNDS[dominantEmotion[0] as Emotion] : "var(--foreground)", color: dominantEmotion ? "#24180c" : "var(--background)" }}>
            <p className="text-[11px] uppercase tracking-[0.22em] opacity-60" style={{ fontFamily: sans }}>Dominant signal</p>
            <div className="mt-10 flex items-end justify-between gap-4">
              <div>
                 <p className="text-4xl sm:text-5xl font-bold capitalize leading-none" style={{ fontFamily: serif, color: dominantEmotion ? "#24180c" : "var(--background)" }}>
                  {dominantEmotion ? dominantEmotion[0] : "No data"}
                </p>
                <p className="text-xs opacity-60 mt-3" style={{ fontFamily: sans }}>
                  {dominantEmotion ? `${dominantEmotion[1]} of ${totalSessions} sessions` : "Record a session to create a profile"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold" style={{ fontFamily: mono }}>{dominantShare.toFixed(0)}%</p>
                <p className="text-[10px] uppercase tracking-[0.16em] opacity-60 mt-1" style={{ fontFamily: sans }}>of period</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px border" style={{ borderColor: "var(--border)", backgroundColor: "var(--border)" }}>
            {[
              ["Sessions", totalSessions, "In selected period"],
              ["Listening time", `${Math.round(totalDuration / 60)}m`, "Minutes analyzed"],
              ["Confidence", `${(avgConfidence * 100).toFixed(1)}%`, "Average model confidence"],
              ["Emotions tracked", intensityCount, "Analyzed data points"],
            ].map(([label, value, sub], index) => (
                 <div key={label} className="p-5 sm:p-6" style={{ backgroundColor: EMOTION_CARD_BACKGROUNDS[(["happy", "sad", "angry", "neutral"] as Emotion[])[index % 4]], color: "#24180c" }}>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ fontFamily: sans }}>{label}</p>
                  <p className="text-2xl font-bold mt-3" style={{ fontFamily: serif }}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-1" style={{ fontFamily: sans }}>{sub}</p>
                </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.8fr] gap-6 mb-10">
          <div className="border p-5 sm:p-6" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
            <div className="flex items-end justify-between mb-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground" style={{ fontFamily: sans }}>Period composition</p>
                <p className="text-sm text-muted-foreground mt-1" style={{ fontFamily: sans }}>Share of dominant session signals</p>
              </div>
              <span className="text-xs text-muted-foreground" style={{ fontFamily: mono }}>{totalSessions} total</span>
            </div>
            <div className="space-y-4">
              {rankedEmotions.map(([emotion, count]) => {
                const share = totalSessions ? (count / totalSessions) * 100 : 0;
                return (
                    <div key={emotion}>
                      <div className="flex justify-between mb-1.5 text-xs capitalize" style={{ fontFamily: sans }}>
                        <span>{emotion}</span><span className="text-muted-foreground" style={{ fontFamily: mono }}>{share.toFixed(0)}%</span>
                      </div>
                      <div className="h-2" style={{ backgroundColor: "var(--muted)" }}><div className="h-full transition-all" style={{ width: `${share}%`, backgroundColor: EMOTION_COLORS[emotion as Emotion] }} /></div>
                    </div>
                );
              })}
            </div>
          </div>
          <div className="border p-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieChartData} cx="50%" cy="47%" innerRadius={58} outerRadius={86} paddingAngle={3} dataKey="value">
                  {pieChartData.map((entry, index) => <Cell key={`summary-pie-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 10, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.06em" }} />
              </PieChart>
            </ResponsiveContainer>
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
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent px-4 pb-3 pt-0 text-[11px] tracking-[0.14em] uppercase font-normal"
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
                  <BarChart data={barChartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="2 2" stroke="var(--border)" />
                    <XAxis dataKey="emotion" tick={axisStyle} />
                    <YAxis allowDecimals={false} tick={axisStyle} />
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
                  <PieChart margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
                    <Pie data={pieChartData} cx="50%" cy="46%" innerRadius={68} outerRadius={105} paddingAngle={2} dataKey="value">
                      {pieChartData.map((entry, index) => (
                          <Cell key={`pie-cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        wrapperStyle={{ fontSize: 10, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartShell>
            </div>
            <ChartShell title="Daily Emotion Breakdown">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyChartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="2 2" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={axisStyle} />
                  <YAxis allowDecimals={false} tick={axisStyle} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend verticalAlign="bottom" wrapperStyle={legendStyle} />
                  <Bar name="happy" dataKey="happy" stackId="a" fill={EMOTION_COLORS.happy} />
                  <Bar name="sad" dataKey="sad" stackId="a" fill={EMOTION_COLORS.sad} />
                  <Bar name="angry" dataKey="angry" stackId="a" fill={EMOTION_COLORS.angry} />
                  <Bar name="neutral" dataKey="neutral" stackId="a" fill={EMOTION_COLORS.neutral} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          </TabsContent>

          <TabsContent value="trends" className="space-y-6 mt-6">
            <ChartShell title="Emotion Timeline — Area View">
              <ResponsiveContainer width="100%" height={360}>
                <AreaChart data={timelineData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="2 2" stroke="var(--border)" />
                  <XAxis dataKey="session" tick={axisStyle} />
                  <YAxis domain={[0, 100]} tick={axisStyle} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend verticalAlign="bottom" wrapperStyle={legendStyle} />
                  <Area name="happy" type="monotone" dataKey="happy" stackId="1" stroke={EMOTION_COLORS.happy} fill={EMOTION_COLORS.happy} fillOpacity={0.5} />
                  <Area name="sad" type="monotone" dataKey="sad" stackId="1" stroke={EMOTION_COLORS.sad} fill={EMOTION_COLORS.sad} fillOpacity={0.5} />
                  <Area name="angry" type="monotone" dataKey="angry" stackId="1" stroke={EMOTION_COLORS.angry} fill={EMOTION_COLORS.angry} fillOpacity={0.5} />
                  <Area name="neutral" type="monotone" dataKey="neutral" stackId="1" stroke={EMOTION_COLORS.neutral} fill={EMOTION_COLORS.neutral} fillOpacity={0.5} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartShell>
            <ChartShell title="Emotion Trends — Line View">
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={timelineData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="2 2" stroke="var(--border)" />
                  <XAxis dataKey="session" tick={axisStyle} />
                  <YAxis domain={[0, 100]} tick={axisStyle} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend verticalAlign="bottom" wrapperStyle={legendStyle} />
                  <Line name="happy" type="monotone" dataKey="happy" stroke={EMOTION_COLORS.happy} strokeWidth={1.5} dot={false} />
                  <Line name="sad" type="monotone" dataKey="sad" stroke={EMOTION_COLORS.sad} strokeWidth={1.5} dot={false} />
                  <Line name="angry" type="monotone" dataKey="angry" stroke={EMOTION_COLORS.angry} strokeWidth={1.5} dot={false} />
                  <Line name="neutral" type="monotone" dataKey="neutral" stroke={EMOTION_COLORS.neutral} strokeWidth={1.5} dot={false} />
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
                </RadarChart>
              </ResponsiveContainer>
            </ChartShell>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(emotionIntensity).map(([emotion, total]) => (
                  <div key={emotion} className="border-l-2 pl-4 py-1" style={{ borderColor: EMOTION_COLORS[emotion as Emotion] }}>
                    <p className="text-[11px] tracking-[0.18em] uppercase text-muted-foreground font-normal mb-1" style={{ fontFamily: sans }}>
                      {emotion}
                    </p>
                    <div className="text-2xl font-bold leading-none" style={{ fontFamily: serif, color: EMOTION_COLORS[emotion as Emotion] }}>
                      {intensityCount > 0 ? ((total / intensityCount) * 100).toFixed(1) : "0"}%
                    </div>
                    <p className="text-xs text-muted-foreground font-normal" style={{ fontFamily: sans }}>Average intensity</p>
                  </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="comparison" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartShell title="Positive vs Negative vs Neutral">
                {(() => {
                  const positive = emotionCounts.happy;
                  const negative = emotionCounts.sad + emotionCounts.angry;
                  const neutral = emotionCounts.neutral;
                  const total = positive + negative + neutral;
                  const comparisonData = [
                    { name: "Positive", value: positive, color: "#2e7d52" },
                    { name: "Negative", value: negative, color: "#b8312f" },
                    { name: "Neutral", value: neutral, color: "#786c5c" },
                  ];
                  return (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart
                            data={comparisonData}
                            layout="vertical"
                            margin={{ top: 8, right: 24, bottom: 8, left: 12 }}
                        >
                          <CartesianGrid horizontal={false} strokeDasharray="2 2" stroke="var(--border)" />
                          <XAxis type="number" allowDecimals={false} domain={[0, Math.max(total, 1)]} tick={axisStyle} />
                          <YAxis type="category" dataKey="name" width={64} tick={axisStyle} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar dataKey="value" name="Sessions" radius={0}>
                            {comparisonData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                  );
                })()}
              </ChartShell>
              <div>
                <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-normal mb-3" style={{ fontFamily: sans }}>
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
                              className="text-xs uppercase tracking-wide capitalize flex items-center gap-2 font-normal"
                              style={{ fontFamily: sans, color: EMOTION_COLORS[emotion as Emotion] }}
                          >
                            {emotion}
                          </span>
                                <span className="text-xs text-muted-foreground tabular-nums font-normal" style={{ fontFamily: mono }}>
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
      </div>
  );
}
