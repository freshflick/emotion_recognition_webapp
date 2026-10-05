import type { ReactNode } from "react";
import { useSessions } from "../contexts/SessionsContext";
import { LoadingPanel } from "./LoadingPanel";

export function SessionLoadingIndicator({ children }: { children?: ReactNode }) {
  const { isLoadingSessions, sessionsError } = useSessions();
  if (isLoadingSessions) return <LoadingPanel title="Loading your saved statistics" description="Fetching session history and preparing your reports and emotion charts. Please wait." />;
  if (sessionsError) return <div role="alert" className="mb-6 border border-destructive bg-card p-6 text-foreground"><p className="text-lg font-semibold">Could not load your saved statistics</p><p className="mt-2 text-sm">{sessionsError}</p></div>;
  return <>{children}</>;
}
