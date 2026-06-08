import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";

/**
 * GET /api/internal-docs/pdf?url=<blob-url>
 * Proxies a private Vercel Blob PDF to authorized coaches and admins.
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const blobRes = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });

  if (!blobRes.ok) {
    return NextResponse.json({ error: "Failed to fetch PDF" }, { status: blobRes.status });
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", "application/pdf");
  const cl = blobRes.headers.get("content-length");
  if (cl) responseHeaders.set("Content-Length", cl);
  responseHeaders.set("Cache-Control", "private, max-age=300");

  return new NextResponse(blobRes.body, { status: 200, headers: responseHeaders });
}
