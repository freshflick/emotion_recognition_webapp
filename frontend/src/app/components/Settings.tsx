import { useState } from "react";
import { useTheme } from "next-themes";
import { Check, User, Lock, Palette, Moon, Sun, Monitor, ShieldCheck, ShieldOff } from "lucide-react";
import { useAccent, type AccentColor } from "../contexts/AccentContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { useUser } from "../contexts/UserContext";
import { toast } from "sonner";

const TOTP_SECRET = "JBSWY3DPEHPK3PXP";
const TOTP_ISSUER = "EmotionMonitor";
const TOTP_URI = `otpauth://totp/${TOTP_ISSUER}:user%40example.com?secret=${TOTP_SECRET}&issuer=${TOTP_ISSUER}`;
const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(TOTP_URI)}`;

export function Settings() {
  const { user, updateUserProfile } = useUser();
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    // In a real app, this would call an API
    toast.success("Password changed successfully");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl mb-2">Settings</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your account preferences and application settings
          </p>
        </div>

        <Tabs defaultValue="account" className="space-y-6">
          <TabsList>
            <TabsTrigger value="account">
              <User className="size-4 mr-2" />
              Account
            </TabsTrigger>
            <TabsTrigger value="security">
              <Lock className="size-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="appearance">
              <Palette className="size-4 mr-2" />
              Appearance
            </TabsTrigger>
          </TabsList>

          {/* Account Tab */}
          <TabsContent value="account" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Account Information</CardTitle>
                <CardDescription>
                  Manage your account details and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Account ID</Label>
                  <Input value={user.id} disabled className="mt-1 bg-gray-50" />
                  <p className="text-xs text-gray-500 mt-1">
                    Your unique account identifier
                  </p>
                </div>

                <div>
                  <Label>Email Address</Label>
                  <Input value={user.email} disabled className="mt-1 bg-gray-50" />
                  <p className="text-xs text-gray-500 mt-1">
                    Go to Profile to update your email
                  </p>
                </div>

                <div>
                  <Label>Account Created</Label>
                  <Input
                    value={new Date(user.createdAt).toLocaleString()}
                    disabled
                    className="mt-1 bg-gray-50"
                  />
                </div>
              </CardContent>
            </Card>

          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>
                  Update your password to keep your account secure
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Must be at least 8 characters
                  </p>
                </div>

                <div>
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <Button onClick={handleChangePassword} className="w-full">
                  Update Password
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Add an extra layer of security to your account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      Authenticator App
                      {twoFAEnabled && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-2 py-0.5 rounded-full">
                          <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />
                          Enabled
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {twoFAEnabled
                        ? "Your account is protected with an authenticator app."
                        : "Use Google Authenticator, Authy, or similar to generate login codes."}
                    </p>
                  </div>
                  {twoFAEnabled ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        setTwoFAEnabled(false);
                        toast.success("Two-factor authentication disabled");
                      }}
                    >
                      <ShieldOff className="size-3.5 mr-1.5" />
                      Disable
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setVerifyCode(""); setShowQRDialog(true); }}
                    >
                      <ShieldCheck className="size-3.5 mr-1.5" />
                      Set Up 2FA
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 2FA QR Dialog */}
            <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Set Up Two-Factor Authentication</DialogTitle>
                  <DialogDescription>
                    Scan the QR code with your authenticator app, then enter the 6-digit code to confirm.
                  </DialogDescription>
                </DialogHeader>

                <div className="flex gap-6 py-2">
                  {/* Left: QR code */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-3">
                    <div className="p-3 rounded-xl border border-border bg-white shadow-sm">
                      <img
                        src={QR_URL}
                        alt="TOTP QR code"
                        width={180}
                        height={180}
                        className="block"
                      />
                    </div>
                    <div className="rounded-lg bg-muted px-3 py-2 text-center w-full">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Manual key</p>
                      <code className="text-xs font-mono tracking-widest text-foreground select-all">{TOTP_SECRET}</code>
                    </div>
                  </div>

                  {/* Right: instructions + verify */}
                  <div className="flex-1 flex flex-col justify-between gap-4">
                    <ol className="text-sm text-muted-foreground space-y-3 list-decimal list-inside">
                      <li>Open your authenticator app<br /><span className="text-xs text-muted-foreground/60">(Google Authenticator, Authy, 1Password, etc.)</span></li>
                      <li>Tap <strong className="text-foreground">"Add account"</strong> and scan the QR code</li>
                      <li>Enter the 6-digit code shown in the app below</li>
                    </ol>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="totp-verify">Verification Code</Label>
                        <Input
                          id="totp-verify"
                          placeholder="000000"
                          maxLength={6}
                          value={verifyCode}
                          onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                          className="text-center text-xl font-mono tracking-[0.5em]"
                        />
                      </div>

                      <Button
                        className="w-full"
                        disabled={verifyCode.length !== 6}
                        onClick={() => {
                          setTwoFAEnabled(true);
                          setShowQRDialog(false);
                          toast.success("Two-factor authentication enabled");
                        }}
                      >
                        <ShieldCheck className="size-4 mr-2" />
                        Verify &amp; Enable
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Card>
              <CardHeader>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>
                  Manage devices where you're signed in
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-[#f5f5fc] dark:bg-[#28284a] rounded-xl">
                    <div>
                      <div className="font-medium text-slate-700 dark:text-slate-200">Current Device</div>
                      <p className="text-sm text-slate-400">
                        {navigator.userAgent.includes("Mac") ? "MacOS" : "Windows"} ·{" "}
                        {navigator.userAgent.includes("Chrome") ? "Chrome" : "Browser"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-400" />
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Active Now</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-6">
            {/* Light / Dark */}
            <Card>
              <CardHeader>
                <CardTitle>Mode</CardTitle>
                <CardDescription>Choose your preferred light or dark mode</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "light", icon: Sun, label: "Light" },
                    { value: "dark", icon: Moon, label: "Dark" },
                    { value: "system", icon: Monitor, label: "System" },
                  ].map(({ value, icon: Icon, label }) => (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        theme === value
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-transparent bg-muted hover:bg-accent/50 text-muted-foreground"
                      }`}
                    >
                      {theme === value && (
                        <span className="absolute top-2 right-2 size-4 rounded-full bg-primary flex items-center justify-center">
                          <Check className="size-2.5 text-primary-foreground" />
                        </span>
                      )}
                      <Icon className="size-5" />
                      <span className="text-sm font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Accent color */}
            <Card>
              <CardHeader>
                <CardTitle>Accent Color</CardTitle>
                <CardDescription>Pick a color that appears on buttons, active items, and highlights</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {([
                    { id: "violet", label: "Violet", swatch: "#7c7cf0", ring: "#7c7cf0" },
                    { id: "green",  label: "Green",  swatch: "#3ecf8e", ring: "#3ecf8e" },
                    { id: "blue",   label: "Blue",   swatch: "#3b82f6", ring: "#3b82f6" },
                    { id: "orange", label: "Orange", swatch: "#f97316", ring: "#f97316" },
                    { id: "red",    label: "Red",    swatch: "#ef4444", ring: "#ef4444" },
                    { id: "amber",  label: "Amber",  swatch: "#f59e0b", ring: "#f59e0b" },
                  ] as { id: AccentColor; label: string; swatch: string; ring: string }[]).map(({ id, label, swatch }) => (
                    <button
                      key={id}
                      onClick={() => setAccent(id)}
                      className={`relative flex flex-col items-center gap-2.5 p-3 rounded-xl border-2 transition-all ${
                        accent === id
                          ? "border-[var(--swatch)] bg-muted"
                          : "border-transparent bg-muted hover:bg-accent/40"
                      }`}
                      style={{ "--swatch": swatch } as React.CSSProperties}
                    >
                      <span
                        className="size-8 rounded-full shadow-sm flex items-center justify-center"
                        style={{ backgroundColor: swatch }}
                      >
                        {accent === id && <Check className="size-4 text-white drop-shadow" />}
                      </span>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
                    </button>
                  ))}
                </div>

                {/* Preview strip */}
                <div className="mt-5 p-4 rounded-xl bg-background border border-border">
                  <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider">Live Preview</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button className="px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground">
                      Primary button
                    </button>
                    <button className="px-4 py-1.5 rounded-lg text-sm font-medium bg-card border border-border text-foreground">
                      Secondary
                    </button>
                    <span className="flex items-center gap-1.5 text-sm text-primary font-medium">
                      <span className="size-2 rounded-full inline-block bg-primary" />
                      Active link
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-accent text-accent-foreground">
                      Badge
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                      Muted
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-400" />
                    <span className="text-xs text-muted-foreground">Background & sidebar update automatically</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
