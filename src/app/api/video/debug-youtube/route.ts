import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { extractChineseCaptions, isYouTubeCaptionAccessBlocked } from "@/lib/captions";
import { getYoutubeCookieHeader, getYoutubeYtdlAgent } from "@/lib/youtube-access";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const videoId = request.nextUrl.searchParams.get("videoId");
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid videoId" }, { status: 400 });
  }

  const hasCookieHeader = Boolean(getYoutubeCookieHeader());
  const hasYtdlAgent = Boolean(getYoutubeYtdlAgent());

  let blocked = false;
  let blockedError: string | null = null;
  try {
    blocked = await isYouTubeCaptionAccessBlocked(videoId);
  } catch (error) {
    blockedError = error instanceof Error ? error.message : String(error);
  }

  let extractedCount = 0;
  let extractedLang: string | null = null;
  let extractError: string | null = null;
  try {
    const result = await extractChineseCaptions(videoId);
    if (result) {
      extractedCount = result.captions.length;
      extractedLang = result.lang;
    }
  } catch (error) {
    extractError = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json({
    ok: true,
    runtime: {
      nodeEnv: process.env.NODE_ENV ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      vercelRegion: process.env.VERCEL_REGION ?? null,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      projectUrl: process.env.VERCEL_URL ?? null,
    },
    youtubeAuth: {
      hasCookieHeader,
      hasYtdlAgent,
    },
    video: {
      videoId,
      blocked,
      blockedError,
      extractedCount,
      extractedLang,
      extractError,
    },
  });
}
