"use client";

import { useState, useEffect, useCallback } from "react";
import { ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { TagBadge } from "@/components/tags/TagBadge";

interface GhlField {
  label: string;
  value: string | null;
}

interface GhlProfileData {
  data: Record<string, unknown> | null;
  lastFetchedAt: string | null;
  fields: GhlField[];
  ghlContactId: string | null;
  ghlDeepLink: string | null;
}

interface GhlProfileSectionProps {
  studentId: string;
}

/**
 * GhlProfileSection - Card showing GHL CRM data on a student profile.
 *
 * Features:
 * - Header with "CRM Profile" title, freshness indicator, and "View in GHL" link
 * - 2-column grid of resolved custom fields
 * - Tags section showing GHL-synced tags
 * - Refresh button to force re-fetch from GHL
 * - Graceful "Not linked to GHL" state
 */
export function GhlProfileSection({ studentId }: GhlProfileSectionProps) {
  const [profile, setProfile] = useState<GhlProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = useCallback(
    async (forceRefresh = false) => {
      try {
        const url = `/api/students/${studentId}/ghl-profile${forceRefresh ? "?refresh=true" : ""}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        }
      } catch (error) {
        console.error("Failed to fetch GHL profile:", error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [studentId]
  );

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchProfile(true);
  };

  if (loading) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
        <div className="flex items-center gap-2 text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading CRM profile...</span>
        </div>
      </div>
    );
  }

  // Not linked state
  if (!profile?.data) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-2">CRM Profile</h3>
        <p className="text-zinc-500 text-sm">
          Not linked to GoHighLevel. This student does not have an associated GHL contact.
        </p>
      </div>
    );
  }

  const freshnessText = profile.lastFetchedAt
    ? formatDistanceToNow(new Date(profile.lastFetchedAt), { addSuffix: true })
    : "Unknown";

  // Extract tags from profile data if available
  const ghlTags: string[] = Array.isArray((profile.data as Record<string, unknown>)?.tags)
    ? ((profile.data as Record<string, unknown>).tags as string[])
    : [];

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">CRM Profile</h3>
        <div className="flex items-center gap-3">
          {/* Freshness indicator */}
          <span className="text-xs text-zinc-500">
            Updated {freshnessText}
          </span>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white disabled:opacity-50"
            title="Refresh from GHL"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>

          {/* View in GHL deep link */}
          {profile.ghlDeepLink && (
            <a
              href={profile.ghlDeepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              View in GHL
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Custom fields grid */}
      {profile.fields && profile.fields.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {profile.fields.map((field, index) => (
            <div key={index}>
              <dt className="text-xs text-zinc-500 mb-0.5">{field.label}</dt>
              <dd className="text-sm text-white">
                {field.value || (
                  <span className="text-zinc-600 italic">Not set</span>
                )}
              </dd>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500 mb-4">
          No custom fields mapped. Configure field mappings in GHL settings.
        </p>
      )}

      {/* GHL Tags */}
      {ghlTags.length > 0 && (
        <div className="border-t border-zinc-800 pt-3">
          <span className="text-xs text-zinc-500 mr-2">GHL Tags:</span>
          <div className="inline-flex flex-wrap gap-1 mt-1">
            {ghlTags.map((tagName, i) => (
              <TagBadge
                key={i}
                name={tagName}
                color="#64748b"
                type="system"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
