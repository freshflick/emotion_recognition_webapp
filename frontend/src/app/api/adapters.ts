/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE LABEL SEAM — read this before changing the emotion set.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The model predicts FOUR labels: Neutral, Happy, Sad, Angry.
 * The UI is currently built around SIX: those four plus fearful and surprised.
 *
 * Rather than spread that mismatch across the six components that render
 * emotions, it is contained here. Every backend response passes through
 * `toEmotionData()`, which fills the two unsupported keys with 0.
 *
 * ── When the UI is narrowed to the real four ──
 * 1. Change `Emotion` in ../utils/emotionEngine.ts to the four labels.
 * 2. Delete UNSUPPORTED_EMOTIONS below and the loop that zero-fills them.
 * 3. Fix the resulting type errors in the components (they'll be mechanical:
 *    EMOTION_COLORS maps and chart <Line> lists).
 * No other file needs to know the label set changed.
 *
 * ── Until then ──
 * `fearful` and `surprised` are always 0, so they render as flat lines at the
 * bottom of the timeline charts. That is accurate — the model genuinely
 * cannot predict them — but call it out in a demo so it doesn't read as a bug.
 */
import type { Emotion, EmotionData } from "../utils/emotionEngine";
import type { AnalysisSegment, BackendLabel, EmotionResult, LiveReading } from "./types";

/** Backend label -> the frontend's lowercase key. */
const LABEL_TO_EMOTION: Record<BackendLabel, Emotion> = {
  Neutral: "neutral",
  Happy: "happy",
  Sad: "sad",
  Angry: "angry",
};

/** Frontend keys the model has no output for. Delete when the UI moves to 4. */
const UNSUPPORTED_EMOTIONS: Emotion[] = ["fearful", "surprised"];

function emptyScores(): Record<Emotion, number> {
  return { happy: 0, sad: 0, angry: 0, neutral: 0, fearful: 0, surprised: 0 };
}

/** Map the backend's 4-label probability dict onto the UI's score shape. */
function toScores(probs: Record<BackendLabel, number>): Record<Emotion, number> {
  const scores = emptyScores();
  for (const [label, value] of Object.entries(probs)) {
    const key = LABEL_TO_EMOTION[label as BackendLabel];
    // Ignore labels we don't recognise rather than crashing — if the model is
    // retrained with more classes, the UI degrades instead of breaking.
    if (key) scores[key] = value;
  }
  for (const key of UNSUPPORTED_EMOTIONS) scores[key] = 0;
  return scores;
}

/**
 * Convert one backend prediction into the EmotionData the charts consume.
 *
 * `audio` and `text` intentionally receive the SAME fused distribution.
 * The model has a single classifier over the fused vector — there is no
 * audio-only or text-only emotion prediction to show. What genuinely differs
 * per modality is the trust weighting, carried on `modalityWeights` and
 * rendered as the audio/text split in the UI.
 */
export function toEmotionData(
  timestamp: number,
  transcript: string,
  emotion: EmotionResult,
): EmotionData {
  const fused = toScores(emotion.probs);

  return {
    timestamp,
    audio: fused,
    text: fused,
    fused,
    dominantEmotion: LABEL_TO_EMOTION[emotion.top_label] ?? "neutral",
    confidence: emotion.confidence,
    transcript,
    modalityWeights: emotion.modality_weights,
    isMock: emotion.mock ?? false,
  };
}

/** Convert an uploaded file's analysis windows into a timeline. */
export function segmentsToEmotionData(segments: AnalysisSegment[]): EmotionData[] {
  return segments.map((s) =>
    toEmotionData(Math.round(s.start), s.transcript, s.emotion),
  );
}

/** Convert a stored live session's readings back into chart data. */
export function readingsToEmotionData(readings: LiveReading[]): EmotionData[] {
  if (readings.length === 0) return [];
  const start = readings[0].timestamp;
  return readings.map((r) =>
    toEmotionData(Math.round(r.timestamp - start), r.transcript, r.emotion),
  );
}
