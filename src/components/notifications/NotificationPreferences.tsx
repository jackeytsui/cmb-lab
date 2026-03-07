"use client";

import { useState, useEffect } from "react";

interface PreferenceItem {
  category: string;
  muted: boolean;
}

const CATEGORY_LABELS = {
  feedback: {
    label: "Feedback",
    description: "Coach feedback and grading results",
  },
  progress: {
    label: "Progress",
    description: "Course access and milestone notifications",
  },
  system: {
    label: "System",
    description: "System announcements and maintenance",
  },
} as const;

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState<PreferenceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications/preferences");
      if (res.ok) {
        const data = await res.json();
        setPreferences(data.preferences || []);
      }
    } catch (error) {
      console.error("Failed to fetch preferences:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (category: string, currentMuted: boolean) => {
    try {
      const newMuted = !currentMuted;

      // Optimistically update UI
      setPreferences((prev) =>
        prev.map((pref) =>
          pref.category === category ? { ...pref, muted: newMuted } : pref
        )
      );

      // Send update to server
      await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, muted: newMuted }),
      });
    } catch (error) {
      console.error("Failed to update preference:", error);
      // Revert on error
      fetchPreferences();
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-zinc-400 text-sm">
        Loading preferences...
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold text-zinc-100 mb-2">
        Notification Preferences
      </h3>
      <p className="text-xs text-zinc-500 mb-4">
        Choose which types of notifications you want to receive
      </p>

      <div className="space-y-3">
        {preferences.map((pref) => {
          const config =
            CATEGORY_LABELS[pref.category as keyof typeof CATEGORY_LABELS];
          if (!config) return null;

          return (
            <div
              key={pref.category}
              className="flex items-center justify-between py-3 border-b border-zinc-800"
            >
              <div className="flex-1">
                <div className="text-sm font-medium text-zinc-100">
                  {config.label}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {config.description}
                </div>
              </div>

              {/* Toggle switch */}
              <button
                onClick={() => handleToggle(pref.category, pref.muted)}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                  ${pref.muted ? "bg-zinc-700" : "bg-blue-500"}
                `}
                aria-label={`Toggle ${config.label} notifications`}
              >
                <span
                  className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${pref.muted ? "translate-x-1" : "translate-x-6"}
                  `}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
