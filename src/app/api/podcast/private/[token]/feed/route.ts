import { NextRequest, NextResponse } from "next/server";
import { head } from "@vercel/blob";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { courses, lessons, modules, podcastTokens, users } from "@/db/schema";
import { userCanAccessAudioCourse } from "@/lib/audio-course-access";
import { logPodcastDeliveryFailure } from "@/lib/podcast-delivery-log";
import { podcastAudioFileExtension } from "@/lib/podcast-feed";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

export const maxDuration = 60;

/**
 * GET /api/podcast/private/[token]/feed
 * Private RSS podcast feed authenticated by unique student token.
 * Compatible with Spotify, Apple Podcasts, YouTube Music.
 */

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseLessonAudioUrl(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { audioUrl?: string };
    return typeof parsed.audioUrl === "string" ? parsed.audioUrl : "";
  } catch {
    return "";
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    logPodcastDeliveryFailure({
      route: "feed",
      reason: "invalid_token_format",
      token,
    });
    return new NextResponse("Invalid or expired feed token", { status: 403 });
  }

  // Validate token
  const tokenRow = await db.query.podcastTokens.findFirst({
    where: eq(podcastTokens.token, token),
  });

  if (!tokenRow) {
    logPodcastDeliveryFailure({
      route: "feed",
      reason: "token_not_found",
      token,
    });
    return new NextResponse("Invalid or expired feed token", { status: 403 });
  }

  // Get the user's name for the feed
  const user = await db.query.users.findFirst({
    where: eq(users.id, tokenRow.userId),
    columns: { id: true, name: true, role: true, deletedAt: true },
  });
  if (!user || user.deletedAt) {
    logPodcastDeliveryFailure({
      route: "feed",
      reason: "user_inactive",
      token,
      seriesId: tokenRow.seriesId,
    });
    return new NextResponse("Invalid or expired feed token", { status: 403 });
  }

  // Look up the course
  const [course] = await db
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.id, tokenRow.seriesId),
        isNull(courses.deletedAt),
        eq(courses.isPublished, true),
      ),
    );

  if (!course || !(await userCanAccessAudioCourse(user, course))) {
    logPodcastDeliveryFailure({
      route: "feed",
      reason: "course_or_access_unavailable",
      token,
      seriesId: tokenRow.seriesId,
    });
    return new NextResponse("Course not found or unpublished", { status: 404 });
  }

  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(course.description ?? "{}");
  } catch {
    // no-op
  }

  // Get lessons
  const moduleRows = await db
    .select()
    .from(modules)
    .where(and(eq(modules.courseId, tokenRow.seriesId), isNull(modules.deletedAt)))
    .orderBy(asc(modules.sortOrder));

  const moduleIds = moduleRows.map((m) => m.id);
  const lessonRows =
    moduleIds.length > 0
      ? await db
          .select()
          .from(lessons)
          .where(and(inArray(lessons.moduleId, moduleIds), isNull(lessons.deletedAt)))
          .orderBy(asc(lessons.sortOrder), asc(lessons.createdAt))
      : [];

  const baseUrl = new URL(request.url).origin;
  const feedUrl = `${baseUrl}/api/podcast/private/${token}/feed`;
  const title = course.title;
  const studentName = user?.name || "Student";
  const description =
    (meta.summary as string) ||
    `${title} — Private audio feed for ${studentName}`;
  const author = "Canto to Mando Blueprint";
  const imageUrl = course.thumbnailUrl || `${baseUrl}/canto-to-mando-logo.png`;
  const now = new Date().toUTCString();

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!blobToken) {
    logPodcastDeliveryFailure({
      route: "feed",
      reason: "audio_storage_unavailable",
      token,
      seriesId: tokenRow.seriesId,
    });
    return new NextResponse("Podcast audio is temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const itemRows = await Promise.all(
    lessonRows.map(async (lesson, index) => {
      const rawAudioUrl = parseLessonAudioUrl(lesson.content);
      if (!isPrivateVercelBlobUrl(rawAudioUrl)) return null;

      let audioBytes = 0;
      let audioContentType = "audio/mpeg";
      try {
        const audioMetadata = await head(rawAudioUrl, { token: blobToken });
        audioBytes = audioMetadata.size;
        audioContentType = audioMetadata.contentType || audioContentType;
      } catch {
        logPodcastDeliveryFailure({
          route: "feed",
          reason: "audio_metadata_unavailable",
          token,
          seriesId: tokenRow.seriesId,
          lessonId: lesson.id,
        });
        return null;
      }
      if (!Number.isSafeInteger(audioBytes) || audioBytes <= 0) {
        logPodcastDeliveryFailure({
          route: "feed",
          reason: "invalid_audio_size",
          token,
          seriesId: tokenRow.seriesId,
          lessonId: lesson.id,
        });
        return null;
      }

      // Apple requires a media extension in each enclosure URL. The audio
      // route still accepts the old extensionless form for cached feeds.
      const audioExtension = podcastAudioFileExtension(audioContentType);
      const audioUrl = `${baseUrl}/api/podcast/private/${token}/audio/${lesson.id}.${audioExtension}`;
      const lessonTitle = lesson.title;
      const lessonDescription = lesson.description || "";
      const durationSeconds = lesson.durationSeconds || 0;
      const hours = Math.floor(durationSeconds / 3600);
      const minutes = Math.floor((durationSeconds % 3600) / 60);
      const seconds = durationSeconds % 60;
      const itunesDuration =
        durationSeconds > 0
          ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
          : "";
      const pubDate = lesson.createdAt
        ? new Date(lesson.createdAt).toUTCString()
        : now;

      return `    <item>
      <title>${escapeXml(lessonTitle)}</title>
      <description>${escapeXml(lessonDescription)}</description>
      <enclosure url="${escapeXml(audioUrl)}" type="${escapeXml(audioContentType)}" length="${audioBytes}" />
      <guid isPermaLink="false">${lesson.id}-${token.slice(0, 8)}</guid>
      <pubDate>${pubDate}</pubDate>
      <itunes:episode>${index + 1}</itunes:episode>
      <itunes:title>${escapeXml(lessonTitle)}</itunes:title>
      <itunes:summary>${escapeXml(lessonDescription)}</itunes:summary>${
        itunesDuration
          ? `\n      <itunes:duration>${itunesDuration}</itunes:duration>`
          : ""
      }
      <itunes:explicit>false</itunes:explicit>
    </item>`;
    }),
  );

  const items = itemRows
    .filter(Boolean)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:spotify="http://www.spotify.com/ns/rss"
  xmlns:googleplay="http://www.google.com/schemas/play-podcasts/1.0">
  <channel>
    <title>${escapeXml(title)} (Private)</title>
    <description>${escapeXml(description)}</description>
    <language>zh</language>
    <link>${escapeXml(baseUrl)}</link>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${now}</lastBuildDate>
    <itunes:author>${escapeXml(author)}</itunes:author>
    <itunes:summary>${escapeXml(description)}</itunes:summary>
    <itunes:owner>
      <itunes:name>${escapeXml(author)}</itunes:name>
      <itunes:email>contact@thecmblueprint.com</itunes:email>
    </itunes:owner>
    <itunes:image href="${escapeXml(imageUrl)}" />
    <itunes:category text="Education">
      <itunes:category text="Language Learning" />
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>serial</itunes:type>
    <image>
      <url>${escapeXml(imageUrl)}</url>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(baseUrl)}</link>
    </image>
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "private, max-age=300",
    },
  });
}
