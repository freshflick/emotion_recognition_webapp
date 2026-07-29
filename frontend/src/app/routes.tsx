import { createBrowserRouter, Navigate } from "react-router";
import { Root } from "./components/Root";
import { Dashboard } from "./components/Dashboard";
import { LiveRecording } from "./components/LiveRecording";
import { FileAnalysis } from "./components/FileAnalysis";
import { Reports } from "./components/Reports";
import { Analytics } from "./components/Analytics";
import { Settings } from "./components/Settings";
import { Profile } from "./components/Profile";
import { Login } from "./components/Login";
import { useAuth } from "./contexts/AuthContext";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function RedirectIfAuthed() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/" replace /> : <Login />;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: RedirectIfAuthed,
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
