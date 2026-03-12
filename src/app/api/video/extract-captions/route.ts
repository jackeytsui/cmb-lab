import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import {
  users,
  videoSessions,
  videoCaptions,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import {
  extractChineseCaptions,
  extractEnglishCaptions,
  isYouTubeCaptionAccessBlocked,
} from "@/lib/captions";

/**
 * POST /api/video/extract-captions
 *
 * Extracts Chinese captions from a YouTube video.
 * Tries multiple Chinese language codes (zh, zh-Hans, zh-Hant, zh-CN, zh-TW)
 * and uses the first that succeeds.
 *
 * If captions already exist for the user+video combination, returns cached data.
 *
 * Body: { videoId: string, url: string }
 * Returns: { session, captions, cached } | { session: null, captions: null, error: string }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth: verify user is authenticated
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const { videoId, url } = body as { videoId: string; url: string };

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return NextResponse.json(
        { error: "Invalid videoId. Must be an 11-character YouTube video ID." },
        { status: 400 }
      );
    }

    if (!url) {
      return NextResponse.json(
        { error: "Missing url field." },
        { status: 400 }
      );
    }

    // 3. Get internal user from DB
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkUserId),
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // 4. Check for existing session with captions
    const existingSession = await db.query.videoSessions.findFirst({
      where: and(
        eq(videoSessions.userId, user.id),
        eq(videoSessions.youtubeVideoId, videoId)
      ),
    });

    if (existingSession && existingSession.captionCount > 0) {
      // Fetch cached captions
      const cachedCaptions = await db.query.videoCaptions.findMany({
        where: eq(videoCaptions.videoSessionId, existingSession.id),
        orderBy: [asc(videoCaptions.sequence)],
      });

      return NextResponse.json({
        session: existingSession,
        captions: cachedCaptions.map((c) => ({
          text: c.text,
          startMs: c.startMs,
          endMs: c.endMs,
          sequence: c.sequence,
        })),
        englishCaptions: null,
        cached: true,
      });
    }

    // 5. Extract captions from YouTube
    console.log(`[extract-captions] Starting extraction for videoId=${videoId}, hasSupadataKey=${!!process.env.SUPADATA_API_KEY}`);
    const result = await extractChineseCaptions(videoId);
    console.log(`[extract-captions] Result: ${result ? `${result.captions.length} captions (lang=${result.lang})` : "null"}`);

    if (!result) {
      const youtubeBlocked = await isYouTubeCaptionAccessBlocked(videoId);
      // Create session even without captions so user can upload manually
      const [emptySession] = await db
        .insert(videoSessions)
        .values({
          userId: user.id,
          youtubeVideoId: videoId,
          youtubeUrl: url,
          captionSource: "youtube_auto",
          captionLang: null,
          captionCount: 0,
        })
        .onConflictDoUpdate({
          target: [videoSessions.userId, videoSessions.youtubeVideoId],
          set: {
            youtubeUrl: url,
            captionCount: 0,
            captionLang: null,
          },
        })
        .returning();

      return NextResponse.json({
        session: emptySession,
        captions: null,
        englishCaptions: null,
        error: youtubeBlocked ? "youtube_access_blocked" : "no_chinese_captions",
        debug: {
          hasSupadataKey: !!process.env.SUPADATA_API_KEY,
          youtubeBlocked,
        },
      });
    }

    // 5b. Extract English captions (optional -- don't fail if unavailable)
    const englishCaptions = await extractEnglishCaptions(videoId);

    // 6. Create or update video session via upsert
    const [session] = await db
      .insert(videoSessions)
      .values({
        userId: user.id,
        youtubeVideoId: videoId,
        youtubeUrl: url,
        captionSource: "youtube_auto",
        captionLang: result.lang,
        captionCount: result.captions.length,
      })
      .onConflictDoUpdate({
        target: [videoSessions.userId, videoSessions.youtubeVideoId],
        set: {
          youtubeUrl: url,
          captionSource: "youtube_auto" as const,
          captionLang: result.lang,
          captionCount: result.captions.length,
        },
      })
      .returning();

    // 7. Bulk insert captions
    if (result.captions.length > 0) {
      await db.insert(videoCaptions).values(
        result.captions.map((c) => ({
          videoSessionId: session.id,
          sequence: c.sequence,
          startMs: c.startMs,
          endMs: c.endMs,
          text: c.text,
        }))
      );
    }

    return NextResponse.json({
      session,
      captions: result.captions,
      englishCaptions: englishCaptions ?? null,
      cached: false,
    });
  } catch (error) {
    console.error("Caption extraction error:", error);
    return NextResponse.json(
      { error: "Failed to extract captions" },
      { status: 500 }
    );
  }
}
