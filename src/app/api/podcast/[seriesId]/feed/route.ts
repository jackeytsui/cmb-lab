import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { courses, lessons, modules } from "@/db/schema";

/**
 * GET /api/podcast/[seriesId]/feed
 * Returns an RSS 2.0 podcast feed XML for a given audio course series.
 * This feed is compatible with Spotify, Apple Podcasts, and YouTube Music.
 *
 * This is a PUBLIC endpoint — no auth required so podcast apps can fetch it.
 * Only published courses are served.
 */

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseMeta(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed.audioCourse === true ? parsed : {};
  } catch {
    return {};
  }
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
  { params }: { params: Promise<{ seriesId: string }> },
) {
  const { seriesId } = await params;

  // Look up the course
  const [course] = await db
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.id, seriesId),
        isNull(courses.deletedAt),
        eq(courses.isPublished, true),
      ),
    );

  if (!course) {
    return new NextResponse("Podcast feed not found", { status: 404 });
  }

  const meta = parseMeta(course.description);
  if (!meta.audioCourse) {
    return new NextResponse("Not an audio course", { status: 404 });
  }

  // Get modules and lessons
  const moduleRows = await db
    .select()
    .from(modules)
    .where(and(eq(modules.courseId, seriesId), isNull(modules.deletedAt)))
    .orderBy(asc(modules.sortOrder));

  const moduleIds = moduleRows.map((m) => m.id);
  const lessonRows =
    moduleIds.length > 0
      ? await db
          .select()
          .from(lessons)
          .where(
            and(inArray(lessons.moduleId, moduleIds), isNull(lessons.deletedAt)),
          )
          .orderBy(asc(lessons.sortOrder), asc(lessons.createdAt))
      : [];

  // Build the base URL from the request
  const baseUrl = new URL(request.url).origin;
  const feedUrl = `${baseUrl}/api/podcast/${seriesId}/feed`;
  const title = course.title;
  const description = (meta.summary as string) || `${title} — Audio lessons from Canto to Mando Blueprint`;
  const author = "Canto to Mando Blueprint";
  const imageUrl = course.thumbnailUrl || `${baseUrl}/canto-to-mando-logo.png`;
  const now = new Date().toUTCString();

  // Build RSS items
  const items = lessonRows
    .map((lesson, index) => {
      const audioUrl = parseLessonAudioUrl(lesson.content);
      if (!audioUrl) return null;

      const lessonTitle = lesson.title;
      const lessonDescription = lesson.description || "";
      const durationSeconds = lesson.durationSeconds || 0;
      const hours = Math.floor(durationSeconds / 3600);
      const minutes = Math.floor((durationSeconds % 3600) / 60);
      const seconds = durationSeconds % 60;
      const itunesDuration = durationSeconds > 0
        ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
        : "";
      const pubDate = lesson.createdAt
        ? new Date(lesson.createdAt).toUTCString()
        : now;

      return `    <item>
      <title>${escapeXml(lessonTitle)}</title>
      <description>${escapeXml(lessonDescription)}</description>
      <enclosure url="${escapeXml(audioUrl)}" type="audio/mpeg" length="0" />
      <guid isPermaLink="false">${lesson.id}</guid>
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
    })
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
    <title>${escapeXml(title)}</title>
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
    <googleplay:author>${escapeXml(author)}</googleplay:author>
    <googleplay:description>${escapeXml(description)}</googleplay:description>
    <googleplay:image href="${escapeXml(imageUrl)}" />
    <googleplay:category text="Education" />
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=600",
    },
  });
}
