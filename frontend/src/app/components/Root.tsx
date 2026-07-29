import { useState, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router";
import {
    Activity,
    Mic,
    Upload,
    FileText,
    BarChart3,
    Settings,
    LogOut,
    User,
    Clock,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { useAuth } from "../contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

const NAV_ITEMS = [
    { path: "/", label: "Dashboard", icon: Activity },
    { path: "/live", label: "Live Recording", icon: Mic },
    { path: "/upload", label: "File Analysis", icon: Upload },
    { path: "/analytics", label: "Analytics", icon: BarChart3 },
    { path: "/reports", label: "Reports", icon: FileText },
];

const STATUS_ITEMS = [
    { label: "AI Engine", ok: true },
    { label: "Audio API", ok: true },
    { label: "ML Models", ok: true },
];

export function Root() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useUser();
    const { logout } = useAuth();

    // Live Date and Time State
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const formattedDate = currentTime.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    const formattedTime = currentTime.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });

    const isActive = (path: string) =>
        path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(path);

    return (
        <div className="flex h-screen bg-background">
            {/* ── Editorial Sidebar ── */}
            <aside
                className="w-64 flex-shrink-0 flex flex-col border-r"
                style={{
                    borderColor: "var(--sidebar-border)",
                    backgroundColor: "var(--sidebar)",
                }}
            >
                {/* Masthead */}
                <div
                    className="px-6 pt-6 pb-4 border-b"
                    style={{ borderColor: "var(--sidebar-border)" }}
                >
                    <div className="mb-1">
              <span
                  className="text-xs tracking-[0.2em] uppercase text-muted-foreground block mb-1.5"
                  style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                — Est. 2026
              </span>
                        <div
                            className="text-2xl font-bold leading-tight text-foreground"
                            style={{
                                fontFamily: "'Playfair Display', Georgia, serif",
                                letterSpacing: "-0.01em",
                            }}
                        >
                            Emotion<br />
                            <span className="italic" style={{ color: "var(--primary)" }}>
                  Monitor
                </span>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 tracking-wider uppercase font-medium">
                        Fusion Model · Powered Analysis
                    </p>

                    {/* Live Date & Time Display */}
                    <div
                        className="mt-4 pt-3 border-t flex items-center justify-between text-[11px] text-muted-foreground font-mono"
                        style={{ borderColor: "var(--sidebar-border)" }}
                    >
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="size-3 text-primary" />
                  {formattedTime}
              </span>
                        <span className="text-[10px] uppercase tracking-tight opacity-80">
                {formattedDate}
              </span>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
                    <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground/70 mb-3 px-2">
                        Navigation
                    </p>
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.path);
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className="flex items-center gap-3 px-3 py-2.5 text-xs tracking-wide transition-colors relative group rounded-md hover:bg-sidebar-accent/50"
                                style={{
                                    color: active
                                        ? "var(--foreground)"
                                        : "var(--muted-foreground)",
                                    fontFamily: "'IBM Plex Sans', sans-serif",
                                    fontWeight: active ? 600 : 500,
                                    letterSpacing: "0.05em",
                                    textTransform: "uppercase",
                                }}
                            >
                                {active && (
                                    <span
                                        className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r"
                                        style={{ backgroundColor: "var(--primary)" }}
                                    />
                                )}
                                <Icon
                                    className="flex-shrink-0"
                                    style={{
                                        width: 16,
                                        height: 16,
                                        color: active
                                            ? "var(--primary)"
                                            : "var(--muted-foreground)",
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
                    className="mx-4 mb-4 py-3.5 px-3.5 border rounded-lg"
                    style={{ borderColor: "var(--sidebar-border)" }}
                >
                    <div className="flex items-center gap-2 mb-2.5">
                        <span className="size-2 rounded-full bg-emerald-500 inline-block" />
                        <span
                            className="text-xs font-semibold tracking-wider uppercase text-muted-foreground"
                            style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
                        >
                All Systems Online
              </span>
                    </div>
                    {STATUS_ITEMS.map(({ label, ok }) => (
                        <div key={label} className="flex items-center justify-between py-1">
                  <span
                      className="text-xs text-muted-foreground/80"
                      style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
                  >
                    {label}
                  </span>
                            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 tracking-wide">
                    {ok ? "online" : "offline"}
                  </span>
                        </div>
                    ))}
                </div>

                {/* User footer */}
                <div
                    className="border-t px-4 py-4 space-y-1"
                    style={{ borderColor: "var(--sidebar-border)" }}
                >
                    <Link
                        to="/profile"
                        className="flex items-center gap-3 px-2 py-2 rounded-md transition-colors hover:bg-sidebar-accent/50"
                        style={{
                            color:
                                location.pathname === "/profile"
                                    ? "var(--foreground)"
                                    : "var(--muted-foreground)",
                            fontFamily: "'IBM Plex Sans', sans-serif",
                        }}
                    >
                        <Avatar className="size-7 rounded-md">
                            <AvatarImage src={user?.avatar} />
                            <AvatarFallback
                                className="text-xs font-bold rounded-md"
                                style={{
                                    backgroundColor: "var(--accent)",
                                    color: "var(--foreground)",
                                }}
                            >
                                {user?.name?.charAt(0).toUpperCase() || "U"}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <div
                                className="text-xs uppercase tracking-wider truncate font-semibold"
                            >
                                {user?.name || "User"}
                            </div>
                        </div>
                        <User style={{ width: 14, height: 14, opacity: 0.5 }} />
                    </Link>

                    <Link
                        to="/settings"
                        className="flex items-center gap-3 px-2 py-2 rounded-md transition-colors hover:bg-sidebar-accent/50"
                        style={{
                            color:
                                location.pathname === "/settings"
                                    ? "var(--foreground)"
                                    : "var(--muted-foreground)",
                            fontFamily: "'IBM Plex Sans', sans-serif",
                        }}
                    >
                        <Settings style={{ width: 14, height: 14, opacity: 0.7 }} />
                        <span
                            className="text-xs tracking-wider uppercase font-medium"
                            style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
                        >
                Settings
              </span>
                    </Link>

                    <button
                        onClick={() => {
                            logout();
                            navigate("/login");
                        }}
                        className="flex items-center gap-3 px-2 py-2 rounded-md text-xs font-medium uppercase tracking-wider w-full text-left text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all"
                    >
                        <LogOut style={{ width: 14, height: 14 }} />
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