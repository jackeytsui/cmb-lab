// ---------------------------------------------------------------------------
// Review recording links: validation + embed resolution.
//
// Reviewers may paste any valid http(s) URL. Loom links (and YouTube/Vimeo)
// embed as an inline player on the student feedback page; anything else
// renders as a safe clickable link card.
// ---------------------------------------------------------------------------

export type RecordingEmbed =
  | { kind: "loom" | "youtube" | "vimeo"; url: string; embedUrl: string }
  | { kind: "link"; url: string };

/** Returns a normalized http(s) URL string, or null if not a valid URL. */
export function sanitizeRecordingUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** True if the URL points at loom.com (used for the non-Loom warning). */
export function isLoomUrl(input: string): boolean {
  try {
    return hostMatches(new URL(input.trim()).hostname, "loom.com");
  } catch {
    return false;
  }
}

/**
 * Resolve how a recording URL should be presented. Returns null for invalid
 * or non-http(s) URLs.
 */
export function parseRecordingEmbed(input: string): RecordingEmbed | null {
  const sanitized = sanitizeRecordingUrl(input);
  if (!sanitized) return null;
  const url = new URL(sanitized);
  const host = url.hostname;

  // Loom: https://www.loom.com/share/{id} → https://www.loom.com/embed/{id}
  if (hostMatches(host, "loom.com")) {
    const match = url.pathname.match(/^\/(?:share|embed)\/([a-zA-Z0-9]+)/);
    if (match) {
      return {
        kind: "loom",
        url: sanitized,
        embedUrl: `https://www.loom.com/embed/${match[1]}`,
      };
    }
  }

  // YouTube: watch?v=, /embed/{id}, /shorts/{id}, youtu.be/{id}
  if (hostMatches(host, "youtube.com") || hostMatches(host, "youtu.be")) {
    let videoId: string | null = null;
    if (hostMatches(host, "youtu.be")) {
      videoId = url.pathname.slice(1).split("/")[0] || null;
    } else if (url.searchParams.get("v")) {
      videoId = url.searchParams.get("v");
    } else {
      const match = url.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/);
      videoId = match?.[1] ?? null;
    }
    if (videoId && /^[\w-]{5,20}$/.test(videoId)) {
      return {
        kind: "youtube",
        url: sanitized,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
      };
    }
  }

  // Vimeo: https://vimeo.com/{id} → https://player.vimeo.com/video/{id}
  if (hostMatches(host, "vimeo.com")) {
    const match = url.pathname.match(/^\/(\d+)/);
    if (match) {
      return {
        kind: "vimeo",
        url: sanitized,
        embedUrl: `https://player.vimeo.com/video/${match[1]}`,
      };
    }
  }

  return { kind: "link", url: sanitized };
}
