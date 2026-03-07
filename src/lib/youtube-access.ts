import ytdl from "@distube/ytdl-core";

type YtCookie = {
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  [key: string]: unknown;
};

let parsedCookiesCache: YtCookie[] | null | undefined;
let ytdlAgentCache: ReturnType<typeof ytdl.createAgent> | null | undefined;
let cookieHeaderCache: string | null | undefined;

function parseCookiesFromEnv(): YtCookie[] | null {
  if (parsedCookiesCache !== undefined) {
    return parsedCookiesCache;
  }

  const raw = process.env.YOUTUBE_COOKIES;
  if (!raw) {
    parsedCookiesCache = null;
    return parsedCookiesCache;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      parsedCookiesCache = null;
      return parsedCookiesCache;
    }

    const normalized = parsed.filter(
      (item: unknown): item is YtCookie =>
        typeof item === "object" && item !== null && "name" in item && "value" in item,
    );
    parsedCookiesCache = normalized.length > 0 ? normalized : null;
    return parsedCookiesCache;
  } catch {
    parsedCookiesCache = null;
    return parsedCookiesCache;
  }
}

export function getYoutubeCookieHeader(): string | null {
  if (cookieHeaderCache !== undefined) {
    return cookieHeaderCache;
  }

  const cookies = parseCookiesFromEnv();
  if (!cookies || cookies.length === 0) {
    cookieHeaderCache = null;
    return cookieHeaderCache;
  }

  const pairs = cookies
    .map((cookie) => {
      const name = typeof cookie.name === "string" ? cookie.name.trim() : "";
      const value = typeof cookie.value === "string" ? cookie.value : "";
      if (!name) return null;
      return `${name}=${value}`;
    })
    .filter((item): item is string => Boolean(item));

  cookieHeaderCache = pairs.length > 0 ? pairs.join("; ") : null;
  return cookieHeaderCache;
}

export function getYoutubeYtdlAgent(): ReturnType<typeof ytdl.createAgent> | null {
  if (ytdlAgentCache !== undefined) {
    return ytdlAgentCache;
  }

  const cookies = parseCookiesFromEnv();
  if (!cookies || cookies.length === 0) {
    ytdlAgentCache = null;
    return ytdlAgentCache;
  }

  try {
    ytdlAgentCache = ytdl.createAgent(cookies as Parameters<typeof ytdl.createAgent>[0]);
    return ytdlAgentCache;
  } catch {
    ytdlAgentCache = null;
    return ytdlAgentCache;
  }
}
