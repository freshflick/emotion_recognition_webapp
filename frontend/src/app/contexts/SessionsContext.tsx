import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { getHealth, verifyLabels, warmInferenceBackend } from "../api/client";
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
  const [hasLoadedSessions, setHasLoadedSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Health is public — checked regardless of auth so the UI can tell
  // "backend down" apart from "not signed in".
  useEffect(() => {
    // Wake and initialize the GPU model as soon as the site shell opens. This
    // runs independently of sign-in and report loading so both can proceed in
    // parallel while the user is still entering the app.
    void warmInferenceBackend().catch((err) => {
      console.info("[startup] GPU warm-up will retry on first analysis:", err);
    });

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
      setHasLoadedSessions(true);
      setIsLoadingSessions(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setHasLoadedSessions(false);
      setSessionsError(null);
      return;
    }
    void refreshSessions();
  }, [refreshSessions, isAuthenticated]);

  return (
    <SessionsContext.Provider
      value={{
        health,
        isCheckingHealth,
        isMock: health?.mock_mode ?? false,
        isLoadingSessions: isLoadingSessions || (isAuthenticated && !hasLoadedSessions),
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
