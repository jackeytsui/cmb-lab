import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";

export const maxDuration = 60;

const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;
const PATHNAME_PREFIX = "audio-course-walkthrough/";
const ALLOWED_VIDEO_CONTENT_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
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
        if (!(await hasMinimumRole("coach"))) {
          throw new Error("Forbidden");
        }
        if (!isValidPathname(pathname)) {
          throw new Error("Invalid upload path");
        }

        return {
          allowedContentTypes: ALLOWED_VIDEO_CONTENT_TYPES,
          maximumSizeInBytes: MAX_VIDEO_SIZE_BYTES,
          addRandomSuffix: true,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "Invalid upload path") {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("[audio-course/walkthrough/upload] failed:", error);
    return NextResponse.json(
      { error: `Upload failed: ${message}` },
      { status: 500 },
    );
  }
}
