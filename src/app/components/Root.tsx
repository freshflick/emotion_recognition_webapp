import { Outlet, Link, useLocation } from "react-router";
import { Activity, Mic, Upload, FileText, BarChart3, Settings } from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

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
    <div className="flex h-screen bg-[#f8f8fb] dark:bg-[#16161f]">
      {/* Sidebar */}
      <aside className="w-64 bg-[#f2f2f9] dark:bg-[#1a1a26] border-r border-[rgba(100,100,160,0.12)] dark:border-[rgba(180,180,220,0.1)] flex-shrink-0">
        <div className="p-5 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-8 pb-5 border-b border-[rgba(100,100,160,0.12)] dark:border-[rgba(180,180,220,0.1)]">
            <div className="p-2 bg-indigo-500 rounded-xl shadow-sm">
              <Activity className="size-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-base text-slate-700 dark:text-slate-200">EmotionMonitor</h1>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">AI-Powered Analysis</p>
            </div>
          </div>
          <nav className="space-y-0.5 flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.path ||
                (item.path !== "/" && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                    isActive
                      ? "bg-white dark:bg-[#252535] text-indigo-600 dark:text-indigo-400 font-medium shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-[#252535]/60 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  <Icon className={`size-4 flex-shrink-0 ${isActive ? "text-indigo-500" : ""}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Profile Section */}
          <div className="border-t border-[rgba(100,100,160,0.12)] dark:border-[rgba(180,180,220,0.1)] pt-4 mt-4 space-y-0.5">
            <Link
              to="/profile"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                location.pathname === "/profile"
                  ? "bg-white dark:bg-[#252535] text-indigo-600 dark:text-indigo-400 font-medium shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-[#252535]/60 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <Avatar className="size-7">
                <AvatarImage src={user.avatar} />
                <AvatarFallback className="bg-indigo-100 text-indigo-600 text-xs font-semibold">
                  {user.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-slate-700 dark:text-slate-200 text-sm">{user.name}</div>
                <div className="text-[11px] text-slate-400 truncate">View Profile</div>
              </div>
            </Link>
            <Link
              to="/settings"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                location.pathname === "/settings"
                  ? "bg-white dark:bg-[#252535] text-indigo-600 dark:text-indigo-400 font-medium shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-[#252535]/60 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <Settings className="size-4" />
              <span>Settings</span>
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
