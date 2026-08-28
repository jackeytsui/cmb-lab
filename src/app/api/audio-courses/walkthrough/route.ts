import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAudioCourseWalkthrough } from "@/lib/audio-course-walkthrough";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { userCanUseFeature } from "@/lib/feature-access";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await userCanUseFeature(user, "audio_courses"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const walkthrough = await getAudioCourseWalkthrough();
  if (!walkthrough) {
    return NextResponse.json(
      { error: "Walkthrough video not found" },
      { status: 404 },
    );
  }

  return proxyBlobMedia(request, walkthrough.url, {
    fallbackContentType: "video/mp4",
    label: "audio-courses/walkthrough",
  });
}
