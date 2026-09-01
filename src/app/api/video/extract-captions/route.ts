import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import {
  users,
  videoSessions,
  videoCaptions,
} from "@/db/schema";
import { eq, and, asc, gte, count } from "drizzle-orm";
import {
  coalesceCaptions,
  extractChineseCaptions,
  isYouTubeCaptionAccessBlocked,
  type NormalizedCaption,
} from "@/lib/captions";
import { getTranscriptLimitSettings, getPeriodStart } from "@/lib/usage-limits";
import { extractVideoId } from "@/lib/youtube";

export const maxDuration = 60;

const CAPTION_INSERT_BATCH_SIZE = 500;

async function replaceStoredCaptions(
  videoSessionId: string,
  captions: NormalizedCaption[]
) {
  await db
    .update(videoSessions)
    .set({ captionCount: 0 })
    .where(eq(videoSessions.id, videoSessionId));
  await db
    .delete(videoCaptions)
    .where(eq(videoCaptions.videoSessionId, videoSessionId));

  for (
    let index = 0;
    index < captions.length;
    index += CAPTION_INSERT_BATCH_SIZE
  ) {
    const batch = captions.slice(index, index + CAPTION_INSERT_BATCH_SIZE);
    await db.insert(videoCaptions).values(
      batch.map((caption) => ({
        videoSessionId,
        sequence: caption.sequence,
        startMs: caption.startMs,
        endMs: caption.endMs,
        text: caption.text,
      }))
    );
  }

  const [completedSession] = await db
    .update(videoSessions)
    .set({ captionCount: captions.length })
    .where(eq(videoSessions.id, videoSessionId))
    .returning();
  if (!completedSession) {
    throw new Error(`Failed to persist captions for session ${videoSessionId}`);
  }
  return completedSession;
}

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

    if (!url || extractVideoId(url) !== videoId) {
      return NextResponse.json(
        { error: "URL must be a valid YouTube URL for the supplied videoId." },
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

      if (cachedCaptions.length > 0) {
        const cachedNormalized = cachedCaptions.map((caption) => ({
          text: caption.text,
          startMs: caption.startMs,
          endMs: caption.endMs,
          sequence: caption.sequence,
        }));
        const optimizedCaptions = coalesceCaptions(cachedNormalized);
        let cachedSession = existingSession;

        if (optimizedCaptions.length < cachedNormalized.length) {
          console.log(
            `[extract-captions] Repairing granular cache for videoId=${videoId}, before=${cachedNormalized.length}, after=${optimizedCaptions.length}`
          );
          cachedSession = await replaceStoredCaptions(
            existingSession.id,
            optimizedCaptions
          );
        }

        return NextResponse.json({
          session: cachedSession,
          captions: optimizedCaptions,
          englishCaptions: null,
          cached: true,
        });
      }
      // Recover from a prior interrupted write instead of returning a false
      // cache hit with zero transcript rows.
      await db
        .update(videoSessions)
        .set({ captionCount: 0 })
        .where(eq(videoSessions.id, existingSession.id));
    }

    // 4b. Usage limit check for students (cached results above are free)
    if (user.role === "student") {
      try {
        const { limitCount, period } = await getTranscriptLimitSettings();
        const periodStart = getPeriodStart(period);
        const [usageResult] = await db
          .select({ total: count() })
          .from(videoSessions)
          .where(
            and(
              eq(videoSessions.userId, user.id),
              gte(videoSessions.createdAt, periodStart)
            )
          );
        const used = Number(usageResult?.total ?? 0);
        if (used >= limitCount) {
          return NextResponse.json(
            {
              error: "usage_limit_reached",
              used,
              limit: limitCount,
              period,
            },
            { status: 429 }
          );
        }
      } catch (err) {
        // If settings table doesn't exist yet, skip limit check
        console.warn("[extract-captions] Usage limit check failed, skipping:", err);
      }
    }

    // 5. Extract captions from YouTube
    const extractionStartedAt = Date.now();
    console.log(
      `[extract-captions] Starting extraction for videoId=${videoId}, hasSupadataKey=${!!process.env.SUPADATA_API_KEY}`
    );
    const rawResult = await extractChineseCaptions(videoId);
    const result = rawResult
      ? { ...rawResult, captions: coalesceCaptions(rawResult.captions) }
      : null;
    console.log(
      `[extract-captions] Result: ${
        result ? `${result.captions.length} captions (lang=${result.lang})` : "null"
      }, elapsedMs=${Date.now() - extractionStartedAt}`
    );

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

    // 6. Create or update video session via upsert
    const [session] = await db
      .insert(videoSessions)
      .values({
        userId: user.id,
        youtubeVideoId: videoId,
        youtubeUrl: url,
        captionSource: "youtube_auto",
        captionLang: result.lang,
        captionCount: 0,
      })
      .onConflictDoUpdate({
        target: [videoSessions.userId, videoSessions.youtubeVideoId],
        set: {
          youtubeUrl: url,
          captionSource: "youtube_auto" as const,
          captionLang: result.lang,
          captionCount: 0,
        },
      })
      .returning();

    // 7. Replace captions in bounded batches. Keep metadata at zero until
    // every row is written so interrupted requests cannot produce false hits.
    const completedSession = await replaceStoredCaptions(
      session.id,
      result.captions
    );

    return NextResponse.json({
      session: completedSession,
      captions: result.captions,
      // English is translated on demand in the client. Keeping it out of the
      // critical load path avoids a second provider request and rate limits.
      englishCaptions: null,
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
