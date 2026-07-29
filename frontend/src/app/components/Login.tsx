import { useState } from "react";
import { useNavigate } from "react-router";
import { Activity, Eye, EyeOff, Lock, Mail, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

const serif = "'Playfair Display', Georgia, serif";
const sans = "'IBM Plex Sans', system-ui, sans-serif";
const mono = "'IBM Plex Mono', monospace";

export function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 700));
    login(email);
    toast.success("Welcome back!");
    navigate("/");
    setIsLoading(false);
  };

  return (
      <div className="min-h-screen bg-background flex" style={{ fontFamily: sans }}>
        {/* Left — Branding Panel (Editorial Aesthetic) */}
        <div
            className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden border-r"
            style={{
              backgroundColor: "var(--foreground)",
              color: "var(--background)",
              borderColor: "var(--border)"
            }}
        >
          {/* Subtle Line Grid Overlay */}
          <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage:
                    "linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
          />

          {/* Top Header / Masthead */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 border rounded-none" style={{ borderColor: "rgba(255,255,255,0.2)" }}>
                <Activity className="size-5 text-background" />
              </div>
              <span className="font-bold text-lg tracking-tight" style={{ fontFamily: serif }}>
              Emotion<span className="italic opacity-80">Monitor</span>
            </span>
            </div>
            <span className="text-[11px] font-mono tracking-widest uppercase opacity-60" style={{ fontFamily: mono }}>
            — EST. 2026
          </span>
          </div>

          {/* Hero Content */}
          <div className="relative z-10 space-y-6 max-w-lg my-auto">
            <p className="text-[11px] tracking-[0.22em] uppercase opacity-70 font-normal" style={{ fontFamily: sans }}>
              — MULTIMODAL AI EMOTION ENGINE
            </p>
            <h1
                className="text-4xl xl:text-5xl font-bold leading-[1.15]"
                style={{ fontFamily: serif, letterSpacing: "-0.02em" }}
            >
              Understand human emotions in <em className="italic" style={{ color: "var(--primary)" }}>real time.</em>
            </h1>
            <p className="text-sm leading-relaxed opacity-80 max-w-md font-normal" style={{ fontFamily: sans }}>
              Fusing audio spectrum analysis with linguistic signals to surface accurate emotional states, high-confidence metrics, and actionable analytics.
            </p>
          </div>

          {/* Footer Note */}
          <div className="relative z-10 pt-6 border-t flex justify-between items-center text-[11px] opacity-60 font-mono" style={{ borderColor: "rgba(255,255,255,0.15)", fontFamily: mono }}>
            <span>FUSION MODEL V1</span>
            <span>ALL SYSTEMS OPERATIONAL</span>
          </div>
        </div>

        {/* Right — Sign In Form */}
        <div className="flex-1 flex flex-col justify-between px-6 py-12 md:px-12">
          <div className="w-full max-w-sm mx-auto my-auto">
            {/* Mobile Header Logo */}
            <div className="flex items-center gap-2.5 mb-8 lg:hidden">
              <div className="p-1.5 bg-foreground text-background">
                <Activity className="size-4" />
              </div>
              <span className="font-bold text-foreground" style={{ fontFamily: serif }}>EmotionMonitor</span>
            </div>

            {/* Form Title Header */}
            <div className="mb-8 border-b pb-4" style={{ borderColor: "var(--border)" }}>
              <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-1" style={{ fontFamily: sans }}>
                — ACCESS PORTAL
              </p>
              <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: serif }}>
                Sign in
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Enter your credentials to access your analytics dashboard.
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs uppercase tracking-wider font-medium text-muted-foreground" style={{ fontFamily: sans }}>
                  Email address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9 rounded-none border text-xs bg-background h-10"
                      style={{ borderColor: "var(--border)", fontFamily: mono }}
                      autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs uppercase tracking-wider font-medium text-muted-foreground" style={{ fontFamily: sans }}>
                    Password
                  </Label>
                  <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
                      onClick={() => toast.info("Password reset coming soon")}
                      style={{ fontFamily: sans }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 pr-9 rounded-none border text-xs bg-background h-10"
                      style={{ borderColor: "var(--border)", fontFamily: mono }}
                      autoComplete="current-password"
                  />
                  <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <Button
                  type="submit"
                  className="w-full rounded-none h-10 text-xs tracking-[0.14em] uppercase font-normal gap-2"
                  style={{
                    fontFamily: sans,
                    backgroundColor: "var(--foreground)",
                    color: "var(--background)",
                  }}
                  disabled={isLoading}
              >
                {isLoading ? (
                    <span className="flex items-center gap-2">
                  <span className="size-3.5 rounded-full border-2 border-background/30 border-t-background animate-spin" />
                  Authenticating…
                </span>
                ) : (
                    <>
                      Sign in <ArrowRight className="size-3.5" />
                    </>
                )}
              </Button>
            </form>

            {/* Demo Credentials Box */}
            <div className="mt-8 p-4 border bg-card" style={{ borderColor: "var(--border)" }}>
              <p className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground font-medium mb-2" style={{ fontFamily: sans }}>
                Demo Access Credentials
              </p>
              <div className="space-y-1 text-xs text-muted-foreground font-mono" style={{ fontFamily: mono }}>
                <div className="flex justify-between">
                  <span>Email:</span>
                  <span className="text-foreground select-all font-semibold">demo@emotionmonitor.ai</span>
                </div>
                <div className="flex justify-between">
                  <span>Password:</span>
                  <span className="text-foreground select-all font-semibold">any password works</span>
                </div>
              </div>
            </div>

            {/* Sign Up Redirect */}
            <p className="text-center text-xs text-muted-foreground mt-6 font-normal" style={{ fontFamily: sans }}>
              Don't have an account?{" "}
              <button
                  type="button"
                  onClick={() => toast.info("Contact administrator for access")}
                  className="text-foreground font-semibold hover:underline"
              >
                Request Access
              </button>
            </p>
          </div>

          {/* Footer info for right panel */}
          <div className="text-center text-[11px] font-mono text-muted-foreground" style={{ fontFamily: mono }}>
            © 2026 EmotionMonitor Inc.
          </div>
        </div>
      </div>
  );
}