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
    return direct.toString();
  } catch {
    // Fall through to iframe parsing.
  }

  const iframeSrc = trimmed.match(
    /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i,
  );
  if (iframeSrc?.[1]) {
    return iframeSrc[1].trim() || null;
  }

  const looseSrc = trimmed.match(/\bsrc\s*=\s*["']?([^"'\s>]+)["']?/i);
  if (looseSrc?.[1]) {
    return looseSrc[1].trim() || null;
  }

  return null;
}

export function looksLikeIframeSnippet(input: string): boolean {
  return /<iframe\b/i.test(input);
}
