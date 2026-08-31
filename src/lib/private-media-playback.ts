import { NextResponse } from "next/server";
import { issueSignedToken, presignUrl } from "@vercel/blob";
import { SIGNED_MEDIA_TTL_SECONDS } from "@/lib/signed-media-url";

/** Call only AFTER the route's session, signature and course-access checks.
 * The app authorizes playback once; Blob handles buffering and byte ranges
 * directly, without 4 MiB handoffs or a serverless streaming time limit.
 * Only an expiring, single-file GET URL leaves the server, never a store token.
 */
export async function privateMediaPlaybackRedirect(
  blobUrl: string,
  label: string,
  { useCache = true }: { useCache?: boolean } = {},
): Promise<NextResponse> {
  const error = (message: string, status: number) =>
    NextResponse.json(
      { error: message },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token || /\s/.test(token)) {
    return error("Media storage is not configured", 500);
  }

  let blob: URL;
  let pathname: string;
  try {
    blob = new URL(blobUrl);
    pathname = decodeURIComponent(blob.pathname.slice(1));
    if (
      blob.protocol !== "https:" ||
      !/^[a-z0-9]+\.private\.blob\.vercel-storage\.com$/.test(blob.hostname) ||
      blob.username || blob.password || blob.port ||
      !pathname || pathname.includes("*")
    ) {
      throw new Error("Invalid private media path");
    }
  } catch {
    return error("Video storage URL is invalid", 502);
  }

  try {
    const validUntil = Date.now() + SIGNED_MEDIA_TTL_SECONDS * 1000;
    const signedToken = await issueSignedToken({
      token,
      pathname,
      operations: ["get"],
      validUntil,
      abortSignal: AbortSignal.timeout(10_000),
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      operation: "get",
      pathname,
      access: "private",
      validUntil,
      useCache,
    });
    // A URL from another store must not be silently reinterpreted as a path
    // in our store by the signer.
    if (new URL(presignedUrl).origin !== blob.origin) {
      throw new Error("Media store mismatch");
    }
    const response = NextResponse.redirect(presignedUrl, 307);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (err) {
    // SDK error messages can contain credentials; never log them or the URL.
    console.error(`[${label}] Playback signing failed:`,
      err instanceof Error ? err.name : "UnknownError");
    return error("Failed to prepare video playback", 502);
  }
}
