"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Check, X, Plus, Loader2, Trash2, CheckCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TagBadge } from "@/components/tags/TagBadge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Tag {
  id: string;
  name: string;
  color: string;
  type: "coach" | "system";
  description: string | null;
}

interface FeatureGrant {
  featureKey: string;
  grantType: "additive" | "deny";
}

interface ContentGrant {
  contentType: string;
  contentId: string;
}

interface AudioSeries {
  id: string;
  title: string;
  extraPack: boolean;
}

// Feature access grouped into logical categories for easier scanning.
// Order within each category matches the typical student journey.
const FEATURE_CATEGORIES: Array<{
  label: string;
  description?: string;
  features: Array<{ key: string; label: string }>;
}> = [
  {
    label: "Core Learning Tools",
    description: "Baseline features for regular students",
    features: [
      { key: "dictionary_reader", label: "AI Passage Reader" },
      { key: "listening_lab", label: "YouTube Listening Lab" },
      { key: "audio_courses", label: "Audio Courses" },
      { key: "coaching_material", label: "Coaching Material" },
      { key: "flashcards", label: "Flashcards" },
    ],
  },
  {
    label: "Mandarin Accelerator",
    description: "Accelerator-track content",
    features: [
      { key: "mandarin_accelerator", label: "Mandarin Accelerator" },
      { key: "audio_accelerator_edition", label: "Audio Accelerator Edition" },
      { key: "tone_mastery", label: "Tone Mastery" },
      { key: "listening_training", label: "Listening Training" },
    ],
  },
  {
    label: "AI & Practice",
    description: "Interactive and AI-powered tools",
    features: [
      { key: "ai_conversation", label: "AI Conversation" },
      { key: "ai_chat", label: "AI Chat" },
      { key: "practice_sets", label: "Practice Sets" },
      { key: "video_threads", label: "Video Threads" },
    ],
  },
  {
    label: "Other",
    features: [{ key: "certificates", label: "Certificates" }],
  },
];

// ---------------------------------------------------------------------------
// Tag Row — expandable row showing grants for one tag
// ---------------------------------------------------------------------------

