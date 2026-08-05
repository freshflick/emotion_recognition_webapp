/**
 * Turns stored backend reports into the Session shape the Dashboard, Reports,
 * Analytics and Profile pages already read from.
 *
 * Those four pages go through getSessions(), so hydrating that store is all
 * it takes to put real persisted data in front of them — none of them needed
 * to change.
 */
import { calculateSessionSummary, type Session } from "../utils/emotionEngine";
import { readingsToEmotionData, segmentsToEmotionData, toEmotionData } from "./adapters";
import { getReports } from "./client";
import type { ReportRow } from "./types";

function rowToSession(row: ReportRow): Session | null {
  const { data } = row;
  const timestamp = new Date(row.created_at).getTime();

  // Live sessions store an array of per-chunk readings.
  if (data.readings?.length) {
    const emotionData = readingsToEmotionData(data.readings);
    return {
      id: row.id,
      timestamp,
      duration: Math.round(data.duration_secs ?? 0),
      type: "live",
      emotionData,
      summary: calculateSessionSummary(emotionData),
    };
  }

  // Uploads store one entry per 8-second analysis window.
  if (data.segments?.length) {
    const emotionData = segmentsToEmotionData(data.segments);
    return {
      id: row.id,
      timestamp,
      duration: Math.round(data.duration_secs ?? 0),
      type: "upload",
      filename: data.filename,
      emotionData,
      summary: calculateSessionSummary(emotionData),
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
