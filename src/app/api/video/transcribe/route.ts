import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, videoSessions, videoCaptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import ytdl from "@distube/ytdl-core";
import { getYoutubeYtdlAgent } from "@/lib/youtube-access";

/**
 * POST /api/video/transcribe
 *
 * Downloads audio from a YouTube video and transcribes it using OpenAI Whisper.
 * Used as fallback when no Chinese captions are available on YouTube.
 *
 * Body: { videoId: string, sessionId?: string }
 * Returns: { session, captions, source: "whisper" }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { videoId, sessionId } = body as {
      videoId: string;
      sessionId?: string;
    };

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return NextResponse.json(
        { error: "Invalid videoId" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "placeholder") {
      return NextResponse.json(
        {
          error:
            "OpenAI API key not configured. Set OPENAI_API_KEY in .env.local to enable auto-transcription.",
        },
        { status: 500 }
      );
    }

    // Get internal user
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkUserId),
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Download audio-only stream from YouTube
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const ytdlAgent = getYoutubeYtdlAgent() ?? undefined;
    let audioStream;
    try {
      audioStream = ytdl(url, {
        filter: "audioonly",
        quality: "lowestaudio",
        agent: ytdlAgent,
        playerClients: ["WEB", "WEB_EMBEDDED", "TV", "IOS", "ANDROID"],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const lc = message.toLowerCase();
      if (
        lc.includes("playable formats") ||
        lc.includes("no such format") ||
        lc.includes("decipher") ||
        lc.includes("n-transform") ||
        lc.includes("status code: 403") ||
        lc.includes("status code: 410")
      ) {
        return NextResponse.json(
          {
            error:
              "YouTube is currently blocking server-side audio access for this video. Please upload an SRT/VTT file.",
            code: "youtube_access_blocked",
          },
          { status: 503 },
        );
      }
      throw err;
    }

    const chunks: Buffer[] = [];
    try {
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const lc = message.toLowerCase();
      if (
        lc.includes("playable formats") ||
        lc.includes("no such format") ||
        lc.includes("decipher") ||
        lc.includes("n-transform") ||
        lc.includes("status code: 403") ||
        lc.includes("status code: 410")
      ) {
        return NextResponse.json(
          {
            error:
              "YouTube is currently blocking server-side audio access for this video. Please upload an SRT/VTT file.",
            code: "youtube_access_blocked",
          },
          { status: 503 },
        );
      }
      throw err;
    }
    const audioBuffer = Buffer.concat(chunks);

    // Whisper API limit: 25MB
    if (audioBuffer.length > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Audio too large for transcription (>25MB). Try a shorter video." },
        { status: 400 }
      );
    }

    // Send to OpenAI Whisper API
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([audioBuffer], { type: "audio/webm" }),
      "audio.webm"
    );
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");
    formData.append("language", "zh");

    const whisperRes = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      }
    );

    if (!whisperRes.ok) {
      const errorData = await whisperRes.json().catch(() => null);
      console.error("Whisper API error:", whisperRes.status, errorData);
      return NextResponse.json(
        { error: "Transcription failed. Check your OpenAI API key." },
        { status: 500 }
      );
    }

    const whisperData = await whisperRes.json();

    // Format Whisper segments into CaptionLine format
    const captions = (
      whisperData.segments ?? []
    ).map(
      (
        seg: { start: number; end: number; text: string },
        i: number
      ) => ({
        text: seg.text.trim(),
        startMs: Math.round(seg.start * 1000),
        endMs: Math.round(seg.end * 1000),
        sequence: i,
      })
    );

    // Save to database
    let session;
    if (sessionId) {
      // Update existing session (created during extract-captions with 0 captions)
      const existing = await db.query.videoSessions.findFirst({
        where: and(
          eq(videoSessions.id, sessionId),
          eq(videoSessions.userId, user.id)
        ),
      });

      if (existing) {
        // Clear any old captions
        await db
          .delete(videoCaptions)
          .where(eq(videoCaptions.videoSessionId, existing.id));

        const [updated] = await db
          .update(videoSessions)
          .set({
            captionSource: "whisper_auto",
            captionLang: "zh",
            captionCount: captions.length,
          })
          .where(eq(videoSessions.id, existing.id))
          .returning();
        session = updated;
      }
    }

    if (!session) {
      // Create new session via upsert
      const [created] = await db
        .insert(videoSessions)
        .values({
          userId: user.id,
          youtubeVideoId: videoId,
          youtubeUrl: url,
          captionSource: "whisper_auto",
          captionLang: "zh",
          captionCount: captions.length,
        })
        .onConflictDoUpdate({
          target: [videoSessions.userId, videoSessions.youtubeVideoId],
          set: {
            captionSource: "whisper_auto" as const,
            captionLang: "zh",
            captionCount: captions.length,
          },
        })
        .returning();
      session = created;
    }

    // Insert transcribed captions
    if (session && captions.length > 0) {
      await db.insert(videoCaptions).values(
        captions.map(
          (c: {
            text: string;
            startMs: number;
            endMs: number;
            sequence: number;
          }) => ({
            videoSessionId: session.id,
            sequence: c.sequence,
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text,
          })
        )
      );
    }

    return NextResponse.json({
      session,
      captions,
      source: "whisper",
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}
