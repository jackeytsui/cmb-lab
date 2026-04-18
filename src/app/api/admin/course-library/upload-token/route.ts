import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";

export const maxDuration = 60;

/**
 * POST /api/admin/course-library/upload-token
 *
 * Signs a client-upload token so the browser can PUT directly to Vercel
 * Blob via @vercel/blob/client. Vercel serverless/edge routes cap at
 * ~4.5MB per request, which is less than the 5MB minimum multipart part
 * size — so anything over ~4MB must go direct. Admin-gated, pathnames
 * scoped to course-library/.
 */

// 10GB ceiling. Vercel Blob supports up to 5TB per blob; this is just a
// sanity cap to prevent runaway uploads. Raise if team starts hitting it.
const MAX_SIZE_BYTES = 10 * 1024 * 1024 * 1024;
const PATHNAME_PREFIX = "course-library/";
const ALLOWED_CONTENT_TYPES = [
  // video
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  // image
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // file attachments
  "application/pdf",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "text/markdown",
  "text/csv",
];

function isValidPathname(pathname: string): boolean {
  return pathname.startsWith(PATHNAME_PREFIX) && !pathname.includes("..");
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "Blob storage is not configured" },
        { status: 500 },
      );
    }

    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        const hasRoleAccess = await hasMinimumRole("admin");
        if (!hasRoleAccess) {
          const user = await getCurrentUser();
          if (!user) throw new Error("Forbidden");
          throw new Error("Forbidden");
        }

        if (!isValidPathname(pathname)) {
          throw new Error("Invalid upload path");
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_SIZE_BYTES,
          addRandomSuffix: true,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "Invalid upload path") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[course-library/upload-token] failed:", err);
    return NextResponse.json(
      { error: `Upload failed: ${message}` },
      { status: 500 },
    );
  }
}
