import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";

/**
 * GET /api/admin/test-supadata?videoId=CcHWoRtK0fw
 * Diagnostic endpoint to test Supadata API connectivity.
 * Admin-only.
 */
export async function GET(request: Request) {
  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const videoId = url.searchParams.get("videoId") || "CcHWoRtK0fw";
  const apiKey = process.env.SUPADATA_API_KEY;

  const diagnostics: Record<string, unknown> = {
    videoId,
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.slice(0, 8) + "..." : null,
    envKeys: Object.keys(process.env).filter((k) => k.toLowerCase().includes("supadata")),
  };

  if (!apiKey) {
    return NextResponse.json({
      ...diagnostics,
      error: "SUPADATA_API_KEY not found in environment variables",
    });
  }

  // Test with zh-Hans first
  const langCodes = ["zh-Hans", "zh-CN", "zh-TW", "zh"];
  const results: Array<Record<string, unknown>> = [];

  for (const lang of langCodes) {
    try {
      const apiUrl = `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&lang=${lang}`;
      const res = await fetch(apiUrl, {
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
      });

      const body = await res.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = body.slice(0, 500);
      }

      results.push({
        lang,
        status: res.status,
        ok: res.ok,
        contentType: res.headers.get("content-type"),
        bodyPreview: typeof parsed === "object" && parsed !== null
          ? {
              keys: Object.keys(parsed as Record<string, unknown>),
              lang: (parsed as Record<string, unknown>).lang,
              availableLangs: (parsed as Record<string, unknown>).availableLangs,
              contentType: Array.isArray((parsed as Record<string, unknown>).content)
                ? `array[${((parsed as Record<string, unknown>).content as unknown[]).length}]`
                : typeof (parsed as Record<string, unknown>).content,
              error: (parsed as Record<string, unknown>).error,
              message: (parsed as Record<string, unknown>).message,
            }
          : parsed,
      });

      // Stop after first success
      if (res.ok) break;
    } catch (err) {
      results.push({
        lang,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ...diagnostics, results });
}
