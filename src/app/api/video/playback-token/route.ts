import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { resolveSignedPlayback } from "@/lib/mux-signing";

/**
 * GET /api/video/playback-token?playbackId=...
 *
 * Issues short-lived signed playback tokens for Mux video to any logged-in
 * user. Also the enforcement point for the signed-playback rollout: the
 * first time a still-public playback ID is requested, the underlying asset
 * is converted to signed-only (stored references rewritten, public playback
 * ID deleted), so the catalog seals itself as videos are watched.
 *
 * Response: { playbackId, tokens: { playback, thumbnail, storyboard } }
 * The returned playbackId may differ from the requested one when the asset
 * was upgraded or the requested ID was already retired — players must use
 * the returned ID.
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playbackId = request.nextUrl.searchParams.get("playbackId")?.trim();
  if (!playbackId || !/^[a-zA-Z0-9]+$/.test(playbackId)) {
    return NextResponse.json(
      { error: "A valid playbackId is required" },
      { status: 400 },
    );
  }

  try {
    const resolved = await resolveSignedPlayback(playbackId);
    return NextResponse.json(resolved, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[video/playback-token] failed:", error);
    return NextResponse.json(
      { error: "Could not issue playback token" },
      { status: 502 },
    );
  }
}
