import { del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import {
  AUDIO_COURSE_WALKTHROUGH_SETTING_KEY,
  getAudioCourseWalkthrough,
  isValidAudioCourseWalkthroughUrl,
} from "@/lib/audio-course-walkthrough";

const SETTING_DESCRIPTION =
  "Private Vercel Blob URL for the student Audio Courses walkthrough video";

async function canManageAudioCourses() {
  return hasMinimumRole("coach");
}

async function removeBlob(url: string | null | undefined) {
  if (!url || !process.env.BLOB_READ_WRITE_TOKEN) return;

  try {
    await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (error) {
    console.error("[audio-course/walkthrough] Blob cleanup failed:", error);
  }
}

export async function GET() {
  if (!(await canManageAudioCourses())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const walkthrough = await getAudioCourseWalkthrough();
    return NextResponse.json(
      { videoUrl: walkthrough?.url ?? null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[audio-course/walkthrough] fetch failed:", error);
    return NextResponse.json(
      { error: "Failed to load walkthrough video" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!(await canManageAudioCourses())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let newUploadToCleanUp: string | null = null;
  try {
    const body = (await request.json()) as { videoUrl?: unknown };
    const videoUrl =
      typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";

    if (!isValidAudioCourseWalkthroughUrl(videoUrl)) {
      return NextResponse.json(
        { error: "A valid private Vercel Blob video URL is required" },
        { status: 400 },
      );
    }

    const previous = await getAudioCourseWalkthrough();
    if (previous?.url !== videoUrl) newUploadToCleanUp = videoUrl;
    await db
      .insert(appSettings)
      .values({
        key: AUDIO_COURSE_WALKTHROUGH_SETTING_KEY,
        value: videoUrl,
        description: SETTING_DESCRIPTION,
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: videoUrl, description: SETTING_DESCRIPTION },
      });

    if (previous?.url !== videoUrl) await removeBlob(previous?.url);
    newUploadToCleanUp = null;

    return NextResponse.json({ success: true, videoUrl });
  } catch (error) {
    await removeBlob(newUploadToCleanUp);
    console.error("[audio-course/walkthrough] update failed:", error);
    return NextResponse.json(
      { error: "Failed to save walkthrough video" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  if (!(await canManageAudioCourses())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const previous = await getAudioCourseWalkthrough();
    await db
      .delete(appSettings)
      .where(eq(appSettings.key, AUDIO_COURSE_WALKTHROUGH_SETTING_KEY));
    await removeBlob(previous?.url);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[audio-course/walkthrough] delete failed:", error);
    return NextResponse.json(
      { error: "Failed to remove walkthrough video" },
      { status: 500 },
    );
  }
}