function TagRow({
  tag,
  audioSeries,
}: {
  tag: Tag;
  audioSeries: AudioSeries[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [featureGrants, setFeatureGrants] = useState<FeatureGrant[]>([]);
  const [contentGrants, setContentGrants] = useState<ContentGrant[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchGrants = useCallback(async () => {
    setLoading(true);
    try {
      const [featRes, contentRes] = await Promise.all([
        fetch(`/api/admin/tags/${tag.id}/features`),
        fetch(`/api/admin/tags/${tag.id}/content`),
      ]);
      if (featRes.ok) {
        const data = await featRes.json();
        setFeatureGrants(data.grants ?? []);
      }
      if (contentRes.ok) {
        const data = await contentRes.json();
        setContentGrants(data.grants ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tag.id]);

  useEffect(() => {
    if (expanded) fetchGrants();
  }, [expanded, fetchGrants]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await Promise.all([
        fetch(`/api/admin/tags/${tag.id}/features`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grants: featureGrants }),
        }),
        fetch(`/api/admin/tags/${tag.id}/content`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grants: contentGrants }),
        }),
      ]);
      setDirty(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [tag.id, featureGrants, contentGrants]);

  // Toggle between Grant (green ✓) and Deny (red ✗).
  // A feature with no record is treated as deny visually, so clicking it
  // creates a Grant record. From there, clicking alternates between grant
  // and deny records.
  const toggleFeature = (featureKey: string) => {
    setFeatureGrants((prev) => {
      const existing = prev.find((g) => g.featureKey === featureKey);
      if (!existing || existing.grantType === "deny") {
        // No record or deny → flip to grant
        const withoutKey = prev.filter((g) => g.featureKey !== featureKey);
        return [...withoutKey, { featureKey, grantType: "additive" as const }];
      }
      // Grant → flip to deny
      return prev.map((g) =>
        g.featureKey === featureKey ? { ...g, grantType: "deny" as const } : g
      );
    });
    setDirty(true);
  };

  // Bulk set all features in a category to Grant or Deny.
  const setCategoryFeatures = (
    featureKeys: string[],
    nextState: "additive" | "deny"
  ) => {
    setFeatureGrants((prev) => {
      const withoutCategory = prev.filter(
        (g) => !featureKeys.includes(g.featureKey)
      );
      return [
        ...withoutCategory,
        ...featureKeys.map((key) => ({
          featureKey: key,
          grantType: nextState,
        })),
      ];
    });
    setDirty(true);
  };

  const toggleAudioSeries = (seriesId: string) => {
    setContentGrants((prev) => {
      const exists = prev.some(
        (g) => g.contentType === "audio_series" && g.contentId === seriesId
      );
      if (exists) {
        return prev.filter(
          (g) => !(g.contentType === "audio_series" && g.contentId === seriesId)
        );
      }
      return [...prev, { contentType: "audio_series", contentId: seriesId }];
    });
    setDirty(true);
  };

  // Only 2 visible states: "additive" (Grant) or "deny".
  // An unset feature (no DB row) is displayed as "deny" — visually identical
  // to an explicit deny. The difference matters for permission resolution
  // (no record = inherit from role defaults, explicit deny = always blocked)
  // but is hidden from the admin UI for simplicity.
  const getFeatureState = (featureKey: string): "additive" | "deny" => {
    const grant = featureGrants.find((g) => g.featureKey === featureKey);
    return grant?.grantType === "additive" ? "additive" : "deny";
  };

  const hasAudioSeries = (seriesId: string) =>
    contentGrants.some(
      (g) => g.contentType === "audio_series" && g.contentId === seriesId
    );

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header — reserve pr-10 so the trash icon (absolute top-3 right-3) never overlaps the grants count */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 pr-12 text-left hover:bg-accent/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <TagBadge name={tag.name} color={tag.color} type={tag.type} />
        {tag.description && (
          <span className="text-xs text-muted-foreground truncate">
            {tag.description}
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
          {featureGrants.length > 0 && expanded
            ? `${featureGrants.length} feature ${featureGrants.length === 1 ? "grant" : "grants"}`
            : ""}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Feature grants */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">
                  Feature Access
                </h4>
                <p className="text-[10px] text-muted-foreground mb-4">
                  Every feature is either{" "}
                  <span className="text-emerald-500 font-medium">Grant</span> or{" "}
                  <span className="text-red-500 font-medium">Deny</span>. Click a card to toggle, or use the category buttons to bulk-set.
                </p>
                <div className="space-y-5">
                  {FEATURE_CATEGORIES.map((category) => {
                    const categoryKeys = category.features.map((f) => f.key);
                    return (
                      <div key={category.label}>
                        <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-baseline gap-2">
                            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {category.label}
                            </h5>
                            {category.description && (
                              <span className="text-[10px] text-muted-foreground/70">
                                {category.description}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setCategoryFeatures(categoryKeys, "additive")
                              }
                              className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                              title="Grant all in this category"
                            >
                              <CheckCheck className="w-3 h-3" />
                              Grant all
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setCategoryFeatures(categoryKeys, "deny")
                              }
                              className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors"
                              title="Deny all in this category"
                            >
                              <XCircle className="w-3 h-3" />
                              Deny all
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {category.features.map(({ key, label }) => {
                            const state = getFeatureState(key);
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => toggleFeature(key)}
                                className={cn(
                                  "flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors text-left",
                                  state === "additive"
                                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400"
                                )}
                              >
                                {state === "additive" ? (
                                  <Check className="w-3.5 h-3.5 shrink-0" />
                                ) : (
                                  <X className="w-3.5 h-3.5 shrink-0" />
                                )}
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Audio series grants */}
              {audioSeries.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3">
                    Audio Course Access
                  </h4>
                  <p className="text-[10px] text-muted-foreground mb-3">
                    Select which audio series this tag grants access to. Unselected = no restriction (visible to all).
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {audioSeries.map((series) => {
                      const granted = hasAudioSeries(series.id);
                      return (
                        <button
                          key={series.id}
                          type="button"
                          onClick={() => toggleAudioSeries(series.id)}
                          className={cn(
                            "flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors text-left",
                            granted
                              ? "border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "border-border bg-background text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <span
                            className={cn(
                              "w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center",
                              granted
                                ? "bg-blue-500 border-blue-500"
                                : "border-border"
                            )}
                          >
                            {granted && (
                              <svg
                                className="w-2.5 h-2.5 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </span>
                          <span className="truncate">{series.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Save button */}
              {dirty && (
                <div className="flex items-center gap-3 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      fetchGrants();
                      setDirty(false);
                    }}
                    className="rounded-md border border-input bg-background px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Discard
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const TAG_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6",
];

export function TagAccessClient() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [audioSeries, setAudioSeries] = useState<AudioSeries[]>([]);
  const [loading, setLoading] = useState(true);

  // Create tag form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[5]);
  const [creating, setCreating] = useState(false);
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    Promise.all([
      fetch("/api/admin/tags").then((r) => (r.ok ? r.json() : { tags: [] })),
      fetch("/api/admin/audio-course").then((r) => (r.ok ? r.json() : { series: [] })),
    ])
      .then(([tagsData, audioData]) => {
        setTags(tagsData.tags ?? []);
        // Exclude extraPack series from tag-based Audio Course Access grants —
        // those courses live on the dedicated Audio Accelerator Edition page
        // and are gated by the `audio_accelerator_edition` feature toggle.
        const series = (audioData.series ?? [])
          .filter((c: { extraPack?: boolean }) => c.extraPack !== true)
          .map(
            (c: { id: string; title: string; extraPack?: boolean }) => ({
              id: c.id,
              title: c.title,
              extraPack: c.extraPack === true,
            })
          );
        setAudioSeries(series);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateTag = async () => {
    if (!newTagName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTagName.trim(),
          color: newTagColor,
          type: "system",
        }),
      });
      if (res.ok) {
        setNewTagName("");
        setShowCreateForm(false);
        fetchData();
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTag = async (tagId: string, tagName: string) => {
    if (!confirm(`Delete tag "${tagName}"? This will remove it from all students.`)) return;
    setDeletingTagId(tagId);
    try {
      await fetch(`/api/admin/tags/${tagId}`, { method: "DELETE" });
      fetchData();
    } catch {
      // ignore
    } finally {
      setDeletingTagId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {tags.length} tag{tags.length !== 1 ? "s" : ""} configured
        </p>
        <Button
          onClick={() => setShowCreateForm(!showCreateForm)}
          variant="outline"
          size="sm"
          className="gap-1.5"
        >
          {showCreateForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showCreateForm ? "Cancel" : "Create Tag"}
        </Button>
      </div>

      {/* Create tag form */}
      {showCreateForm && (
        <div className="rounded-lg border border-dashed border-border bg-card p-4 space-y-3">
          <div className="flex gap-3">
            <Input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Tag name"
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
            />
            <Button onClick={handleCreateTag} disabled={creating || !newTagName.trim()} size="sm">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Color:</span>
            {TAG_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewTagColor(color)}
                className={cn(
                  "w-6 h-6 rounded-full border-2 transition-all",
                  newTagColor === color ? "border-foreground scale-110" : "border-transparent",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {tags.length === 0 && !showCreateForm && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            No tags exist yet. Click &ldquo;Create Tag&rdquo; to get started.
          </p>
        </div>
      )}

      {/* Tag rows */}
      {tags.map((tag) => (
        <div key={tag.id} className="relative">
          <TagRow tag={tag} audioSeries={audioSeries} />
          <button
            type="button"
            onClick={() => handleDeleteTag(tag.id, tag.name)}
            disabled={deletingTagId === tag.id}
            className="absolute top-3 right-3 p-1 rounded text-muted-foreground/50 hover:text-red-500 transition-colors"
            title={`Delete tag "${tag.name}"`}
          >
            {deletingTagId === tag.id ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
