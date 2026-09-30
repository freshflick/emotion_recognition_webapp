import { useState, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router";
import {
    Activity, Mic, Upload, FileText, BarChart3, Settings,
    LogOut, User, Clock, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { useAuth } from "../contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

const NAV_ITEMS = [
    { path: "/", label: "Dashboard", icon: Activity },
    { path: "/live", label: "Live Analysis", icon: Mic },
    { path: "/upload", label: "File Analysis", icon: Upload },
    { path: "/analytics", label: "Analytics", icon: BarChart3 },
    { path: "/reports", label: "Reports", icon: FileText },
];

export function Root() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useUser();
    const { signOut } = useAuth();

    const [collapsed, setCollapsed] = useState(
        () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true"
    );

    const toggleCollapsed = () => {
        setCollapsed((prev) => {
            localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(!prev));
            return !prev;
        });
    };

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

    const pageLabel = NAV_ITEMS.find((item) => isActive(item.path))?.label ?? "Workspace";

    return (
        <div className="flex min-h-screen bg-background">
            <aside
                className="hidden lg:flex sticky top-0 h-screen self-start flex-shrink-0 flex-col border-r transition-all duration-200"
                style={{
                    width: collapsed ? 72 : 256,
                    borderColor: "var(--sidebar-border)",
                    backgroundColor: "var(--sidebar)",
                }}
            >
                {/* Masthead */}
                <div
                    className={`pt-6 pb-4 border-b flex items-center ${collapsed ? "justify-center px-2" : "justify-between pl-6 pr-3"}`}
                    style={{ borderColor: "var(--sidebar-border)" }}
                >
                    {!collapsed && (
                        <div className="mb-1">
                            <span className="text-xs tracking-[0.2em] uppercase block mb-1.5" style={{ color: "var(--sidebar-foreground)", opacity: 0.82, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                                — Est. 2026
                            </span>
                            <div className="text-2xl font-bold leading-tight" style={{ color: "var(--sidebar-foreground)", fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.01em" }}>
                                Emotion<br />
                                <span className="italic" style={{ color: "var(--primary)" }}>Monitor</span>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={toggleCollapsed}
                        className="p-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors flex-shrink-0"
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {collapsed ? (
                            <ChevronRight style={{ width: 16, height: 16, color: "var(--sidebar-foreground)", opacity: 0.7 }} />
                        ) : (
                            <ChevronLeft style={{ width: 16, height: 16, color: "var(--sidebar-foreground)", opacity: 0.7 }} />
                        )}
                    </button>
                </div>

                {!collapsed && (
                    <div className="pb-0">
                        <p className="px-6 py-3 text-xs tracking-[0.08em] uppercase font-semibold leading-4" style={{ color: "var(--sidebar-foreground)", opacity: 0.86 }}>
                            <span className="block">Fusion Model ·</span>
                            <span className="block">Powered Analysis</span>
                        </p>
                        <div className="border-y px-6 py-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground font-mono" style={{ borderColor: "var(--sidebar-border)" }}>
                                <span className="flex items-center gap-1.5 font-medium" style={{ color: "var(--sidebar-foreground)", opacity: 0.9 }}>
                                 <Clock className="size-3" style={{ color: "var(--sidebar-primary)" }} />
                                {formattedTime}
                            </span>
                            <span className="text-[10px] uppercase tracking-tight" style={{ color: "var(--sidebar-foreground)", opacity: 0.72 }}>{formattedDate}</span>
                        </div>
                    </div>
                )}

                {/* Navigation */}
                <nav
                    className="flex-1 px-2 pt-5 pb-6 space-y-1 overflow-y-auto"
                >
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.path);
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                title={collapsed ? item.label : undefined}
                                className={`flex items-center gap-3 py-2.5 text-xs tracking-wide transition-colors relative group rounded-md hover:bg-sidebar-accent/50 ${collapsed ? "justify-center px-2" : "px-3"}`}
                                style={{
                                     color: active ? "var(--sidebar-foreground)" : "var(--sidebar-foreground)",
                                     backgroundColor: active ? "var(--sidebar-accent)" : "transparent",
                                     opacity: active ? 1 : 0.9,
                                    fontFamily: "'IBM Plex Sans', sans-serif",
                                    fontWeight: active ? 600 : 500,
                                    letterSpacing: "0.05em",
                                    textTransform: "uppercase",
                                }}
                            >
                                {active && (
                                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r" style={{ backgroundColor: "var(--primary)" }} />
                                )}
                                <Icon
                                    className="flex-shrink-0"
                                    style={{
                                        width: 16, height: 16,
                                         color: active ? "var(--sidebar-primary)" : "var(--sidebar-foreground)",
                                        opacity: active ? 1 : 0.7,
                                    }}
                                />
                                {!collapsed && <span>{item.label}</span>}
                            </Link>
                        );
                    })}
                </nav>

                {/* User footer */}
                <div className={`border-t py-4 space-y-1 ${collapsed ? "px-2" : "px-4"}`} style={{ borderColor: "var(--sidebar-border)" }}>
                    <Link
                        to="/profile"
                        title={collapsed ? (user?.name || "Profile") : undefined}
                        className={`flex items-center gap-3 py-2 rounded-md transition-colors hover:bg-sidebar-accent/50 ${collapsed ? "justify-center px-2" : "px-2"}`}
                         style={{ color: "var(--sidebar-foreground)", opacity: location.pathname === "/profile" ? 1 : 0.88, fontFamily: "'IBM Plex Sans', sans-serif" }}
                    >
                        <Avatar className="size-7">
                            <AvatarImage src={user?.avatar} />
                            <AvatarFallback className="text-xs font-bold" style={{ backgroundColor: "var(--sidebar-accent)", color: "var(--sidebar-foreground)" }}>
                                {user?.name?.charAt(0).toUpperCase() || "U"}
                            </AvatarFallback>
                        </Avatar>
                        {!collapsed && (
                            <>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs uppercase tracking-wider truncate font-semibold">{user?.name || "User"}</div>
                                </div>
                                <User style={{ width: 14, height: 14, opacity: 0.5 }} />
                            </>
                        )}
                    </Link>

                    <Link
                        to="/settings"
                        title={collapsed ? "Settings" : undefined}
                        className={`flex items-center gap-3 py-2 rounded-md transition-colors hover:bg-sidebar-accent/50 ${collapsed ? "justify-center px-2" : "px-2"}`}
                         style={{ color: "var(--sidebar-foreground)", opacity: location.pathname === "/settings" ? 1 : 0.88, fontFamily: "'IBM Plex Sans', sans-serif" }}
                    >
                        <Settings style={{ width: 14, height: 14, opacity: 0.7 }} />
                        {!collapsed && <span className="text-xs tracking-wider uppercase font-medium" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>Settings</span>}
                    </Link>

                    <button
                        onClick={async () => { await signOut(); navigate("/login"); }}
                        title={collapsed ? "Sign out" : undefined}
                         className={`flex items-center gap-3 py-2 rounded-md text-xs font-medium uppercase tracking-wider hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all ${collapsed ? "justify-center px-2 w-full" : "px-2 w-full text-left"}`}
                         style={{ color: "var(--sidebar-foreground)", opacity: 0.88 }}
                    >
                        <LogOut style={{ width: 14, height: 14 }} />
                        {!collapsed && <span>Sign out</span>}
                    </button>
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex lg:hidden items-center justify-between gap-4 border-b px-4 py-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
                    <Link to="/" className="min-w-0" style={{ color: "var(--foreground)" }}>
                        <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Emotion Monitor</span>
                        <span className="block truncate text-sm font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{pageLabel}</span>
                    </Link>
                    <Link to="/settings" aria-label="Open settings" className="flex size-9 shrink-0 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                        <Settings className="size-4" />
                    </Link>
                </header>
                <nav className="flex lg:hidden gap-1 overflow-x-auto border-b px-3 py-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--sidebar)" }}>
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.path);
                        return <Link key={item.path} to={item.path} className="flex shrink-0 items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: active ? "var(--sidebar-foreground)" : "var(--sidebar-foreground)", opacity: active ? 1 : 0.62, backgroundColor: active ? "var(--sidebar-accent)" : "transparent" }}><Icon className="size-3.5" style={{ color: active ? "var(--sidebar-primary)" : "currentColor" }} />{item.label}</Link>;
                    })}
                </nav>
                <main className="min-w-0 flex-1 overflow-auto bg-background">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
