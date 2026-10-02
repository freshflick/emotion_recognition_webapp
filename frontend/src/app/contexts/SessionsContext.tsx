import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { getHealth, verifyLabels } from "../api/client";
import { fetchSessions } from "../api/reports";
import type { HealthResponse } from "../api/types";
import { hydrateSessions } from "../utils/emotionEngine";
import { useAuth } from "./AuthContext";

interface SessionsContextType {
  /** Backend status, or null while unknown/unreachable. Drives status pills. */
  health: HealthResponse | null;
  /** True while the initial backend health check is in flight. */
  isCheckingHealth: boolean;
  /** True when the backend is serving randomised placeholder predictions. */
  isMock: boolean;
  isLoadingSessions: boolean;
  sessionsError: string | null;
  /** Re-pull persisted reports — call after saving a new session. */
  refreshSessions: () => Promise<void>;
}

const SessionsContext = createContext<SessionsContextType | undefined>(undefined);

export function SessionsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(true);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Health is public — checked regardless of auth so the UI can tell
  // "backend down" apart from "not signed in".
  useEffect(() => {
    getHealth()
      .then((h) => {
        setHealth(h);
        verifyLabels(h);
      })
      .catch(() => setHealth(null))
      .finally(() => setIsCheckingHealth(false));
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoadingSessions(true);
    setSessionsError(null);
    try {
      hydrateSessions(await fetchSessions());
    } catch (err) {
      // Non-fatal: the app still works for live analysis, it just won't show
      // past reports. Most often means Supabase isn't configured.
      console.warn("[sessions] could not load saved reports:", err);
      setSessionsError(err instanceof Error ? err.message : "Could not load saved reports");
    } finally {
      setIsLoadingSessions(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  return (
    <SessionsContext.Provider
      value={{
        health,
        isCheckingHealth,
        isMock: health?.mock_mode ?? false,
        isLoadingSessions,
        sessionsError,
        refreshSessions,
      }}
    >
      {children}
    </SessionsContext.Provider>
  );
}

export function useSessions() {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error("useSessions must be used within SessionsProvider");
  return ctx;
}
