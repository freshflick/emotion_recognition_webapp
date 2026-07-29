import { useState } from "react";
import { Download, FileText } from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { getSessions, type Emotion } from "../utils/emotionEngine";
import { toast } from "sonner";

const EMOTION_COLORS: { [key in Emotion]: string } = {
  happy: "#c07c20", sad: "#1e5f8a", angry: "#b8312f",
  neutral: "#786c5c", fearful: "#7a3a8a", surprised: "#2e7d52",
};

const serif = "'Playfair Display', Georgia, serif";
const sans = "'IBM Plex Sans', system-ui, sans-serif";
const mono = "'IBM Plex Mono', monospace";

type ReportPeriod = "daily" | "weekly" | "monthly";

export function Reports() {
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>("weekly");
  const [selectedMonth, setSelectedMonth] = useState("2026-04");

  const sessions = getSessions();

  // Filter sessions by period
  const filterSessionsByPeriod = (period: ReportPeriod) => {
    const now = new Date();
    return sessions.filter((session) => {
      const sessionDate = new Date(session.timestamp);
      if (period === "daily") return sessionDate.toDateString() === now.toDateString();
      if (period === "weekly") return sessionDate >= new Date(now.getTime() - 7 * 86400000);
      return sessionDate >= new Date(now.getTime() - 30 * 86400000);
    });
  };

  const filteredSessions = filterSessionsByPeriod(selectedPeriod);

  // Calculate statistics
  const totalSessions = filteredSessions.length;
  const totalDuration = filteredSessions.reduce((sum, s) => sum + s.duration, 0);
  const avgConfidence = totalSessions > 0
    ? filteredSessions.reduce((sum, s) => sum + s.summary.averageConfidence, 0) / totalSessions
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
    value: count,
    color: EMOTION_COLORS[emotion as Emotion],
  }));

  const dailyData: { [date: string]: { sessions: number; avgConfidence: number } } = {};
  filteredSessions.forEach((session) => {
    const date = new Date(session.timestamp).toLocaleDateString();
    if (!dailyData[date]) dailyData[date] = { sessions: 0, avgConfidence: 0 };
    dailyData[date].sessions++;
    dailyData[date].avgConfidence += session.summary.averageConfidence;
  });

  const dailyChartData = Object.entries(dailyData).map(([date, data]) => ({
    date: date.split("/").slice(0, 2).join("/"),
    sessions: data.sessions,
    confidence: ((data.avgConfidence / data.sessions) * 100).toFixed(1),
  }));

  // Generate PDF Report
  const generatePDFReport = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.text("Emotion Monitoring Report", 20, 20);
    
    // Period
    doc.setFontSize(12);
    doc.text(`Period: ${selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1)}`, 20, 30);
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
        ["Most Common Emotion", Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A"],
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
        body: filteredSessions.slice(0, 10).map((s) => [
          new Date(s.timestamp).toLocaleString(), s.type, `${s.duration}s`,
          s.summary.dominantEmotion, `${(s.summary.averageConfidence * 100).toFixed(1)}%`,
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
    filteredSessions.forEach((s) => {
      csv += `${s.id},${new Date(s.timestamp).toISOString()},${s.type},${s.duration},${s.summary.dominantEmotion},${s.summary.averageConfidence}\n`;
    });
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `emotion-data-${selectedPeriod}-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const tooltipStyle = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 0,
    boxShadow: "none", color: "var(--card-foreground)", fontSize: 11, fontFamily: sans,
  };
  const axisStyle = { fontSize: 10, fill: "var(--muted-foreground)", fontFamily: sans };

  return (
    <div className="p-8 bg-background min-h-full">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="border-b mb-8 pb-6" style={{ borderColor: "var(--border)" }}>
          <p className="text-[9px] tracking-[0.22em] uppercase text-muted-foreground mb-2" style={{ fontFamily: sans }}>
            — Reports & Analytics / Published on Demand
          </p>
          <div className="flex items-end justify-between gap-4">
            <h1
              className="font-bold text-foreground leading-tight"
              style={{ fontFamily: serif, fontSize: "clamp(1.75rem, 3vw, 2.5rem)", letterSpacing: "-0.02em" }}
            >
              Emotion <em style={{ fontStyle: "italic", color: "var(--primary)" }}>Reports</em>
            </h1>
            <div className="flex gap-2">
              <Button
                onClick={generatePDFReport}
                disabled={totalSessions === 0}
                className="text-[9px] tracking-[0.12em] uppercase gap-2"
                style={{
                  fontFamily: sans, borderRadius: 0, height: "auto", padding: "8px 16px",
                  backgroundColor: "var(--foreground)", color: "var(--background)",
                }}
              >
                <Download style={{ width: 12, height: 12 }} />
                Download PDF
              </Button>
              <Button
                variant="outline"
                onClick={generateCSVReport}
                disabled={totalSessions === 0}
                className="text-[9px] tracking-[0.12em] uppercase gap-2"
                style={{ fontFamily: sans, borderRadius: 0, height: "auto", padding: "8px 16px", borderColor: "var(--border)" }}
              >
                <Download style={{ width: 12, height: 12 }} />
                Export CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Period tabs */}
        <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as ReportPeriod)}>
          <div className="border-b mb-8" style={{ borderColor: "var(--border)" }}>
            <TabsList className="bg-transparent h-auto p-0 gap-0">
              {["daily", "weekly", "monthly"].map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent px-5 pb-3 pt-0 text-[9px] tracking-[0.18em] uppercase capitalize"
                  style={{ fontFamily: sans }}
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value={selectedPeriod}>
            {totalSessions === 0 ? (
              <div className="border py-20 text-center" style={{ borderColor: "var(--border)" }}>
                <FileText className="mx-auto mb-4 text-muted-foreground/20" style={{ width: 40, height: 40 }} />
                <h3 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: serif }}>
                  No data for this period.
                </h3>
                <p className="text-xs text-muted-foreground" style={{ fontFamily: sans, fontWeight: 300 }}>
                  Start a recording session to generate reports.
                </p>
              </div>
            ) : (
              <>
                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                  {[
                    { label: "Total Sessions", value: totalSessions, sub: `Past ${selectedPeriod === "daily" ? "day" : selectedPeriod === "weekly" ? "week" : "month"}` },
                    { label: "Total Duration", value: `${Math.round(totalDuration / 60)}m`, sub: "Minutes analyzed" },
                    { label: "Avg Confidence", value: `${(avgConfidence * 100).toFixed(1)}%`, sub: "Model accuracy" },
                  ].map(({ label, value, sub }) => (
                    <div key={label} className="border-l-2 pl-4 py-1" style={{ borderColor: "var(--border)" }}>
                      <p className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1" style={{ fontFamily: sans }}>{label}</p>
                      <div className="text-3xl font-bold leading-none mb-1" style={{ fontFamily: serif, letterSpacing: "-0.02em" }}>{value}</div>
                      <p className="text-[10px] text-muted-foreground" style={{ fontFamily: sans }}>{sub}</p>
                    </div>
                  ))}
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div>
                    <p className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>
                      Emotion Distribution
                    </p>
                    <div className="border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" labelLine={false}
                            label={({ name, value }) => totalSessions > 0 ? `${name}: ${value}` : ""}
                            outerRadius={95} dataKey="value">
                            {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>
                      Daily Breakdown
                    </p>
                    <div className="border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={dailyChartData}>
                          <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" />
                          <XAxis dataKey="date" tick={axisStyle} />
                          <YAxis tick={axisStyle} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Legend wrapperStyle={{ fontSize: 10, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em" }} />
                          <Bar dataKey="sessions" fill="var(--primary)" name="Sessions" radius={0} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Session table */}
                <div>
                  <p className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-3" style={{ fontFamily: sans }}>
                    Session History
                  </p>
                  <div className="border" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                            {["Date & Time", "Type", "Duration", "Dominant Emotion", "Confidence"].map((h) => (
                              <th
                                key={h}
                                className="text-left py-3 px-4 text-[9px] tracking-[0.16em] uppercase text-muted-foreground font-normal"
                                style={{ fontFamily: sans }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSessions.slice(0, 20).map((session) => (
                            <tr
                              key={session.id}
                              className="border-b transition-colors"
                              style={{ borderColor: "var(--border)" }}
                            >
                              <td className="py-3 px-4 text-xs text-muted-foreground" style={{ fontFamily: mono }}>
                                {new Date(session.timestamp).toLocaleString()}
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-[9px] tracking-widest uppercase px-1.5 py-0.5" style={{ backgroundColor: "var(--muted)", fontFamily: sans }}>
                                  {session.type}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-xs tabular-nums text-muted-foreground" style={{ fontFamily: mono }}>
                                {session.duration}s
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-xs font-bold capitalize" style={{ fontFamily: serif, color: EMOTION_COLORS[session.summary.dominantEmotion] }}>
                                  {session.summary.dominantEmotion}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-xs tabular-nums text-muted-foreground" style={{ fontFamily: mono }}>
                                {(session.summary.averageConfidence * 100).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
