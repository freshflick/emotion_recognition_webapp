import { Loader2 } from "lucide-react";
import { useSessions } from "../contexts/SessionsContext";

const sans = "'IBM Plex Sans', system-ui, sans-serif";

export function SessionLoadingIndicator() {
  const { isLoadingSessions } = useSessions();
  if (!isLoadingSessions) return null;

  return (
    <div className="mb-6 flex items-center gap-3 border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", backgroundColor: "var(--accent)", color: "var(--accent-foreground)", fontFamily: sans }}>
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>Loading your saved statistics...</span>
    </div>
  );
}
