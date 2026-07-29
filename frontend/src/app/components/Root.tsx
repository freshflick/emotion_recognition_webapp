import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { Activity, Mic, Upload, FileText, BarChart3, Settings, LogOut } from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { useAuth } from "../contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

const STATUS_ITEMS = [
  { label: "AI Engine", status: "online" },
  { label: "Audio API", status: "online" },
  { label: "ML Models", status: "online" },
];

export function Root() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();
  const { logout } = useAuth();

  const navItems = [
    { path: "/", label: "Dashboard", icon: Activity },
    { path: "/live", label: "Live Analysis", icon: Mic },
    { path: "/upload", label: "File Analysis", icon: Upload },
    { path: "/analytics", label: "Analytics", icon: BarChart3 },
    { path: "/reports", label: "Reports", icon: FileText },
  ];
const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: Activity },
  { path: "/live", label: "Live Recording", icon: Mic },
  { path: "/upload", label: "File Analysis", icon: Upload },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/reports", label: "Reports", icon: FileText },
];

export function Root() {
  const location = useLocation();
  const { user } = useUser();

  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(path);

  return (
    <div className="flex h-screen bg-background">
      {/* ── Editorial Sidebar ── */}
      <aside
        className="w-56 flex-shrink-0 flex flex-col border-r"
        style={{ borderColor: "var(--sidebar-border)", backgroundColor: "var(--sidebar)" }}
      >
        {/* Masthead */}
        <div className="px-5 pt-6 pb-5 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="mb-0.5">
            <span
              className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-1"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              — Est. 2024
            </span>
            <div
              className="text-lg font-bold leading-none text-foreground"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.01em" }}
            >
              Emotion<br />
              <span className="italic" style={{ color: "var(--primary)" }}>Monitor</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 tracking-widest uppercase">
            AI·Powered Analysis
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-5 space-y-0.5 overflow-y-auto">
          <p className="text-[9px] tracking-[0.22em] uppercase text-muted-foreground/60 mb-3 px-1">
            Navigation
          </p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center gap-2.5 px-2 py-2 text-xs tracking-wide transition-colors relative group"
                style={{
                  color: active ? "var(--foreground)" : "var(--muted-foreground)",
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  fontWeight: active ? 600 : 400,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  fontSize: "10px",
                }}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1 bottom-1 w-0.5"
                    style={{ backgroundColor: "var(--primary)" }}
                  />
                )}
                <Icon
                  className="flex-shrink-0"
                  style={{
                    width: 13,
                    height: 13,
                    color: active ? "var(--primary)" : "var(--muted-foreground)",
                    opacity: active ? 1 : 0.7,
                  }}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* System status — inline editorial */}
        <div
          className="mx-4 mb-4 py-3 px-3 border"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />
            <span
              className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              All Systems Online
            </span>
          </div>
          {[["AI Engine", true], ["Audio API", true], ["ML Models", true]].map(([label, ok]) => (
            <div key={label as string} className="flex items-center justify-between py-0.5">
              <span className="text-[9px] text-muted-foreground/70" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
                {label as string}
              </span>
              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 tracking-wide">
                {ok ? "online" : "offline"}
              </span>
            </div>
          ))}
        </div>

        {/* User footer */}
        <div
          className="border-t px-4 py-3 space-y-0.5"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          <Link
            to="/profile"
            className="flex items-center gap-2.5 px-2 py-2 transition-colors"
            style={{
              color: location.pathname === "/profile" ? "var(--foreground)" : "var(--muted-foreground)",
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            <Avatar className="size-5 rounded-none">
              <AvatarImage src={user.avatar} />
              <AvatarFallback
                className="text-[9px] font-bold rounded-none"
                style={{ backgroundColor: "var(--accent)", color: "var(--foreground)" }}
              >
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div
                className="text-[10px] uppercase tracking-widest truncate"
                style={{ fontWeight: 600, letterSpacing: "0.1em" }}
              >
                {user.name}
              </div>
            </div>
            <User style={{ width: 11, height: 11, opacity: 0.4 }} />
          </Link>
          <Link
            to="/settings"
            className="flex items-center gap-2.5 px-2 py-1.5 transition-colors"
            style={{
              color: location.pathname === "/settings" ? "var(--foreground)" : "var(--muted-foreground)",
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            <Settings style={{ width: 11, height: 11, opacity: 0.6 }} />
            <span
              className="text-[9px] tracking-[0.14em] uppercase"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              Settings
            </span>
          </Link>
          <button
            onClick={() => { logout(); navigate("/login"); }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm w-full text-left text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all"
          >
            <LogOut className="size-4" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-background">
        <Outlet />
      </main>
    </div>
  );
}
