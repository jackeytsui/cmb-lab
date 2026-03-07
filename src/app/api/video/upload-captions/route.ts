import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, videoSessions, videoCaptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseCaptionFile } from "@/lib/captions";

/** Maximum upload size: 2 MB */
const MAX_FILE_SIZE = 2 * 1024 * 1024;

/** Allowed caption file extensions */
const ALLOWED_EXTENSIONS = [".srt", ".vtt"];

/**
 * POST /api/video/upload-captions
 *
 * Upload an SRT or VTT caption file for an existing video session.
 * Handles encoding detection for Chinese subtitle files (GB2312, GBK, Big5, etc.)
 * Replaces any existing captions for the session.
 *
 * Form data: file (File), videoSessionId (string)
 * Returns: { session, captions }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth: verify user is authenticated
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const videoSessionId = formData.get("videoSessionId") as string | null;

    if (!videoSessionId) {
      return NextResponse.json(
        { error: "Missing videoSessionId field." },
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

    // 4. Validate video session ownership
    const session = await db.query.videoSessions.findFirst({
      where: eq(videoSessions.id, videoSessionId),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Video session not found." },
        { status: 404 }
      );
    }

    if (session.userId !== user.id) {
      return NextResponse.json(
        { error: "You do not own this video session." },
        { status: 403 }
      );
    }

    // 5. Validate file
    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Include a 'file' field in the form data." },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) =>
      fileName.endsWith(ext)
    );

    if (!hasValidExtension) {
      return NextResponse.json(
        { error: "Invalid file type. Only .srt and .vtt files are accepted." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 2 MB." },
        { status: 400 }
      );
    }

    // 6. Read file into Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // 7. Parse captions
    const parsedCaptions = parseCaptionFile(buffer, file.name);

    if (parsedCaptions.length === 0) {
      return NextResponse.json(
        { error: "No captions found in file" },
        { status: 400 }
      );
    }

    // 8. Determine caption source from file extension
    const captionSource = fileName.endsWith(".srt")
      ? ("upload_srt" as const)
      : ("upload_vtt" as const);

    // 9. Delete any existing captions for this session
    await db
      .delete(videoCaptions)
      .where(eq(videoCaptions.videoSessionId, videoSessionId));

    // 10. Bulk insert new captions
    await db.insert(videoCaptions).values(
      parsedCaptions.map((c) => ({
        videoSessionId,
        sequence: c.sequence,
        startMs: c.startMs,
        endMs: c.endMs,
        text: c.text,
      }))
    );

    // 11. Update video session metadata
    const [updatedSession] = await db
      .update(videoSessions)
      .set({
        captionSource,
        captionCount: parsedCaptions.length,
        captionLang: null, // uploaded files don't have a lang code
      })
      .where(eq(videoSessions.id, videoSessionId))
      .returning();

    return NextResponse.json({
      session: updatedSession,
      captions: parsedCaptions,
    });
  } catch (error) {
    console.error("Caption upload error:", error);
    return NextResponse.json(
      { error: "Failed to process caption file. Please try again." },
      { status: 500 }
    );
  }
}
