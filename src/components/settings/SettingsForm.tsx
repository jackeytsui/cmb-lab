"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

// --- Types ---

interface SettingsFormProps {
  dailyGoalXp: number;
  userName: string;
}

// --- Component ---

export function SettingsForm({
  dailyGoalXp: initialGoal,
  userName: _userName,
}: SettingsFormProps) {
  // Keep daily goal state wired for backend compatibility (UI hidden for now).
  const dailyGoal = initialGoal;
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const nextTheme = stored === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  // Save main preferences
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyGoalXp: dailyGoal,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save settings");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const toggleTheme = (checked: boolean) => {
    const nextTheme = checked ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <div className="space-y-6">
      {/* Section 0: Appearance */}
      <section className="rounded-xl p-6 border border-border bg-card">
        <h2 className="text-lg font-semibold text-foreground mb-1">Appearance</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Toggle between light and dark mode
        </p>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </div>
            <div className="text-xs text-muted-foreground">
              {theme === "dark"
                ? "Switch to a lighter interface"
                : "Switch to a darker interface"}
            </div>
          </div>
          <Switch
            checked={theme === "dark"}
            onCheckedChange={toggleTheme}
            aria-label="Toggle dark mode"
          />
        </div>
      </section>
      {/* Error display */}
      {error && <ErrorAlert message={error} />}

      {/* Save button */}
      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        size="lg"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Settings"
        )}
      </Button>

      {/* Success message */}
      {saved && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 text-center">
          Settings saved
        </p>
      )}
    </div>
  );
}
