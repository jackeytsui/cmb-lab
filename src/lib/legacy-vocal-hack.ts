/**
 * Two published Advanced lessons still point to their live legacy VideoAsk
 * flows. Detect only that narrow, known-safe fallback so the student viewer
 * can replace stale screenshot-upload instructions with an accurate handoff.
 */
export function legacyVideoAskUrl({
  lessonType,
  title,
  html,
}: {
  lessonType: string;
  title: string;
  html: unknown;
}): string | null {
  if (
    lessonType !== "text" ||
    !/vocal\s+hack/i.test(title) ||
    typeof html !== "string"
  ) {
    return null;
  }

  const href = html.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!href) return null;

  try {
    const url = new URL(href.replaceAll("&amp;", "&"));
    if (
      url.protocol !== "https:" ||
      (url.hostname !== "videoask.com" && url.hostname !== "www.videoask.com")
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
