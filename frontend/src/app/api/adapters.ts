/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE LABEL SEAM — read this before changing the emotion set.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The model predicts FIVE labels: Neutral, Happy, Sad, Angry, Frustrated.
 * The UI is built around SIX: those four plus fearful and surprised.
 *
 * Frustrated is mapped to "angry" in the UI since it's the closest match.
 * Rather than spread the mismatch across the six components that render
 * emotions, it is contained here. Every backend response passes through
 * `toEmotionData()`, which fills the two unsupported keys with 0.
 */
import type { Emotion, EmotionData, TranscriptEntry } from "../utils/emotionEngine";
import type {
  AnalysisSegment,
  BackendLabel,
  EmotionResult,
  LiveReading,
  Utterance,
} from "./types";

/** Backend label -> the frontend's lowercase key. */
const LABEL_TO_EMOTION: Record<BackendLabel, Emotion> = {
  Neutral: "neutral",
  Happy: "happy",
  Sad: "sad",
  Angry: "angry",
  Frustrated: "angry",
};

/** Map one backend label onto the UI's emotion key. */
export function labelToEmotion(label: BackendLabel): Emotion {
  return LABEL_TO_EMOTION[label] ?? "neutral";
}

function emptyScores(): Record<Emotion, number> {
  return { happy: 0, sad: 0, angry: 0, neutral: 0 };
}

/** Map the backend's 4-label probability dict onto the UI's score shape. */
function toScores(probs: Record<BackendLabel, number>): Record<Emotion, number> {
  const scores = emptyScores();
  for (const [label, value] of Object.entries(probs)) {
    const key = LABEL_TO_EMOTION[label as BackendLabel];
    // Ignore labels we don't recognise rather than crashing — if the model is
    // retrained with more classes, the UI degrades instead of breaking.
    if (key) scores[key] += value;
  }
  return scores;
}

/**
 * Convert one backend prediction into the EmotionData the charts consume.
 */
export function toEmotionData(
  timestamp: number,
  transcript: string,
  emotion: EmotionResult,
  speaker?: string,
  speakerConfidence?: number,
): EmotionData {
  const fused = toScores(emotion.probs);
  const audio = emotion.audio_emotion ? toScores({ [emotion.audio_emotion.label]: emotion.audio_emotion.confidence } as Record<BackendLabel, number>) : fused;
  const text = emotion.text_emotion ? toScores({ [emotion.text_emotion.label]: emotion.text_emotion.confidence } as Record<BackendLabel, number>) : fused;

  return {
    timestamp,
    audio,
    text,
    fused,
    dominantEmotion: LABEL_TO_EMOTION[emotion.top_label] ?? "neutral",
    confidence: emotion.confidence,
    transcript,
    speaker,
    speakerConfidence,
    modalityWeights: emotion.modality_weights,
    audioEmotion: emotion.audio_emotion ? { label: LABEL_TO_EMOTION[emotion.audio_emotion.label] ?? "neutral", confidence: emotion.audio_emotion.confidence } : undefined,
    textEmotion: emotion.text_emotion ? { label: LABEL_TO_EMOTION[emotion.text_emotion.label] ?? "neutral", confidence: emotion.text_emotion.confidence } : undefined,
    isMock: emotion.mock ?? false,
  };
}

/** Convert an uploaded file's analysis windows into a timeline. */
export function segmentsToEmotionData(segments: AnalysisSegment[]): EmotionData[] {
  return segments.map((s) =>
    toEmotionData(Math.round(s.start), s.transcript, s.emotion),
  );
}

/**
 * Did the backend mark this reading as the subject's?
 *
 * Rows saved before the subject feature existed have no `isSubject` field,
 * and were by definition single-speaker — so "absent" has to mean "yes" or
 * every old report would lose all of its data. The same reasoning applies to
 * a session with exactly one speaker, which needs no attribution at all.
 */
function isSubjectReading(reading: LiveReading, subject?: string | null): boolean {
  if (typeof reading.isSubject === "boolean") return reading.isSubject;
  if (subject) return reading.speaker === subject;
  return true;
}

/**
 * Live readings → chart data, subject only.
 *
 * Non-subject readings are dropped here rather than at each chart, so no
 * component downstream has to reason about missing emotions.
 */
export function readingsToEmotionData(
  readings: LiveReading[],
  subject?: string | null,
): EmotionData[] {
  if (readings.length === 0) return [];
  const start = readings[0].timestamp;
  return readings
    .filter((r) => r.emotion && isSubjectReading(r, subject))
    .map((r) =>
      toEmotionData(
        Math.round(r.timestamp - start),
        r.transcript,
        r.emotion as EmotionResult,
        r.speaker,
        r.speakerConfidence,
      ),
    );
}

/**
 * Live readings → the full conversation, everyone included.
 *
 * The subject's entries carry their `emotion` so the transcript view can show
 * an emotion badge inline; other speakers' entries simply don't have one.
 */
export function readingsToTranscript(
  readings: LiveReading[],
  subject?: string | null,
): TranscriptEntry[] {
  if (readings.length === 0) return [];
  const start = readings[0].timestamp;
  return readings.map((r) => {
    const isSubject = isSubjectReading(r, subject);
    return {
      timestamp: Math.round(r.timestamp - start),
      transcript: r.transcript,
      speaker: r.speaker ?? "Speaker 1",
      speakerConfidence: r.speakerConfidence,
      isSubject,
      emotion:
        isSubject && r.emotion
          ? toEmotionData(
              Math.round(r.timestamp - start),
              r.transcript,
              r.emotion,
              r.speaker,
              r.speakerConfidence,
            )
          : undefined,
    };
  });
}

/**
 * An uploaded file's per-window conversation.
 *
 * `segments` and `utterances` are matched by timestamp rather than by index:
 * non-subject windows are absent from `segments`, so a naive zip would pair
 * the wrong transcript with the wrong emotion. Windows that are in neither
 * array (the subject never spoke) still appear, just without emotion.
 */
export function utterancesToTranscript(
  utterances: Utterance[],
  segments: AnalysisSegment[] = [],
): TranscriptEntry[] {
  const byOffset = new Map<number, EmotionData>();
  for (const s of segments) {
    byOffset.set(
      Math.round(s.start),
      toEmotionData(Math.round(s.start), s.transcript, s.emotion),
    );
  }
  return utterances.map((u) => ({
    timestamp: Math.round(u.start),
    offsetSecs: u.start,
    transcript: u.transcript,
    speaker: u.isSubject ? "Speaker 1" : "Other speaker",
    isSubject: u.isSubject,
    matchScore: u.matchScore ?? undefined,
    emotion: byOffset.get(Math.round(u.start)),
  }));
}
