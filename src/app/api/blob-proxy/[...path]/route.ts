/**
 * Reverse proxy for Vercel Blob API.
 *
 * The @vercel/blob/client SDK uploads directly to vercel.com/api/blob,
 * which doesn't include custom domains in its CORS headers. This proxy
 * sits on the same origin so no CORS is needed. Requests are streamed
 * through without buffering.
 */

const VERCEL_BLOB_API = "https://vercel.com/api/blob";

export const runtime = "edge";

async function proxy(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = `${VERCEL_BLOB_API}/${path.join("/")}`;

  // Forward query string
  const url = new URL(request.url);
  const qs = url.search;

  const headers = new Headers();
  // Forward relevant headers
  for (const [key, value] of request.headers.entries()) {
    if (
      key.startsWith("x-") ||
      key === "authorization" ||
      key === "content-type" ||
      key === "content-length"
    ) {
      headers.set(key, value);
    }
  }

  const res = await fetch(`${target}${qs}`, {
    method: request.method,
    headers,
    body: request.body,
    // @ts-expect-error duplex is needed for streaming request bodies
    duplex: "half",
  });

  // Forward response back
  const responseHeaders = new Headers();
  for (const [key, value] of res.headers.entries()) {
    responseHeaders.set(key, value);
  }

  return new Response(res.body, {
    status: res.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
