"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeaturePermissionsProps {
  roleId: string;
  initialFeatures: string[];
}

interface FeatureInfo {
  key: string;
  label: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Feature labels (matching FEATURE_KEYS from permissions.ts)
// ---------------------------------------------------------------------------

const FEATURES: FeatureInfo[] = [
  {
    key: "ai_conversation",
    label: "AI Conversation Bot",
    description: "Voice practice with AI tutor",
  },
  {
    key: "practice_sets",
    label: "Practice Sets",
    description: "Interactive exercises and quizzes",
  },
  {
    key: "dictionary_reader",
    label: "Dictionary & Reader",
    description: "Built-in Chinese dictionary and text reader",
  },
  {
    key: "listening_lab",
    label: "YouTube Listening Lab",
    description: "YouTube-based listening practice",
  },
  {
    key: "video_threads",
    label: "Video Threads",
    description: "Interactive video response activities",
  },
  {
    key: "certificates",
    label: "Certificates",
    description: "Course completion certificates",
  },
  {
    key: "ai_chat",
    label: "AI Chat",
    description: "Text-based AI conversation assistant",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FeaturePermissions({
  roleId,
  initialFeatures,
}: FeaturePermissionsProps) {
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(
    () => new Set(initialFeatures)
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const onToggle = useCallback(
    async (featureKey: string, enabled: boolean) => {
      // Optimistic update
      const previousFeatures = new Set(enabledFeatures);
      setEnabledFeatures((prev) => {
        const next = new Set(prev);
        if (enabled) {
          next.add(featureKey);
        } else {
          next.delete(featureKey);
        }
        return next;
      });

      setSavingKey(featureKey);
      try {
        const res = await fetch(`/api/admin/roles/${roleId}/features`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ featureKey, enabled }),
        });
        if (!res.ok) throw new Error("Request failed");
        toast.success("Feature updated");
      } catch {
        setEnabledFeatures(previousFeatures);
        toast.error("Failed to update feature");
      } finally {
        setSavingKey(null);
      }
    },
    [roleId, enabledFeatures]
  );

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {FEATURES.map((feature) => {
        const isEnabled = enabledFeatures.has(feature.key);
        const isSaving = savingKey === feature.key;

        return (
          <div
            key={feature.key}
            className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3"
          >
            <div className="min-w-0 flex-1 pr-3">
              <p className="text-sm font-medium text-foreground">
                {feature.label}
              </p>
              <p className="text-xs text-muted-foreground">{feature.description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isSaving && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
              <Switch
                checked={isEnabled}
                onCheckedChange={(checked) => onToggle(feature.key, checked)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
