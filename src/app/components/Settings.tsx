import { useState } from "react";
import { useTheme } from "next-themes";
import {
  Settings as SettingsIcon,
  User,
  Lock,
  Palette,
  Bell,
  Shield,
  Trash2,
  Moon,
  Sun,
  Monitor,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { useUser } from "../contexts/UserContext";
import { toast } from "sonner";

export function Settings() {
  const { user, updateUserProfile } = useUser();
  const { theme, setTheme } = useTheme();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Notification settings (stored in user profile)
  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    sessionReminders: true,
    weeklyReports: true,
    analysisAlerts: false,
  });

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

  const handleClearData = () => {
    localStorage.clear();
    toast.success("All data cleared successfully");
    window.location.reload();
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
            <TabsTrigger value="notifications">
              <Bell className="size-4 mr-2" />
              Notifications
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

            <Card>
              <CardHeader>
                <CardTitle>Data & Privacy</CardTitle>
                <CardDescription>
                  Manage your data and privacy settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Export Data</div>
                    <p className="text-sm text-gray-500">
                      Download all your session data and analytics
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => toast.info("Feature coming soon")}>
                    Export
                  </Button>
                </div>

                <div className="border-t pt-4">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="w-full">
                        <Trash2 className="size-4 mr-2" />
                        Clear All Data
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete all
                          your session data, analytics, and profile information from this
                          device.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleClearData}>
                          Yes, clear all data
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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
                    <div className="font-medium">Enable 2FA</div>
                    <p className="text-sm text-gray-500">
                      Protect your account with two-factor authentication
                    </p>
                  </div>
                  <Switch
                    onCheckedChange={() => toast.info("Feature coming soon")}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>
                  Manage devices where you're signed in
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div>
                      <div className="font-medium">Current Device</div>
                      <p className="text-sm text-gray-500">
                        {navigator.userAgent.includes("Mac") ? "MacOS" : "Windows"} •{" "}
                        {navigator.userAgent.includes("Chrome") ? "Chrome" : "Browser"}
                      </p>
                    </div>
                    <div className="text-xs text-green-600 font-medium">Active Now</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Theme</CardTitle>
                <CardDescription>
                  Customize the appearance of the application
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Color Theme</Label>
                  <div className="grid grid-cols-3 gap-4 mt-2">
                    <button
                      onClick={() => setTheme("light")}
                      className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg transition-all ${
                        theme === "light"
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-950"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <Sun className="size-6" />
                      <span className="text-sm font-medium">Light</span>
                    </button>

                    <button
                      onClick={() => setTheme("dark")}
                      className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg transition-all ${
                        theme === "dark"
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-950"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <Moon className="size-6" />
                      <span className="text-sm font-medium">Dark</span>
                    </button>

                    <button
                      onClick={() => setTheme("system")}
                      className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg transition-all ${
                        theme === "system"
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-950"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <Monitor className="size-6" />
                      <span className="text-sm font-medium">System</span>
                    </button>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <Label>Display Preferences</Label>
                  <div className="space-y-3 mt-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">Compact Mode</div>
                        <p className="text-xs text-gray-500">Reduce spacing and padding</p>
                      </div>
                      <Switch onCheckedChange={() => toast.info("Feature coming soon")} />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">High Contrast</div>
                        <p className="text-xs text-gray-500">
                          Increase contrast for better visibility
                        </p>
                      </div>
                      <Switch onCheckedChange={() => toast.info("Feature coming soon")} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Choose what notifications you want to receive
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Email Notifications</div>
                    <p className="text-sm text-gray-500">
                      Receive email updates about your account
                    </p>
                  </div>
                  <Switch
                    checked={notifications.emailNotifications}
                    onCheckedChange={(checked) =>
                      setNotifications({ ...notifications, emailNotifications: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Session Reminders</div>
                    <p className="text-sm text-gray-500">
                      Get reminded to complete your daily sessions
                    </p>
                  </div>
                  <Switch
                    checked={notifications.sessionReminders}
                    onCheckedChange={(checked) =>
                      setNotifications({ ...notifications, sessionReminders: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Weekly Reports</div>
                    <p className="text-sm text-gray-500">
                      Receive weekly summaries of your emotional patterns
                    </p>
                  </div>
                  <Switch
                    checked={notifications.weeklyReports}
                    onCheckedChange={(checked) =>
                      setNotifications({ ...notifications, weeklyReports: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Analysis Alerts</div>
                    <p className="text-sm text-gray-500">
                      Get notified about significant emotion patterns
                    </p>
                  </div>
                  <Switch
                    checked={notifications.analysisAlerts}
                    onCheckedChange={(checked) =>
                      setNotifications({ ...notifications, analysisAlerts: checked })
                    }
                  />
                </div>

                <div className="border-t pt-4">
                  <Button
                    onClick={() => {
                      toast.success("Notification preferences saved");
                    }}
                    className="w-full"
                  >
                    Save Preferences
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
