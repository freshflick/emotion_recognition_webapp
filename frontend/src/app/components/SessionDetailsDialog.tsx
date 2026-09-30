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
import { type Emotion, type Session, type TranscriptEntry } from "../utils/emotionEngine";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "./ui/dialog";
import { formatDuration, EMOTION_COLORS, serif, sans, mono } from "./FileAnalysis.tsx";


/* ── Session Details Dialog ──
   Shown when a row in Recent Uploads is clicked. Re-derives the same
   summary/timeline/transcript views used on the main page, but scoped to
   whichever past session was selected rather than the in-progress one. */
export function SessionDetailsDialog({session, onClose,}: {
    session: Session | null;
    onClose: () => void;
}) {
    const tooltipStyle = {
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: 0,
        boxShadow: "none", color: "var(--card-foreground)", fontSize: 11, fontFamily: sans,
    };
    const axisStyle = { fontSize: 11, fill: "var(--muted-foreground)", fontFamily: sans };

    if (!session) return null;

    const chartData = session.emotionData.map((data) => ({
        time: `${data.timestamp}s`,
        happy: Number((data.fused.happy * 100).toFixed(1)),
        sad: Number((data.fused.sad * 100).toFixed(1)),
        angry: Number((data.fused.angry * 100).toFixed(1)),
        neutral: Number((data.fused.neutral * 100).toFixed(1)),
    }));

    const emotionCounts = session.emotionData.reduce((acc, data) => {
        acc[data.dominantEmotion] = (acc[data.dominantEmotion] || 0) + 1;
        return acc;
    }, {} as Record<Emotion, number>);

    const topEmotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Every turn, so the other participants are still readable. Falls back to
    // the subject's readings for rows saved before transcripts were stored.
    const conversation: TranscriptEntry[] = session.transcript?.length
        ? session.transcript
        : session.emotionData
            .filter((d) => d.transcript)
            .map((d) => ({
                timestamp: d.timestamp,
                transcript: d.transcript ?? "",
                speaker: d.speaker ?? "Speaker 1",
                isSubject: true,
                emotion: d,
            }));

    const subjectLabel =
        session.subjectName?.trim() ||
        session.subjectSpeaker ||
        (session.speakerCount && session.speakerCount > 1 ? "Subject" : "You");
    const otherTurns = conversation.filter((e) => !e.isSubject).length;

    return (
        <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className="!max-w-[92vw] w-[92vw] rounded-xl border p-0 max-h-[97vh] overflow-y-auto"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
            >
                {/* Header */}
                <DialogHeader className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
                    <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground font-normal mb-1.5" style={{ fontFamily: sans }}>
                        — Session Details / {session.type === "upload" ? "File Analysis" : "Live Analysis"}
                    </p>
                    <DialogTitle
                        className="font-bold text-foreground leading-tight"
                        style={{ fontFamily: serif, fontSize: "1.5rem", letterSpacing: "-0.02em" }}
                    >
                        {session.filename ?? `Session ${session.id}`}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground font-normal" style={{ fontFamily: sans }}>
                        {formatDuration(session.duration)} &middot; {new Date(session.timestamp).toLocaleString()}
                        {/* Say whose emotions these are, whenever it's not obvious. */}
                        <span style={{ color: "var(--primary)" }}>
                            &nbsp;&middot; Emotions: <strong style={{ fontWeight: 600 }}>{subjectLabel}</strong>
                        </span>
                    </DialogDescription>
                </DialogHeader>

                {/* Two-column layout: stats + chart on the left, transcript on the right. */}
                <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] divide-y lg:divide-y-0 lg:divide-x" style={{ borderColor: "var(--border)" }}>
                    {/* Left: summary, top emotions, timeline */}
                    <div className="px-6 py-6 space-y-6">
                        {/* Summary */}
                        <div>
                            <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-normal mb-3" style={{ fontFamily: sans }}>
                                Summary
                            </p>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="border-l-2 pl-4 py-1" style={{ borderColor: EMOTION_COLORS[session.summary.dominantEmotion] }}>
                                    <p className="text-[11px] tracking-widest uppercase text-muted-foreground mb-1 font-normal" style={{ fontFamily: sans }}>
                                        Dominant Emotion
                                    </p>
                                    <div className="text-2xl font-bold capitalize" style={{ fontFamily: serif, color: EMOTION_COLORS[session.summary.dominantEmotion] }}>
                                        {session.summary.dominantEmotion}
                                    </div>
                                </div>
                                <div className="border-l-2 pl-4 py-1" style={{ borderColor: "var(--border)" }}>
                                    <p className="text-[11px] tracking-widest uppercase text-muted-foreground mb-1 font-normal" style={{ fontFamily: sans }}>
                                        Avg Confidence
                                    </p>
                                    <div className="text-2xl font-bold" style={{ fontFamily: serif }}>
                                        {(session.summary.averageConfidence * 100).toFixed(1)}%
                                    </div>
                                </div>
                                <div className="border-l-2 pl-4 py-1" style={{ borderColor: "var(--border)" }}>
                                    <p className="text-[11px] tracking-widest uppercase text-muted-foreground mb-1 font-normal" style={{ fontFamily: sans }}>
                                        Data Points
                                    </p>
                                    <div className="text-2xl font-bold" style={{ fontFamily: serif }}>
                                        {session.emotionData.length}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground font-normal" style={{ fontFamily: sans }}>
                                        {otherTurns > 0 ? `of ${conversation.length} turns` : "turns analysed"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Top emotions */}
                        {topEmotions.length > 0 && (
                            <div className="grid grid-cols-3 gap-4">
                                {topEmotions.map(([emotion, count]) => (
                                    <div key={emotion} className="border-l-2 pl-4 py-1" style={{ borderColor: EMOTION_COLORS[emotion as Emotion] }}>
                                        <p className="text-[11px] tracking-widest uppercase text-muted-foreground mb-1 font-normal" style={{ fontFamily: sans }}>
                                            {emotion}
                                        </p>
                                        <div className="text-xl font-bold" style={{ fontFamily: serif, color: EMOTION_COLORS[emotion as Emotion] }}>
                                            {count}×
                                        </div>
                                        <p className="text-[11px] text-muted-foreground font-normal" style={{ fontFamily: sans }}>occurrences</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Timeline */}
                        {chartData.length > 0 && (
                            <div>
                                <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-normal mb-3" style={{ fontFamily: sans }}>
                                    Emotion Timeline
                                </p>
                                <div className="border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}>
                                    <ResponsiveContainer width="100%" height={260}>
                                        <LineChart data={chartData}>
                                            <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" />
                                            <XAxis dataKey="time" tick={axisStyle} />
                                            <YAxis tick={axisStyle} />
                                            <Tooltip contentStyle={tooltipStyle} />
                                            <Legend wrapperStyle={{ fontSize: 11, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em" }} />
                                            {(Object.keys(EMOTION_COLORS) as Emotion[]).map((e) => (
                                                <Line key={e} type="monotone" dataKey={e} stroke={EMOTION_COLORS[e]} strokeWidth={1.5} dot={false} />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: transcript, scrollable so long recordings don't blow out the dialog.
                        Driven by `conversation`, not emotionData, so the other
                        participants' turns are shown too — without an emotion. */}
                    {conversation.length > 0 && (
                        <div className="px-6 py-6">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-normal" style={{ fontFamily: sans }}>
                                    Transcript
                                </p>
                                {otherTurns > 0 && (
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal" style={{ fontFamily: sans }}>
                                        {otherTurns} unanalysed
                                    </span>
                                )}
                            </div>
                            <div className="border p-4 space-y-2 max-h-[50vh] overflow-y-auto" style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}>
                                {conversation.map((entry, index) => (
                                    <div
                                        key={index}
                                        className="flex items-start gap-3 text-sm border-b py-2 last:border-b-0"
                                        style={{ borderColor: "var(--border)", opacity: entry.isSubject ? 1 : 0.62 }}
                                    >
                    <span className="text-[11px] text-muted-foreground/50 tabular-nums w-8 flex-shrink-0 pt-0.5 font-normal" style={{ fontFamily: mono }}>
                      [{entry.offsetSecs ?? entry.timestamp}s]
                    </span>
                                        <span
                                            className="text-[10px] px-1.5 py-0.5 flex-shrink-0 tracking-wider uppercase font-semibold"
                                            style={{
                                                backgroundColor: entry.isSubject ? "var(--accent)" : "var(--muted)",
                                                color: entry.isSubject ? "var(--primary)" : "var(--muted-foreground)",
                                                fontFamily: sans,
                                            }}
                                            title={entry.speakerConfidence != null ? `${(entry.speakerConfidence * 100).toFixed(0)}% speaker match` : undefined}
                                        >
                                            {entry.speaker}
                                        </span>
                                        {entry.emotion ? (
                                            <span
                                                className="text-[11px] px-1.5 py-0.5 flex-shrink-0 tracking-widest uppercase font-normal"
                                                style={{ backgroundColor: "var(--muted)", color: EMOTION_COLORS[entry.emotion.dominantEmotion], fontFamily: sans }}
                                            >
                      {entry.emotion.dominantEmotion}
                    </span>
                                        ) : (
                                            <span
                                                className="text-[10px] px-1.5 py-0.5 flex-shrink-0 tracking-wider uppercase font-normal"
                                                style={{ backgroundColor: "transparent", color: "var(--muted-foreground)", fontFamily: sans }}
                                                title="Transcribed only — not analysed for emotion"
                                            >
                                                no analysis
                                            </span>
                                        )}
                                        <span className="text-sm text-foreground font-normal" style={{ fontFamily: sans }}>
                      {entry.transcript}
                    </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
