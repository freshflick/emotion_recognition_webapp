import { createBrowserRouter } from "react-router";
import { Root } from "./components/Root";
import { Dashboard } from "./components/Dashboard";
import { LiveRecording } from "./components/LiveRecording";
import { FileAnalysis } from "./components/FileAnalysis";
import { Reports } from "./components/Reports";
import { Analytics } from "./components/Analytics";
import { Settings } from "./components/Settings";
import { Profile } from "./components/Profile";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
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