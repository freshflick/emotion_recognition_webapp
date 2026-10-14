import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Brain, Mic, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { useUser } from "../contexts/UserContext";
import { getTimeBasedGreeting, getSessionQuote } from "../utils/userProfile";
import { useSessionStore } from "../utils/emotionEngine";
import type { Emotion } from "../utils/emotionEngine";
import { LoadingPanel } from "./LoadingPanel";
import { useSessions } from "../contexts/SessionsContext";

type DashboardStats = {
    totalSessions: number;
    totalDuration: number;
    avgConfidence: number;
    pieData: { name: string; value: number; color: string }[];
    timelineData: { name: string; confidence: number }[];
    trendData: Record<string, string | number>[];
};

function statsStorageKey(userId: string) {
    return `emphona_dashboard_stats:${userId}`;
}

function readCachedStats(userId: string): DashboardStats | null {
    try {
        const value = localStorage.getItem(statsStorageKey(userId));
        return value ? JSON.parse(value) as DashboardStats : null;
    } catch {
        return null;
    }
}

function summarizeSessions(sessions: ReturnType<typeof useSessionStore>): DashboardStats {
    const totalSessions = sessions.length;
    const totalDuration = sessions.reduce((sum, session) => sum + session.duration, 0);
    const avgConfidence = totalSessions > 0
        ? sessions.reduce((sum, session) => sum + session.summary.averageConfidence, 0) / totalSessions
        : 0;
    const emotionDistribution: Record<Emotion, number> = { happy: 0, sad: 0, angry: 0, neutral: 0 };
    sessions.forEach((session) => {
        Object.entries(session.summary.emotionDistribution).forEach(([emotion, value]) => {
            emotionDistribution[emotion as Emotion] += value;
        });
    });
    const sessionCount = totalSessions || 1;
    const pieData = Object.entries(emotionDistribution)
        .filter(([, value]) => value > 0)
        .map(([emotion, value]) => ({
            name: emotion.charAt(0).toUpperCase() + emotion.slice(1),
            value: value / sessionCount,
            color: EMOTION_COLORS[emotion as Emotion],
        }));
    const timelineData = sessions.slice(0, 10).reverse().map((session, index) => ({
        name: `S${index + 1}`,
        confidence: parseFloat((session.summary.averageConfidence * 100).toFixed(1)),
    }));
    const trendData = sessions.slice(0, 8).reverse().map((session, index) => {
        const data: Record<string, string | number> = { name: `S${index + 1}` };
        Object.entries(session.summary.emotionDistribution).forEach(([emotion, value]) => {
            data[emotion] = parseFloat((value * 100).toFixed(1));
        });
        return data;
    });

    return { totalSessions, totalDuration, avgConfidence, pieData, timelineData, trendData };
}

const EMOTION_COLORS: { [key in Emotion]: string } = {
    happy: "#c07c20",
    sad: "#1e5f8a",
    angry: "#b8312f",
    neutral: "#786c5c",
};

const serif = "'Playfair Display', Georgia, serif";
const sans = "'IBM Plex Sans', system-ui, sans-serif";

function SectionRule({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 mb-5">
      <span
          className="text-xs tracking-[0.2em] uppercase text-muted-foreground"
          style={{ fontFamily: sans }}
      >
        — {label}
      </span>
            <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
        </div>
    );
}

function StatBlock({
                       label, value, sub,
                   }: { label: string; value: string | number; sub: string }) {
    return (
        <div className="py-1">
            <p className="text-xs tracking-[0.18em] uppercase text-muted-foreground mb-1.5" style={{ fontFamily: sans }}>
                {label}
            </p>
            <div
                className="text-3xl font-bold text-foreground leading-none mb-1.5"
                style={{ fontFamily: serif, letterSpacing: "-0.02em" }}
            >
                {value}
            </div>
            <p className="text-xs text-muted-foreground/75" style={{ fontFamily: sans }}>{sub}</p>
        </div>
    );
}

