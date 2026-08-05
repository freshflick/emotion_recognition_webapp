import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session as SupabaseSession } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { clearSessions } from "../utils/emotionEngine";

interface AuthContextType {
  isAuthenticated: boolean;
  /** True until the initial session lookup finishes — routes must wait. */
  isLoading: boolean;
  email: string | null;
  /** True when running without Supabase credentials (see lib/supabase.ts). */
  isDevMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Dev-mode fallback keys. Only used when Supabase isn't configured, so the
// team can click through the app before the project exists.
const DEV_AUTH_KEY = "em_auth";
const DEV_EMAIL_KEY = "em_email";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Dev-mode state, ignored entirely when Supabase is configured.
  const [devAuthed, setDevAuthed] = useState(
    () => localStorage.getItem(DEV_AUTH_KEY) === "true",
  );
  const [devEmail, setDevEmail] = useState(() => localStorage.getItem(DEV_EMAIL_KEY));

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    // getSession() resolves from local storage first, so a refresh doesn't
    // bounce the user to /login while the network round-trip happens.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    // Fires on sign-in, sign-out, and background token refresh — keeping the
    // context in step with supabase-js rather than snapshotting once.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) clearSessions();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) {
      localStorage.setItem(DEV_AUTH_KEY, "true");
      localStorage.setItem(DEV_EMAIL_KEY, email);
      setDevAuthed(true);
      setDevEmail(email);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const signUp = async (email: string, password: string) => {
    if (!supabase) {
      await signIn(email, password);
      return { needsConfirmation: false };
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    // With email confirmation on, Supabase returns a user but no session —
    // the caller needs to tell the user to check their inbox.
    return { needsConfirmation: !data.session };
  };

  const signOut = async () => {
    clearSessions();
    if (!supabase) {
      localStorage.removeItem(DEV_AUTH_KEY);
      localStorage.removeItem(DEV_EMAIL_KEY);
      setDevAuthed(false);
      setDevEmail(null);
      return;
    }
    await supabase.auth.signOut();
  };

  const value: AuthContextType = {
    isAuthenticated: isSupabaseConfigured ? session !== null : devAuthed,
    isLoading,
    email: isSupabaseConfigured ? (session?.user.email ?? null) : devEmail,
    isDevMode: !isSupabaseConfigured,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
