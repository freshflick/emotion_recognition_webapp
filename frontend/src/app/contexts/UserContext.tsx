import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getUser, saveUser, type UserProfile } from "../utils/userProfile";
import { supabase } from "../lib/supabase";

interface UserContextType {
  user: UserProfile;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  refreshUser: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile>(getUser());

  const updateUserProfile = (updates: Partial<UserProfile>) => {
    const updated = { ...user, ...updates };
    saveUser(updated);
    setUser(updated);
  };

  const refreshUser = () => {
    setUser(getUser());
  };

  // Sync the local profile to whoever is actually logged in via Supabase.
  // Runs on mount (covers refresh with an existing session) and again on
  // every sign-in/sign-out, so switching accounts can't leak the previous
  // user's name/avatar/email into the new session.
  useEffect(() => {
    if (!supabase) return; // dev mode — local profile is the only source anyway

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const real: UserProfile = {
          id: session.user.id,
          email: session.user.email ?? "",
          name:
              session.user.user_metadata?.name ??
              session.user.email?.split("@")[0] ??
              "User",
          avatar: session.user.user_metadata?.avatar_url ?? "",
          bio: session.user.user_metadata?.bio ?? "",
          createdAt: new Date(session.user.created_at).getTime(),
          theme: user.theme, // keep the locally-chosen theme; not an auth concern
        };
        saveUser(real);
        setUser(real);
      } else {
        // Signed out — clear so the next login (possibly a different
        // person on this browser) never sees a stale profile.
        localStorage.removeItem("emotionmonitor_user");
        setUser(getUser()); // falls back to DEFAULT_USER
      }
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
      <UserContext.Provider value={{ user, updateUserProfile, refreshUser }}>
        {children}
      </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}