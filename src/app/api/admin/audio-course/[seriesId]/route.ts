import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";

type AudioSeriesMeta = {
  audioCourse: true;
  summary?: string;
  helloAudioSeriesUrl?: string;
  spotifyUrl?: string;
  youtubeMusicUrl?: string;
  applePodcastUrl?: string;
  studentInstructions?: string;
  allowedTagIds?: string[];
  allowedUserIds?: string[];
};

function parseMeta(raw: string | null): AudioSeriesMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AudioSeriesMeta;
    return parsed.audioCourse === true ? parsed : null;
  } catch {
    return null;
  }
}

function stringifyMeta(input: Omit<AudioSeriesMeta, "audioCourse">): string {
  return JSON.stringify({
    audioCourse: true,
    summary: input.summary?.trim() ?? "",
    helloAudioSeriesUrl: input.helloAudioSeriesUrl?.trim() ?? "",
    spotifyUrl: input.spotifyUrl?.trim() ?? "",
    youtubeMusicUrl: input.youtubeMusicUrl?.trim() ?? "",
    applePodcastUrl: input.applePodcastUrl?.trim() ?? "",
    studentInstructions: input.studentInstructions?.trim() ?? "",
    allowedTagIds: input.allowedTagIds ?? [],
    allowedUserIds: input.allowedUserIds ?? [],
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> },
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { seriesId } = await params;
  const body = (await request.json()) as {
    title?: string;
    summary?: string;
    helloAudioSeriesUrl?: string;
    spotifyUrl?: string;
    youtubeMusicUrl?: string;
    applePodcastUrl?: string;
    studentInstructions?: string;
    allowedTagIds?: string[];
    allowedUserIds?: string[];
    isPublished?: boolean;
  };

  const [existing] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, seriesId), isNull(courses.deletedAt)));
  if (!existing || !parseMeta(existing.description)) {
    return NextResponse.json({ error: "Audio series not found" }, { status: 404 });
  }

  const title = body.title?.trim();
  if (title !== undefined && title.length < 3) {
    return NextResponse.json({ error: "Series title must be at least 3 characters" }, { status: 400 });
  }

  const existingMeta = parseMeta(existing.description);

  const [updated] = await db
    .update(courses)
    .set({
      title: title ?? existing.title,
      description: stringifyMeta({
        summary: body.summary ?? existingMeta?.summary ?? "",
        helloAudioSeriesUrl: body.helloAudioSeriesUrl ?? existingMeta?.helloAudioSeriesUrl ?? "",
        spotifyUrl: body.spotifyUrl ?? existingMeta?.spotifyUrl ?? "",
        youtubeMusicUrl: body.youtubeMusicUrl ?? existingMeta?.youtubeMusicUrl ?? "",
        applePodcastUrl: body.applePodcastUrl ?? existingMeta?.applePodcastUrl ?? "",
        studentInstructions: body.studentInstructions ?? existingMeta?.studentInstructions ?? "",
        allowedTagIds: body.allowedTagIds ?? existingMeta?.allowedTagIds ?? [],
        allowedUserIds: body.allowedUserIds ?? existingMeta?.allowedUserIds ?? [],
      }),
      isPublished: body.isPublished ?? existing.isPublished,
    })
    .where(eq(courses.id, seriesId))
    .returning();

  return NextResponse.json({ series: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> },
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { seriesId } = await params;

  await db
    .update(courses)
    .set({ deletedAt: new Date(), isPublished: false })
    .where(eq(courses.id, seriesId));

  return NextResponse.json({ success: true });
}
