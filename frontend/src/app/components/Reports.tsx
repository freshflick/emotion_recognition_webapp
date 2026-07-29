import { useState } from "react";
import { Download, Calendar, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { getSessions, type Emotion } from "../utils/emotionEngine";
import { toast } from "sonner";

const EMOTION_COLORS: { [key in Emotion]: string } = {
  happy: "#f59e0b",
  sad: "#3b82f6",
  angry: "#ef4444",
  neutral: "#6b7280",
  fearful: "#a855f7",
  surprised: "#f97316",
};

type ReportPeriod = "daily" | "weekly" | "monthly";

export function Reports() {
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>("weekly");
  const [selectedMonth, setSelectedMonth] = useState("2026-04");

  const sessions = getSessions();

  // Filter sessions by period
  const filterSessionsByPeriod = (period: ReportPeriod) => {
    const now = new Date();
    const filtered = sessions.filter((session) => {
      const sessionDate = new Date(session.timestamp);
      
      if (period === "daily") {
        return (
          sessionDate.toDateString() === now.toDateString()
        );
      } else if (period === "weekly") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return sessionDate >= weekAgo;
      } else {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return sessionDate >= monthAgo;
      }
    });
    
    return filtered;
  };

  const filteredSessions = filterSessionsByPeriod(selectedPeriod);

  // Calculate statistics
  const totalSessions = filteredSessions.length;
  const totalDuration = filteredSessions.reduce((sum, s) => sum + s.duration, 0);
  const avgConfidence =
    totalSessions > 0
      ? filteredSessions.reduce((sum, s) => sum + s.summary.averageConfidence, 0) /
        totalSessions
      : 0;

  // Emotion distribution
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

  const pieData = Object.entries(emotionCounts).map(([emotion, count]) => ({
    name: emotion.charAt(0).toUpperCase() + emotion.slice(1),
    rp_value: count,
    color: EMOTION_COLORS[emotion as Emotion],
  }));

  // Daily breakdown for the period
  const dailyData: { [date: string]: { rp_sessions: number; avgConfidence: number } } = {};

  filteredSessions.forEach((session) => {
    const date = new Date(session.timestamp).toLocaleDateString();
    if (!dailyData[date]) {
      dailyData[date] = { rp_sessions: 0, avgConfidence: 0 };
    }
    dailyData[date].rp_sessions++;
    dailyData[date].avgConfidence += session.summary.averageConfidence;
  });

  const dailyChartData = Object.entries(dailyData).map(([date, data]) => ({
    date: date.split("/").slice(0, 2).join("/"),
    rp_sessions: data.rp_sessions,
    confidence: ((data.avgConfidence / data.rp_sessions) * 100).toFixed(1),
  }));

  // Generate PDF Report
  const generatePDFReport = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.text("Emotion Monitoring Report", 20, 20);
    
    // Period
    doc.setFontSize(12);
    doc.text(
      `Period: ${selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1)}`,
      20,
      30
    );
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 37);
    
    // Summary Statistics
    doc.setFontSize(16);
    doc.text("Summary Statistics", 20, 50);
    
    autoTable(doc, {
      startY: 55,
      head: [["Metric", "Value"]],
      body: [
        ["Total Sessions", totalSessions.toString()],
        ["Total Duration", `${Math.round(totalDuration / 60)} minutes`],
        ["Average Confidence", `${(avgConfidence * 100).toFixed(1)}%`],
        [
          "Most Common Emotion",
          Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A",
        ],
      ],
    });
    
    // Emotion Distribution
    doc.setFontSize(16);
    const finalY = (doc as any).lastAutoTable.finalY || 100;
    doc.text("Emotion Distribution", 20, finalY + 15);
    
    autoTable(doc, {
      startY: finalY + 20,
      head: [["Emotion", "Count", "Percentage"]],
      body: Object.entries(emotionCounts).map(([emotion, count]) => [
        emotion.charAt(0).toUpperCase() + emotion.slice(1),
        count.toString(),
        totalSessions > 0 ? `${((count / totalSessions) * 100).toFixed(1)}%` : "0%",
      ]),
    });
    
    // Session Details
    if (filteredSessions.length > 0) {
      const sessionFinalY = (doc as any).lastAutoTable.finalY || 150;
      doc.setFontSize(16);
      doc.text("Recent Sessions", 20, sessionFinalY + 15);
      
      autoTable(doc, {
        startY: sessionFinalY + 20,
        head: [["Date", "Type", "Duration", "Dominant Emotion", "Confidence"]],
        body: filteredSessions.slice(0, 10).map((session) => [
          new Date(session.timestamp).toLocaleString(),
          session.type,
          `${session.duration}s`,
          session.summary.dominantEmotion,
          `${(session.summary.averageConfidence * 100).toFixed(1)}%`,
        ]),
      });
    }
    
    // Save PDF
    const filename = `emotion-report-${selectedPeriod}-${Date.now()}.pdf`;
    doc.save(filename);
    toast.success("PDF report downloaded successfully");
  };

  // Generate CSV Report
  const generateCSVReport = () => {
    let csv = "Session ID,Timestamp,Type,Duration (s),Dominant Emotion,Confidence\n";
    
    filteredSessions.forEach((session) => {
      csv += `${session.id},${new Date(session.timestamp).toISOString()},${session.type},${
        session.duration
      },${session.summary.dominantEmotion},${session.summary.averageConfidence}\n`;
    });
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `emotion-data-${selectedPeriod}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV report downloaded successfully");
  };

  return (
    <div className="p-8 bg-background min-h-full">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl mb-2">Reports & Analytics</h1>
            <p className="text-gray-600">
              Generate comprehensive emotion analysis reports
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={generatePDFReport} disabled={totalSessions === 0}>
              <Download className="size-4 mr-2" />
              Download PDF
            </Button>
            <Button
              variant="outline"
              onClick={generateCSVReport}
              disabled={totalSessions === 0}
            >
              <Download className="size-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Report Type Tabs */}
        <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as ReportPeriod)}>
          <TabsList className="mb-6">
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>

          <TabsContent value={selectedPeriod}>
            {totalSessions === 0 ? (
              <Card className="p-12 text-center">
                <FileText className="size-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-xl mb-2">No data available</h3>
                <p className="text-gray-600">
                  No sessions found for the selected period. Start recording to generate
                  reports.
                </p>
              </Card>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Total Sessions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl">{totalSessions}</div>
                      <p className="text-xs text-gray-500 mt-1">
                        In the past {selectedPeriod === "daily" ? "day" : selectedPeriod === "weekly" ? "week" : "month"}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Total Duration</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl">{Math.round(totalDuration / 60)}m</div>
                      <p className="text-xs text-gray-500 mt-1">Minutes of audio analyzed</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Avg Confidence</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl">{(avgConfidence * 100).toFixed(1)}%</div>
                      <p className="text-xs text-gray-500 mt-1">Model prediction accuracy</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* Emotion Distribution — CSS bars */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Emotion Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 pt-1">
                        {pieData
                          .sort((a, b) => b.rp_value - a.rp_value)
                          .map((entry) => {
                            const pct = totalSessions > 0 ? (entry.rp_value / totalSessions) * 100 : 0;
                            return (
                              <div key={entry.name}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="flex items-center gap-2 capitalize text-foreground/80">
                                    <span className="size-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: entry.color }} />
                                    {entry.name}
                                  </span>
                                  <span className="text-muted-foreground tabular-nums">
                                    {entry.rp_value} ({pct.toFixed(0)}%)
                                  </span>
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${pct}%`, backgroundColor: entry.color }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Daily Breakdown — CSS bars */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Daily Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dailyChartData.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">No daily data</p>
                      ) : (
                        <div className="space-y-3 pt-1">
                          {(() => {
                            const max = Math.max(...dailyChartData.map((d) => d.rp_sessions), 1);
                            return dailyChartData.map((d) => (
                              <div key={d.date}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="text-foreground/80">{d.date}</span>
                                  <span className="text-muted-foreground tabular-nums">{d.rp_sessions} sessions</span>
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-primary transition-all duration-500"
                                    style={{ width: `${(d.rp_sessions / max) * 100}%` }}
                                  />
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Session List */}
                <Card>
                  <CardHeader>
                    <CardTitle>Session History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-4">Date & Time</th>
                            <th className="text-left py-3 px-4">Type</th>
                            <th className="text-left py-3 px-4">Duration</th>
                            <th className="text-left py-3 px-4">Dominant Emotion</th>
                            <th className="text-left py-3 px-4">Confidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSessions.slice(0, 20).map((session) => (
                            <tr key={session.id} className="border-b hover:bg-gray-50">
                              <td className="py-3 px-4">
                                {new Date(session.timestamp).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 capitalize">{session.type}</td>
                              <td className="py-3 px-4">{session.duration}s</td>
                              <td className="py-3 px-4">
                                <span
                                  className="capitalize font-semibold"
                                  style={{
                                    color:
                                      EMOTION_COLORS[session.summary.dominantEmotion],
                                  }}
                                >
                                  {session.summary.dominantEmotion}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                {(session.summary.averageConfidence * 100).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
