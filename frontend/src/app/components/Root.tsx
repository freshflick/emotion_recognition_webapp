import { Outlet, Link, useLocation } from "react-router";
import { Activity, Mic, Upload, FileText, BarChart3, Settings } from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

const STATUS_ITEMS = [
  { label: "AI Engine", status: "online" },
  { label: "Audio API", status: "online" },
  { label: "ML Models", status: "online" },
];

export function Root() {
  const location = useLocation();
  const { user } = useUser();

  const navItems = [
    { path: "/", label: "Dashboard", icon: Activity },
    { path: "/live", label: "Live Recording", icon: Mic },
    { path: "/upload", label: "File Analysis", icon: Upload },
    { path: "/analytics", label: "Analytics", icon: BarChart3 },
    { path: "/reports", label: "Reports", icon: FileText },
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-60 bg-sidebar border-r border-sidebar-border flex-shrink-0 flex flex-col">
        {/* Logo */}
        <div className="px-5 pt-5 pb-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-primary rounded-lg shadow-sm">
              <Activity className="size-4 text-primary-foreground" />
            </div>
            <div>
              <div className="font-semibold text-sm text-sidebar-foreground leading-tight">EmotionMonitor</div>
              <div className="text-[10px] text-muted-foreground leading-tight">AI-Powered Analysis</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                  isActive
                    ? "bg-card text-primary font-medium shadow-sm"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <Icon className={`size-4 flex-shrink-0 ${isActive ? "text-primary" : ""}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* System Status */}
        <div className="mx-3 mb-3 px-3 py-2.5 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="size-1.5 rounded-full bg-emerald-400 inline-block" />
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">All Systems Online</span>
          </div>
          <div className="space-y-1">
            {STATUS_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{item.label}</span>
                <div className="flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-400 inline-block" />
                  <span className="text-[10px] text-emerald-500 dark:text-emerald-400">Online</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* User + Settings */}
        <div className="border-t border-sidebar-border px-3 py-3 space-y-0.5">
          <Link
            to="/profile"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
              location.pathname === "/profile"
                ? "bg-card text-primary font-medium shadow-sm"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            }`}
          >
            <Avatar className="size-6">
              <AvatarImage src={user.avatar} />
              <AvatarFallback className="bg-accent text-accent-foreground text-[10px] font-bold">
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-xs truncate text-sidebar-foreground">{user.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">View Profile</div>
            </div>
          </Link>
          <Link
            to="/settings"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
              location.pathname === "/settings"
                ? "bg-card text-primary font-medium shadow-sm"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            }`}
          >
            <Settings className="size-4" />
            <span>Settings</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-background">
        <Outlet />
      </main>
    </div>
  );
}
