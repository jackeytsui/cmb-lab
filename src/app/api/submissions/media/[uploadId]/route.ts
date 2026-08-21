import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studentMediaUploads } from "@/db/schema";
import { getRealUser } from "@/lib/auth";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = await params;
  const upload = await db.query.studentMediaUploads.findFirst({
    where: eq(studentMediaUploads.id, uploadId),
  });
  if (
    !upload ||
    (upload.userId !== user.id && user.role !== "coach" && user.role !== "admin")
  ) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  if (
    process.env.NODE_ENV !== "production" &&
    upload.blobUrl.startsWith("/uploads/submissions/")
  ) {
    return NextResponse.redirect(new URL(upload.blobUrl, request.url));
  }
  if (!isPrivateVercelBlobUrl(upload.blobUrl)) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  return proxyBlobMedia(request, upload.blobUrl, {
    fallbackContentType: upload.contentType,
    label: "submissions/media",
    extraHeaders: { "Content-Disposition": "inline" },
  });
}