export function Dashboard() {
    const { user } = useUser();
    const sessions = useSessionStore();
    const { isLoadingSessions, sessionsError } = useSessions();
    const [cachedStats, setCachedStats] = useState<{ userId: string; stats: DashboardStats | null }>(() => ({
        userId: user.id,
        stats: readCachedStats(user.id),
    }));
    const [quote, setQuote] = useState<{ text: string; author: string } | null>(null);
    const [greeting] = useState(getTimeBasedGreeting());

    // getSessionQuote() now hits the backend (/api/quote) the first time it's
    // called each day, so it's async — fetch it in an effect rather than
    // calling it straight in useState, and render nothing in the quote slot
    // until it resolves rather than blocking the rest of the page
    useEffect(() => {
        let cancelled = false;
        getSessionQuote().then((q) => {
            if (!cancelled) setQuote(q);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        setCachedStats({ userId: user.id, stats: readCachedStats(user.id) });
    }, [user.id]);

    const liveStats = useMemo(() => summarizeSessions(sessions), [sessions]);
    useEffect(() => {
        if (isLoadingSessions) return;
        try {
            localStorage.setItem(statsStorageKey(user.id), JSON.stringify(liveStats));
            setCachedStats({ userId: user.id, stats: liveStats });
        } catch {
            // Dashboard remains usable if browser storage is unavailable/full.
        }
    }, [isLoadingSessions, liveStats, user.id]);

    // Keep a small, account-scoped summary on this device. It contains only
    // aggregate counts and chart points, so the dashboard can paint at once
    // while the full report history is refreshed in the background.
    const stats = sessions.length > 0 || !isLoadingSessions
        ? liveStats
        : cachedStats.userId === user.id ? cachedStats.stats : null;

    const tooltipStyle = {
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 0,
        boxShadow: "none",
        color: "var(--card-foreground)",
        fontSize: 12,
        fontFamily: sans,
    };

    const axisStyle = { fontSize: 11, fill: "var(--muted-foreground)", fontFamily: sans };

    return (
        <div className="page-shell">
          <div className="page-container">

            {/* Editorial hero */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-6 mb-10">
                <div className="relative overflow-hidden border p-7 sm:p-10" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                    <div className="absolute -right-10 -top-16 text-[13rem] leading-none font-bold select-none pointer-events-none" style={{ color: "var(--accent)", fontFamily: serif, opacity: 0.65 }}>∿</div>
                    <p className="text-[11px] tracking-[0.24em] uppercase text-muted-foreground mb-5" style={{ fontFamily: sans }}>Emotion monitor / overview</p>
                    <h1 className="relative max-w-full font-bold text-foreground leading-[0.98] break-all sm:break-words" style={{ fontFamily: serif, fontSize: "clamp(2rem, 4.2vw, 3.25rem)", letterSpacing: "-0.045em", overflowWrap: "anywhere" }}>
                        {greeting},<br />
                        <em style={{ color: "var(--primary)", fontStyle: "italic" }}>{user.name}.</em>
                    </h1>
                    <p className="relative text-sm text-muted-foreground max-w-lg mt-6" style={{ fontFamily: sans, fontWeight: 300, lineHeight: 1.7 }}>
                        A quiet workspace for listening closely: live conversations, recorded moments, and the emotional patterns between them.
                    </p>
                    <div className="relative flex flex-wrap gap-3 mt-8">
                        <Link to="/live">
                            <Button className="gap-2.5 text-xs font-semibold tracking-[0.12em] uppercase px-5 py-3" style={{ fontFamily: sans, backgroundColor: "var(--foreground)", color: "var(--background)", borderRadius: 0, height: "auto" }}>
                                <Mic className="size-4" /> Start live analysis
                            </Button>
                        </Link>
                        <Link to="/upload">
                            <Button variant="outline" className="gap-2.5 text-xs font-semibold tracking-[0.12em] uppercase px-5 py-3" style={{ fontFamily: sans, borderColor: "var(--border)", color: "var(--foreground)", borderRadius: 0, height: "auto" }}>
                                <Upload className="size-4" /> Study a recording
                            </Button>
                        </Link>
                    </div>
                </div>
                <div className="border p-6 flex flex-col justify-between" style={{ borderColor: "var(--border)", backgroundColor: "color-mix(in srgb, var(--primary) 13%, var(--background))", color: "var(--foreground)" }}>
                    <div>
                        <p className="text-[11px] tracking-[0.22em] uppercase opacity-60" style={{ fontFamily: sans }}>A thought for today</p>
                        {quote ? (
                            <blockquote className="mt-8 text-2xl leading-tight" style={{ fontFamily: serif }}>
                                “{quote.text}”
                            </blockquote>
                        ) : (
                            <div className="mt-6"><LoadingPanel title="Loading today's quote" /></div>
                        )}
                    </div>
                    {quote && <p className="text-xs tracking-[0.12em] uppercase opacity-60 mt-8" style={{ fontFamily: sans }}>— {quote.author}</p>}
                </div>

            </div>

            {isLoadingSessions && !stats ? (
                <LoadingPanel title="Loading your saved statistics" description="Your dashboard will appear as soon as the saved reports load." />
            ) : (
              <>
            {isLoadingSessions && stats && <p className="mb-4 text-xs text-muted-foreground" role="status">Refreshing your saved statistics…</p>}
            {sessionsError && <p className="mb-4 text-xs text-muted-foreground" role="status">Showing your last saved statistics. {sessionsError}</p>}

            {/* At-a-glance signal strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px mb-10 border" style={{ borderColor: "var(--border)", backgroundColor: "var(--border)" }}>
                <div className="bg-background p-5"><StatBlock label="Sessions" value={stats?.totalSessions ?? 0} sub="All time" /></div>
                <div className="bg-background p-5"><StatBlock label="Listening time" value={`${Math.round((stats?.totalDuration ?? 0) / 60)}m`} sub="Analyzed audio" /></div>
                <div className="bg-background p-5"><StatBlock label="Signal confidence" value={`${((stats?.avgConfidence ?? 0) * 100).toFixed(1)}%`} sub="Average model confidence" /></div>
            </div>

            {/* Charts */}
            {(stats?.totalSessions ?? 0) === 0 ? (
                <div className="border py-20 text-center" style={{ borderColor: "var(--border)" }}>
                    <Brain
                        className="mx-auto mb-4 text-muted-foreground/40"
                        style={{ width: 40, height: 40 }}
                    />
                    <h3
                        className="text-xl font-bold text-foreground mb-2"
                        style={{ fontFamily: serif }}
                    >
                        No sessions recorded yet.
                    </h3>
                    <p
                        className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto"
                        style={{ fontFamily: sans, fontWeight: 300 }}
                    >
                        Start a live analysis or upload an audio file to begin analysis.
                    </p>
                    <div className="flex gap-3 justify-center">
                        <Link to="/live">
                            <Button
                                style={{
                                    fontFamily: sans,
                                    fontSize: 12,
                                    letterSpacing: "0.1em",
                                    textTransform: "uppercase",
                                    backgroundColor: "var(--foreground)",
                                    color: "var(--background)",
                                    borderRadius: 0,
                                    fontWeight: 600,
                                }}
                            >
                                Start Live Analysis
                            </Button>
                        </Link>
                        <Link to="/upload">
                            <Button
                                variant="outline"
                                style={{
                                    fontFamily: sans,
                                    fontSize: 12,
                                    letterSpacing: "0.1em",
                                    textTransform: "uppercase",
                                    borderColor: "var(--border)",
                                    color: "var(--foreground)",
                                    borderRadius: 0,
                                    fontWeight: 600,
                                }}
                            >
                                Upload File
                            </Button>
                        </Link>
                    </div>
                </div>
            ) : (
                <div>
                    <SectionRule label="Visualisations" />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Emotion Distribution */}
                        <div>
                            <p
                                className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3"
                                style={{ fontFamily: sans }}
                            >
                                Emotion Distribution
                            </p>
                            <div className="border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
                                        <Pie
                                            data={stats?.pieData ?? []}
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={80}
                                            dataKey="value"
                                        >
                                            {(stats?.pieData ?? []).map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                        </Pie>
                                        <Legend
                                            verticalAlign="bottom"
                                            iconType="circle"
                                            wrapperStyle={{ fontSize: 10, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}
                                        />
                                        <Tooltip
                                            contentStyle={tooltipStyle}
                                            formatter={(value: number) => `${(value * 100).toFixed(0)}%`}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Session Confidence */}
                        <div>
                            <p
                                className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3"
                                style={{ fontFamily: sans }}
                            >
                                Session Confidence
                            </p>
                            <div className="border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart data={stats?.timelineData ?? []} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                                        <CartesianGrid vertical={false} strokeDasharray="2 2" stroke="var(--border)" />
                                        <XAxis dataKey="name" tick={axisStyle} />
                                        <YAxis domain={[0, 100]} tick={axisStyle} />
                                        <Tooltip contentStyle={tooltipStyle} />
                                        <Bar dataKey="confidence" fill="var(--primary)" radius={0} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Emotion Trends */}
                        <div className="lg:col-span-2">
                            <p
                                className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3"
                                style={{ fontFamily: sans }}
                            >
                                Emotion Trends — Session Timeline
                            </p>
                            <div className="border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                                <ResponsiveContainer width="100%" height={240}>
                                    <LineChart data={stats?.trendData ?? []} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                                        <CartesianGrid vertical={false} strokeDasharray="2 2" stroke="var(--border)" />
                                        <XAxis dataKey="name" tick={axisStyle} />
                                        <YAxis domain={[0, 100]} tick={axisStyle} />
                                        <Tooltip contentStyle={tooltipStyle} />
                                        <Legend wrapperStyle={{ fontSize: 11, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)" }} />
                                        {(["happy", "sad", "angry", "neutral"] as Emotion[]).map((e) => (
                                            <Line key={e} type="monotone" dataKey={e} stroke={EMOTION_COLORS[e]} strokeWidth={1.5} dot={false} />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            )}
              </>
            )}
          </div>
        </div>
    );
}
