import { useState, useRef } from "react";
import { User, Mail, Calendar, Edit2, Save, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useUser } from "../contexts/UserContext";
import { toast } from "sonner";
import { useSessionStore } from "../utils/emotionEngine";

export function Profile() {
  const { user, updateUserProfile } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    bio: user.bio || "",
    avatar: user.avatar || "",
  });

  const sessions = useSessionStore();
  const totalSessions = sessions.length;
  const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
  const memberSince = new Date(user.createdAt).toLocaleDateString();

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    if (!formData.email.trim()) {
      toast.error("Email cannot be empty");
      return;
    }

    updateUserProfile({
      name: formData.name,
      email: formData.email,
      bio: formData.bio,
      avatar: formData.avatar,
    });

    setIsEditing(false);
    toast.success("Profile updated successfully");
  };

  const handleCancel = () => {
    setFormData({
      name: user.name,
      email: user.email,
      bio: user.bio || "",
      avatar: user.avatar || "",
    });
    setIsEditing(false);
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="border-b mb-8 pb-6" style={{ borderColor: "var(--border)" }}>
          <p className="text-[9px] tracking-[0.22em] uppercase text-muted-foreground mb-2" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
            — User Profile / Account Details
          </p>
          <h1
            className="font-bold text-foreground leading-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(1.75rem, 3vw, 2.5rem)", letterSpacing: "-0.02em" }}
          >
            My <em style={{ fontStyle: "italic", color: "var(--primary)" }}>Profile</em>
          </h1>
          <p className="text-xs text-muted-foreground mt-1.5" style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 300 }}>
            Manage your personal information and account settings.
          </p>
        </div>

        {/* Profile Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Your personal details and account information
                </CardDescription>
              </div>
              {!isEditing ? (
                <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
                  <Edit2 className="size-4 mr-2" />
                  Edit Profile
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={handleCancel} variant="outline" size="sm">
                    Cancel
                  </Button>
                  <Button onClick={handleSave} size="sm">
                    <Save className="size-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-6">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative group">
                  <Avatar className="size-32">
                    <AvatarImage src={formData.avatar} />
                    <AvatarFallback className="text-3xl">
                      {formData.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 rounded-full flex flex-col items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Upload className="size-5 text-white" />
                      <span className="text-[10px] text-white font-medium">Upload</span>
                    </button>
                  )}
                </div>
                {isEditing && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setFormData({ ...formData, avatar: ev.target?.result as string });
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="size-3.5 mr-1.5" />
                      Choose Photo
                    </Button>
                  </>
                )}
              </div>

              {/* Form Fields */}
              <div className="flex-1 space-y-4">
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  {isEditing ? (
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="mt-1"
                    />
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <User className="size-4 text-gray-500" />
                      <span>{user.name}</span>
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="email">Email Address</Label>
                  {isEditing ? (
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className="mt-1"
                    />
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <Mail className="size-4 text-gray-500" />
                      <span>{user.email}</span>
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="bio">Bio</Label>
                  {isEditing ? (
                    <Textarea
                      id="bio"
                      value={formData.bio}
                      onChange={(e) =>
                        setFormData({ ...formData, bio: e.target.value })
                      }
                      className="mt-1"
                      rows={4}
                      placeholder="Tell us a bit about yourself..."
                    />
                  ) : (
                    <div className="mt-1 text-gray-700 dark:text-gray-300">
                      {user.bio || "No bio added yet"}
                    </div>
                  )}
                </div>

                <div>
                  <Label>Member Since</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Calendar className="size-4 text-gray-500" />
                    <span>{memberSince}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Activity Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Statistics</CardTitle>
            <CardDescription>Your usage and performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="text-3xl font-semibold text-blue-600">
                  {totalSessions}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Total Sessions
                </div>
              </div>

              <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="text-3xl font-semibold text-green-600">
                  {Math.round(totalDuration / 60)}m
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Total Duration
                </div>
              </div>

              <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="text-3xl font-semibold text-purple-600">
                  {sessions.length > 0
                    ? (
                        (sessions.reduce((sum, s) => sum + s.summary.averageConfidence, 0) /
                          sessions.length) *
                        100
                      ).toFixed(0)
                    : 0}
                  %
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Avg Confidence
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
