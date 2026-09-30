/**
 * Turns stored backend reports into the Session shape the Dashboard, Reports,
 * Analytics and Profile pages already read from.
 *
 * Those four pages go through getSessions(), so hydrating that store is all
 * it takes to put real persisted data in front of them — none of them needed
 * to change.
 */
import { calculateSessionSummary, type Session } from "../utils/emotionEngine";
import {
  labelToEmotion,
  readingsToEmotionData,
  readingsToTranscript,
  segmentsToEmotionData,
  toEmotionData,
  utterancesToTranscript,
} from "./adapters";
import { getReports } from "./client";
import type { BackendLabel, ReportRow } from "./types";

/**
 * The backend stores its own summary alongside the readings/segments.
 * Prefer its dominant_label (mapped onto the UI's emotion set) so the UI
 * agrees with the database even when the vote is tied — a locally
 * recomputed tie-break can otherwise pick a different winner.
 */
function resolveDominant(
  localDominant: Session["summary"]["dominantEmotion"],
  storedLabel: BackendLabel | null | undefined,
) {
  return storedLabel ? labelToEmotion(storedLabel) : localDominant;
}

function rowToSession(row: ReportRow): Session | null {
  const { data } = row;
  const timestamp = new Date(row.created_at).getTime();

  // Live sessions store an array of per-chunk readings, one per speaker per
  // chunk. Subject filtering happens in the adapter so everything downstream
  // (charts, stats, exports) sees the subject's readings only.
  if (data.readings?.length) {
    const subject = data.subject_speaker ?? null;
    const emotionData = readingsToEmotionData(data.readings, subject);
    const summary = calculateSessionSummary(emotionData);
    summary.dominantEmotion = resolveDominant(summary.dominantEmotion, data.summary?.dominant_label);
    return {
      id: row.id,
      timestamp,
      duration: Math.round(data.duration_secs ?? 0),
      type: "live",
      emotionData,
      transcript: readingsToTranscript(data.readings, subject),
      subjectSpeaker: subject ?? undefined,
      subjectName: data.subject_name ?? undefined,
      speakerCount: data.speaker_count ?? 1,
      summary,
    };
  }

  // Uploads store the subject's analysed windows in `segments` and the whole
  // conversation in `utterances`.
  if (data.segments?.length || data.utterances?.length) {
    const emotionData = segmentsToEmotionData(data.segments ?? []);
    const summary = calculateSessionSummary(emotionData);
    summary.dominantEmotion = resolveDominant(summary.dominantEmotion, data.summary?.dominant_label);
    const subject = data.subject_speaker ?? null;
    return {
      id: row.id,
      timestamp,
      duration: Math.round(data.duration_secs ?? 0),
      type: "upload",
      filename: data.filename,
      emotionData,
      // Rows written before utterances existed still have a transcript; fall
      // back to the subject's analysed windows so the panel isn't empty.
      transcript: data.utterances?.length
        ? utterancesToTranscript(data.utterances, data.segments ?? [])
        : emotionData.map((e) => ({
            timestamp: e.timestamp,
            transcript: e.transcript ?? "",
            speaker: subject ?? "Speaker 1",
            isSubject: true,
            emotion: e,
          })),
      subjectSpeaker: subject ?? undefined,
      subjectName: data.subject_name ?? undefined,
      speakerCount: data.speaker_count ?? 1,
      summary,
    };
  }

  // Older upload rows, written before segmenting existed: a single result.
  if (data.emotion) {
    const emotionData = [toEmotionData(0, data.transcript ?? "", data.emotion)];
    return {
      id: row.id,
      timestamp,
      duration: Math.round(data.duration_secs ?? 0),
      type: "upload",
      filename: data.filename,
      emotionData,
      transcript: [
        {
          timestamp: 0,
          transcript: data.transcript ?? "",
          speaker: "Speaker 1",
          isSubject: true,
          emotion: emotionData[0],
        },
      ],
      speakerCount: 1,
      summary: calculateSessionSummary(emotionData),
    };
  }

  // Unrecognised row (e.g. written by an older backend version) — skip it
  // rather than rendering a broken card.
  return null;
}

export async function fetchSessions(): Promise<Session[]> {
  const rows = await getReports();
  return rows
    .map(rowToSession)
    .filter((s): s is Session => s !== null)
    .sort((a, b) => b.timestamp - a.timestamp);
}
