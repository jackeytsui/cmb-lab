import type { PlatformRole } from "@/lib/platform-roles";

export const ANNOUNCEMENT_AUDIENCE_MODES = ["all", "targeted"] as const;

export type AnnouncementAudienceMode =
  (typeof ANNOUNCEMENT_AUDIENCE_MODES)[number];

export type AnnouncementAudience = {
  audienceMode: AnnouncementAudienceMode;
  audienceTagIds: string[];
  audienceRoles: PlatformRole[];
};

/**
 * Targeted broadcasts use restrictive AND semantics across audience groups:
 * - selected roles: the account must have one of them;
 * - selected tags: the account must have at least one of them;
 * - leaving either group empty means that group does not restrict delivery.
 */
export function announcementMatchesAudience(
  announcement: AnnouncementAudience,
  user: { role: PlatformRole; tagIds: Iterable<string> },
): boolean {
  if (announcement.audienceMode === "all") return true;

  const roleMatches =
    announcement.audienceRoles.length === 0 ||
    announcement.audienceRoles.includes(user.role);
  if (!roleMatches) return false;

  if (announcement.audienceTagIds.length === 0) return true;
  const userTagIds = new Set(user.tagIds);
  return announcement.audienceTagIds.some((tagId) => userTagIds.has(tagId));
}
