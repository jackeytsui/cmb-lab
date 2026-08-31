import "server-only";

import { isCustomizedTitle } from "@/lib/customized-content";
import { userCanUseFeature } from "@/lib/feature-access";
import {
  getRestrictedContentIds,
  getUserContentGrants,
} from "@/lib/tag-feature-access";
import { hasFullFeatureAccess } from "@/lib/platform-roles";

type AudioCourseRecord = {
  id: string;
  title: string;
  description: string | null;
};

export function parseAudioCourseMetadata(
  description: string | null,
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(description ?? "{}");
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function isStandardAudioCourse(course: AudioCourseRecord): boolean {
  const metadata = parseAudioCourseMetadata(course.description);
  return metadata.audioCourse === true && metadata.extraPack !== true;
}

export function isExtraPackAudioCourse(course: AudioCourseRecord): boolean {
  const metadata = parseAudioCourseMetadata(course.description);
  return metadata.audioCourse === true && metadata.extraPack === true;
}

export function audioCourseAllowedUserIds(
  course: AudioCourseRecord,
): string[] {
  const value = parseAudioCourseMetadata(course.description).allowedUserIds;
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];
}

export function isRestrictedAudioCourse(
  course: AudioCourseRecord,
  restrictedIds: ReadonlySet<string>,
): boolean {
  const metadata = parseAudioCourseMetadata(course.description);
  return (
    isCustomizedTitle(course.title) ||
    metadata.customCourse === true ||
    restrictedIds.has(course.id) ||
    audioCourseAllowedUserIds(course).length > 0
  );
}

/** Whether a published audio series may be exposed through the public RSS feed. */
export async function isPublicAudioCourse(
  course: AudioCourseRecord,
): Promise<boolean> {
  if (!isStandardAudioCourse(course)) return false;
  const restrictedIds = await getRestrictedContentIds("audio_series");
  return !isRestrictedAudioCourse(course, restrictedIds);
}

/** Authoritative entitlement check for private podcast feeds and token creation. */
export async function userCanAccessAudioCourse(
  user: { id: string; role: string },
  course: AudioCourseRecord,
): Promise<boolean> {
  const isStandard = isStandardAudioCourse(course);
  const isExtraPack = isExtraPackAudioCourse(course);
  if (!isStandard && !isExtraPack) return false;
  if (isExtraPack) {
    return userCanUseFeature(user, "audio_accelerator_edition");
  }

  if (hasFullFeatureAccess(user.role)) return true;

  if (!(await userCanUseFeature(user, "audio_courses"))) return false;

  const [grantedIds, restrictedIds] = await Promise.all([
    getUserContentGrants(user.id, "audio_series"),
    getRestrictedContentIds("audio_series"),
  ]);
  if (!isRestrictedAudioCourse(course, restrictedIds)) return true;
  return (
    grantedIds.has(course.id) ||
    audioCourseAllowedUserIds(course).includes(user.id)
  );
}
