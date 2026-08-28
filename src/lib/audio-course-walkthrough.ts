import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

export const AUDIO_COURSE_WALKTHROUGH_SETTING_KEY =
  "audio_course_walkthrough_blob_url";

export type AudioCourseWalkthrough = {
  url: string;
  version: string;
};

export function isValidAudioCourseWalkthroughUrl(
  value: unknown,
): value is string {
  return typeof value === "string" && isPrivateVercelBlobUrl(value.trim());
}

function versionFromUrl(url: string): string {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() ?? "current";
  } catch {
    return "current";
  }
}

export async function getAudioCourseWalkthrough(): Promise<
  AudioCourseWalkthrough | null
> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, AUDIO_COURSE_WALKTHROUGH_SETTING_KEY),
    columns: { value: true },
  });
  const url = row?.value.trim();
  if (!isValidAudioCourseWalkthroughUrl(url)) return null;

  return { url, version: versionFromUrl(url) };
}
