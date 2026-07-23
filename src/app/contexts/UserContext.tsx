import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getUser, saveUser, type UserProfile } from "../utils/userProfile";

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
