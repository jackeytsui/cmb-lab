import { NextRequest, NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  groupCoachingEvents,
  tagContentGrants,
  tags,
} from "@/db/schema";
import { getRealUser, hasMinimumRole } from "@/lib/auth";
import { GROUP_COACHING_EVENT_CONTENT_TYPE } from "@/lib/tag-feature-access";

const eventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000).default(""),
  hostName: z.string().trim().max(200).default(""),
  startsAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(480),
  meetingUrl: z.string().url().max(2_000).refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  }, "Meeting URL must use http or https"),
  tagIds: z.array(z.string().uuid()).max(100).default([]),
});

async function requireCoach() {
  if (!(await hasMinimumRole("coach"))) return null;
  return getRealUser();
}

export async function GET() {
  if (!(await requireCoach())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [events, tagRows, grants] = await Promise.all([
    db
      .select()
      .from(groupCoachingEvents)
      .orderBy(asc(groupCoachingEvents.startsAt))
      .limit(500),
    db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .orderBy(asc(tags.name)),
    db
      .select({
        contentId: tagContentGrants.contentId,
        tagId: tagContentGrants.tagId,
      })
      .from(tagContentGrants)
      .where(
        eq(
          tagContentGrants.contentType,
          GROUP_COACHING_EVENT_CONTENT_TYPE,
        ),
      ),
  ]);
  const tagsByEvent = new Map<string, string[]>();
  for (const grant of grants) {
    const list = tagsByEvent.get(grant.contentId) ?? [];
    list.push(grant.tagId);
    tagsByEvent.set(grant.contentId, list);
  }
  return NextResponse.json({
    events: events.map((event) => ({
      ...event,
      tagIds: tagsByEvent.get(event.id) ?? [],
    })),
    tags: tagRows,
  });
}

export async function POST(request: NextRequest) {
  const user = await requireCoach();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid event" },
      { status: 400 },
    );
  }
  const { tagIds, startsAt, ...values } = parsed.data;
  if (tagIds.length > 0) {
    const validTags = await db
      .select({ id: tags.id })
      .from(tags)
      .where(inArray(tags.id, tagIds));
    if (validTags.length !== new Set(tagIds).size) {
      return NextResponse.json({ error: "Invalid audience tag" }, { status: 400 });
    }
  }
  const [event] = await db
    .insert(groupCoachingEvents)
    .values({ ...values, startsAt: new Date(startsAt), createdBy: user.id })
    .returning();
  try {
    if (tagIds.length > 0) {
      await db.insert(tagContentGrants).values(
        [...new Set(tagIds)].map((tagId) => ({
          tagId,
          contentType: GROUP_COACHING_EVENT_CONTENT_TYPE,
          contentId: event.id,
        })),
      );
    }
  } catch (error) {
    await db.delete(groupCoachingEvents).where(eq(groupCoachingEvents.id, event.id));
    throw error;
  }
  return NextResponse.json({ event: { ...event, tagIds } }, { status: 201 });
}
