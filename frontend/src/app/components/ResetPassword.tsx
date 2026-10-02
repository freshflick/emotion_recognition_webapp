import { useState } from "react";
import { useNavigate } from "react-router";
import { Lock } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

const serif = "'Playfair Display', Georgia, serif";
const sans = "'IBM Plex Sans', system-ui, sans-serif";

export function ResetPassword() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      toast.error("Password reset is not configured");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmation) {
      toast.error("Passwords do not match");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      toast.success("Password updated. Sign in with your new password.");
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update password");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12" style={{ fontFamily: sans }}>
      <div className="w-full max-w-sm border p-7 sm:p-9" style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
        <div className="mb-8 border-b pb-5" style={{ borderColor: "var(--border)" }}>
          <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2">Emphona / account security</p>
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: serif }}>Set a new password</h1>
          <p className="text-sm text-muted-foreground mt-3">Choose a new password for your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="reset-password" className="text-xs uppercase tracking-wider text-muted-foreground">New password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input id="reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="pl-9 rounded-none" style={{ borderColor: "var(--border)" }} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reset-confirmation" className="text-xs uppercase tracking-wider text-muted-foreground">Confirm password</Label>
            <Input id="reset-confirmation" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" className="rounded-none" style={{ borderColor: "var(--border)" }} />
          </div>
          <Button type="submit" disabled={isSaving} className="w-full rounded-none uppercase tracking-[0.14em] text-xs">
            {isSaving ? "Updating..." : "Update password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
