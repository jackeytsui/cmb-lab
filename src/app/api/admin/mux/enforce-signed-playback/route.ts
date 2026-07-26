import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { mux } from "@/lib/mux";
import { ensureSignedPlaybackId } from "@/lib/mux-signing";

export const maxDuration = 300;

/**
 * POST /api/admin/mux/enforce-signed-playback?page=1&limit=20
 *
 * Bulk-converts existing Mux assets from public to signed-only playback.
 * The playback-token endpoint already converts each asset lazily the first
 * time it's watched; this endpoint lets an admin sweep the whole catalog up
 * front instead of waiting for organic views.
 *
 * Processes one page of assets per call and reports whether another page
 * remains, so large catalogs are converted with repeated calls rather than
 * one long request. Admin only.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const page = Math.max(
    1,
    Number(request.nextUrl.searchParams.get("page")) || 1,
  );
  const limit = Math.min(
    100,
    Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 20),
  );

  const assets = await mux.video.assets.list({ page, limit });

  let scanned = 0;
  let converted = 0;
  const failures: Array<{ assetId: string; error: string }> = [];

  for (const asset of assets.data) {
    scanned++;
    const publicId = asset.playback_ids?.find(
      (p) => p.policy === "public",
    )?.id;
    if (!publicId) continue;
    try {
      await ensureSignedPlaybackId(publicId);
      converted++;
    } catch (error) {
      failures.push({
        assetId: asset.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    page,
    scanned,
    converted,
    failures,
    hasMore: assets.data.length === limit,
    nextPage: assets.data.length === limit ? page + 1 : null,
  });
}
