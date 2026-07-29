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
import { TrendingUp, Calendar, BarChart3, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { getSessions, type Emotion } from "../utils/emotionEngine";

const EMOTION_COLORS: { [key in Emotion]: string } = {
  happy: "#f59e0b",
  sad: "#3b82f6",
  angry: "#ef4444",
  neutral: "#6b7280",
  fearful: "#a855f7",
  surprised: "#f97316",
};

type TimeRange = "week" | "month" | "quarter" | "year";

export function Analytics() {
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const sessions = getSessions();

  // Filter sessions by time range
  const filterByTimeRange = (range: TimeRange) => {
    const now = new Date();
    const filtered = sessions.filter((session) => {
      const sessionDate = new Date(session.timestamp);
      const daysAgo = {
        week: 7,
        month: 30,
        quarter: 90,
        year: 365,
      }[range];
      const cutoff = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      return sessionDate >= cutoff;
    });
    return filtered;
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

  const dailyChartData = Object.values(dailyBreakdown).slice(-14); // Last 14 days

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
      data[emotion] = (value * 100).toFixed(1);
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

  return (
    <div className="p-8 bg-background min-h-full">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl mb-2">Emotion Analytics</h1>
          <p className="text-gray-600 dark:text-gray-400">
            In-depth analysis of your emotional patterns and trends
          </p>
        </div>
        <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Last Week</SelectItem>
            <SelectItem value="month">Last Month</SelectItem>
            <SelectItem value="quarter">Last Quarter</SelectItem>
            <SelectItem value="year">Last Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Total Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{totalSessions}</div>
            <p className="text-xs text-gray-500 mt-1">
              In the selected period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Dominant Emotion</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl capitalize"
              style={{
                color: dominantEmotion
                  ? EMOTION_COLORS[dominantEmotion[0] as Emotion]
                  : undefined,
              }}
            >
              {dominantEmotion ? dominantEmotion[0] : "N/A"}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {dominantEmotion ? `${dominantEmotion[1]} occurrences` : "No data"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Avg Confidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{(avgConfidence * 100).toFixed(1)}%</div>
            <p className="text-xs text-gray-500 mt-1">Model accuracy</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Total Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{Math.round(totalDuration / 60)}m</div>
            <p className="text-xs text-gray-500 mt-1">Minutes analyzed</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="intensity">Intensity</TabsTrigger>
          <TabsTrigger value="comparison">Comparison</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Emotion Count Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Emotion Count by Type</CardTitle>
                <CardDescription>
                  Total occurrences of each emotion in the period
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart id="chart-emotion-count" data={barChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="emotion" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                      {barChartData.map((entry, index) => (
                        <Cell key={`bar-cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Emotion Distribution Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Emotion Distribution</CardTitle>
                <CardDescription>
                  Percentage breakdown of emotions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart id="chart-emotion-dist">
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name}: ${(percent * 100).toFixed(0)}%`
                      }
                      outerRadius={120}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`pie-cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Daily Breakdown Stacked Bar */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Emotion Breakdown</CardTitle>
              <CardDescription>
                Emotion occurrences by day
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart id="chart-daily-breakdown" data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar name="daily-happy" dataKey="happy" stackId="a" fill={EMOTION_COLORS.happy} />
                  <Bar name="daily-sad" dataKey="sad" stackId="a" fill={EMOTION_COLORS.sad} />
                  <Bar name="daily-angry" dataKey="angry" stackId="a" fill={EMOTION_COLORS.angry} />
                  <Bar name="daily-neutral" dataKey="neutral" stackId="a" fill={EMOTION_COLORS.neutral} />
                  <Bar name="daily-fearful" dataKey="fearful" stackId="a" fill={EMOTION_COLORS.fearful} />
                  <Bar name="daily-surprised" dataKey="surprised" stackId="a" fill={EMOTION_COLORS.surprised} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Emotion Timeline</CardTitle>
              <CardDescription>
                How your emotions have changed over sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart id="chart-timeline" data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="session" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area
                    name="area-happy"
                    type="monotone"
                    dataKey="happy"
                    stackId="1"
                    stroke={EMOTION_COLORS.happy}
                    fill={EMOTION_COLORS.happy}
                    fillOpacity={0.6}
                  />
                  <Area
                    name="area-sad"
                    type="monotone"
                    dataKey="sad"
                    stackId="1"
                    stroke={EMOTION_COLORS.sad}
                    fill={EMOTION_COLORS.sad}
                    fillOpacity={0.6}
                  />
                  <Area
                    name="area-angry"
                    type="monotone"
                    dataKey="angry"
                    stackId="1"
                    stroke={EMOTION_COLORS.angry}
                    fill={EMOTION_COLORS.angry}
                    fillOpacity={0.6}
                  />
                  <Area
                    name="area-neutral"
                    type="monotone"
                    dataKey="neutral"
                    stackId="1"
                    stroke={EMOTION_COLORS.neutral}
                    fill={EMOTION_COLORS.neutral}
                    fillOpacity={0.6}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Emotion Trends (Line View)</CardTitle>
              <CardDescription>
                Individual emotion trends over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart id="chart-trends-line" data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="session" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    name="line-happy"
                    type="monotone"
                    dataKey="happy"
                    stroke={EMOTION_COLORS.happy}
                    strokeWidth={3}
                  />
                  <Line
                    name="line-sad"
                    type="monotone"
                    dataKey="sad"
                    stroke={EMOTION_COLORS.sad}
                    strokeWidth={3}
                  />
                  <Line
                    name="line-angry"
                    type="monotone"
                    dataKey="angry"
                    stroke={EMOTION_COLORS.angry}
                    strokeWidth={3}
                  />
                  <Line
                    name="line-neutral"
                    type="monotone"
                    dataKey="neutral"
                    stroke={EMOTION_COLORS.neutral}
                    strokeWidth={3}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Intensity Tab */}
        <TabsContent value="intensity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Average Emotion Intensity</CardTitle>
              <CardDescription>
                Average strength of each emotion across all sessions
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <ResponsiveContainer width="100%" height={450}>
                <RadarChart id="chart-radar-intensity" data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="emotion" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} />
                  <Radar
                    name="Intensity"
                    dataKey="value"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.6}
                  />
                  <Tooltip />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-6">
            {Object.entries(emotionIntensity).map(([emotion, total]) => (
              <Card key={emotion}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm capitalize flex items-center gap-2">
                    <div
                      className="size-3 rounded-full"
                      style={{ backgroundColor: EMOTION_COLORS[emotion as Emotion] }}
                    />
                    {emotion}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl">
                    {intensityCount > 0
                      ? ((total / intensityCount) * 100).toFixed(1)
                      : "0"}
                    %
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Average intensity</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Comparison Tab */}
        <TabsContent value="comparison" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Positive vs Negative</CardTitle>
                <CardDescription>
                  Balance of positive and negative emotions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const positive = emotionCounts.happy + emotionCounts.surprised;
                  const negative =
                    emotionCounts.sad + emotionCounts.angry + emotionCounts.fearful;
                  const neutral = emotionCounts.neutral;
                  const total = positive + negative + neutral;

                  const comparisonData = [
                    { name: "Positive", value: positive, color: "#10b981" },
                    { name: "Negative", value: negative, color: "#ef4444" },
                    { name: "Neutral", value: neutral, color: "#6b7280" },
                  ];

                  return (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart id="chart-pos-neg-pie">
                        <Pie
                          data={comparisonData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, value }) =>
                            total > 0
                              ? `${name}: ${((value / total) * 100).toFixed(0)}%`
                              : `${name}: 0%`
                          }
                          outerRadius={100}
                          dataKey="value"
                        >
                          {comparisonData.map((entry, index) => (
                            <Cell key={`comparison-cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Emotion Frequency</CardTitle>
                <CardDescription>
                  How often each emotion appears
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(emotionCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([emotion, count]) => {
                      const percentage =
                        totalSessions > 0 ? (count / totalSessions) * 100 : 0;
                      return (
                        <div key={emotion}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="capitalize flex items-center gap-2">
                              <div
                                className="size-3 rounded-full"
                                style={{
                                  backgroundColor: EMOTION_COLORS[emotion as Emotion],
                                }}
                              />
                              {emotion}
                            </span>
                            <span className="font-semibold">
                              {count} ({percentage.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: EMOTION_COLORS[emotion as Emotion],
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
