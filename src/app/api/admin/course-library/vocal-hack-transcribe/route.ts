import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasCourseContentAccess } from "@/lib/auth";
import { transcribeVocalHackVideo } from "@/lib/vocal-hack-transcription";

export const maxDuration = 60;
export const runtime = "nodejs";

const requestSchema = z.object({
  videoUrl: z.string().url(),
  language: z.enum(["mandarin", "cantonese"]),
});

function isCourseLibraryVideoUrl(value: string) {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname.slice(1));
    return (
      url.protocol === "https:" &&
      /^[a-z0-9]+\.private\.blob\.vercel-storage\.com$/.test(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      pathname.startsWith("course-library/video/") &&
      !pathname.includes("..") &&
      !pathname.includes("*")
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!(await hasCourseContentAccess())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success || !isCourseLibraryVideoUrl(parsed.data.videoUrl)) {
    return NextResponse.json(
      { error: "Invalid Vocal Hack transcription request" },
      { status: 400 },
    );
  }

  try {
    const result = await transcribeVocalHackVideo({
      ...parsed.data,
      context:
        parsed.data.language === "cantonese"
          ? "Course Library Vocal Hack (Canto) upload"
          : "Course Library Vocal Hack upload",
    });
    return NextResponse.json({
      chinese: result.chinese,
      pinyin: result.pinyin,
      english: result.english,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI transcription failed";
    console.error("[course-library/vocal-hack-transcribe]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
