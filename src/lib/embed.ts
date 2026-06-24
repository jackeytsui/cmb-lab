/**
 * Normalizes user-pasted embed input into a URL that can be stored and rendered.
 *
 * Supported inputs:
 * - a direct iframe/embed URL
 * - a full <iframe ...> snippet copied from a provider
 *
 * We intentionally extract only the src URL so the viewer can render a safe iframe.
 */
export function extractEmbedUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const direct = new URL(trimmed);
    return normalizeEmbedUrl(direct);
  } catch {
    // Fall through to iframe parsing.
  }

  const iframeSrc = trimmed.match(
    /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i,
  );
  if (iframeSrc?.[1]) {
    return normalizeEmbedUrl(iframeSrc[1].trim());
  }

  const looseSrc = trimmed.match(/\bsrc\s*=\s*["']?([^"'\s>]+)["']?/i);
  if (looseSrc?.[1]) {
    return normalizeEmbedUrl(looseSrc[1].trim());
  }

  return null;
}

export function looksLikeIframeSnippet(input: string): boolean {
  return /<iframe\b/i.test(input);
}

function normalizeEmbedUrl(input: string | URL): string {
  const url = input instanceof URL ? input : new URL(input);

  // Google Forms will render in an iframe with a plain view URL, but the
  // embedded presentation is the intended preview/student experience and is
  // what creators usually expect when pasting a share link.
  if (
    url.hostname === "docs.google.com" &&
    url.pathname.startsWith("/forms/d/e/") &&
    url.pathname.endsWith("/viewform") &&
    url.searchParams.get("embedded") !== "true"
  ) {
    url.searchParams.set("embedded", "true");
  }

  return url.toString();
}
