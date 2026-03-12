import { NextResponse } from "next/server";

/**
 * GET /api/debug/supadata?videoId=CcHWoRtK0fw
 *
 * TEMPORARY public diagnostic endpoint to test Supadata API connectivity.
 * TODO: Remove or add auth after debugging is complete.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get("videoId") || "CcHWoRtK0fw";
  const apiKey = process.env.SUPADATA_API_KEY;

  const diagnostics: Record<string, unknown> = {
    videoId,
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.slice(0, 8) + "..." : null,
    envKeys: Object.keys(process.env).filter((k) =>
      k.toLowerCase().includes("supadata")
    ),
  };

  if (!apiKey) {
    return NextResponse.json({
      ...diagnostics,
      error: "SUPADATA_API_KEY not found in environment variables",
    });
  }

  // Test without lang first (get default), then specific Chinese codes
  const langCodes = ["", "zh-Hans", "zh-CN", "zh-TW", "zh", "yue"];
  const results: Array<Record<string, unknown>> = [];

  for (const lang of langCodes) {
    try {
      const params = new URLSearchParams({ videoId });
      if (lang) params.set("lang", lang);
      const apiUrl = `https://api.supadata.ai/v1/youtube/transcript?${params}`;

      const res = await fetch(apiUrl, {
        headers: {
          "x-api-key": apiKey,
        },
      });

      const body = await res.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = body.slice(0, 500);
      }

      const entry: Record<string, unknown> = {
        lang: lang || "(default)",
        status: res.status,
        ok: res.ok,
      };

      if (typeof parsed === "object" && parsed !== null) {
        const p = parsed as Record<string, unknown>;
        entry.responseLang = p.lang;
        entry.availableLangs = p.availableLangs;
        entry.contentType = Array.isArray(p.content)
          ? `array[${(p.content as unknown[]).length}]`
          : typeof p.content;
        if (Array.isArray(p.content) && (p.content as unknown[]).length > 0) {
          entry.firstItem = (p.content as unknown[])[0];
        }
        if (p.error) entry.error = p.error;
        if (p.message) entry.message = p.message;
      } else {
        entry.bodyPreview = parsed;
      }

      results.push(entry);

      // Stop after first success with content
      if (res.ok && typeof parsed === "object" && parsed !== null) {
        const p = parsed as Record<string, unknown>;
        if (Array.isArray(p.content) && (p.content as unknown[]).length > 0) {
          break;
        }
      }
    } catch (err) {
      results.push({
        lang: lang || "(default)",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ...diagnostics, results }, { status: 200 });
}
