import { createBrowserRouter, Navigate, useLocation } from "react-router";
import { useEffect } from "react";
import { Root } from "./components/Root";
import { Dashboard } from "./components/Dashboard";
import { LiveRecording } from "./components/LiveRecording";
import { FileAnalysis } from "./components/FileAnalysis";
import { Reports } from "./components/Reports";
import { Analytics } from "./components/Analytics";
import { Settings } from "./components/Settings";
import { Profile } from "./components/Profile";
import { Login } from "./components/Login";
import { ResetPassword } from "./components/ResetPassword";
import { useAuth } from "./contexts/AuthContext";
import { LoadingPanel } from "./components/LoadingPanel";

// Restoring a Supabase session is asynchronous. Without this gate, a page
// refresh would briefly see isAuthenticated === false and bounce a signed-in
// user to /login before the session resolves.
function AuthPending() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-xl px-6"><LoadingPanel title="Checking your sign-in" description="Restoring your secure session. Please wait." /></div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isRecoverySession, validateSession } = useAuth();
  if (isLoading) return <AuthPending />;
  if (isRecoverySession) return <Navigate to="/reset-password" replace />;
  return isAuthenticated ? <SessionGuard validateSession={validateSession}>{children}</SessionGuard> : <Navigate to="/login" replace />;
}

function SessionGuard({ children, validateSession }: { children: React.ReactNode; validateSession: () => Promise<boolean> }) {
  const location = useLocation();
  useEffect(() => {
    void validateSession();
  }, [location.pathname, validateSession]);
  return <>{children}</>;
}

function RedirectIfAuthed() {
  const { isAuthenticated, isLoading, isRecoverySession } = useAuth();
  if (isLoading) return <AuthPending />;
  if (isRecoverySession) return <Navigate to="/reset-password" replace />;
  return isAuthenticated ? <Navigate to="/" replace /> : <Login />;
}

function RecoveryRoute() {
  const { isLoading, isAuthenticated, isRecoverySession } = useAuth();
  if (isLoading) return <AuthPending />;
  if (!isAuthenticated || !isRecoverySession) return <Navigate to="/login" replace />;
  return <ResetPassword />;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: RedirectIfAuthed,
  },
  {
    path: "/reset-password",
    Component: RecoveryRoute,
  },
  {
    path: "/",
    element: <RequireAuth><Root /></RequireAuth>,
    children: [
      { index: true, Component: Dashboard },
      { path: "live", Component: LiveRecording },
      { path: "upload", Component: FileAnalysis },
      { path: "reports", Component: Reports },
      { path: "analytics", Component: Analytics },
      { path: "settings", Component: Settings },
      { path: "profile", Component: Profile },
    ],
  },
]);
