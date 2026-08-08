import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { groupCoachingEvents, tagContentGrants, tags } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import { GROUP_COACHING_EVENT_CONTENT_TYPE } from "@/lib/tag-feature-access";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000),
  hostName: z.string().trim().max(200),
  startsAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(480),
  meetingUrl: z.string().url().max(2_000).refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  }, "Meeting URL must use http or https"),
  isCancelled: z.boolean(),
  tagIds: z.array(z.string().uuid()).max(100),
});

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  if (!(await hasMinimumRole("coach"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { eventId } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
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
    .update(groupCoachingEvents)
    .set({ ...values, startsAt: new Date(startsAt), updatedAt: new Date() })
    .where(eq(groupCoachingEvents.id, eventId))
    .returning();
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  await db.delete(tagContentGrants).where(
    and(
      eq(tagContentGrants.contentType, GROUP_COACHING_EVENT_CONTENT_TYPE),
      eq(tagContentGrants.contentId, eventId),
    ),
  );
  if (tagIds.length > 0) {
    await db.insert(tagContentGrants).values(
      [...new Set(tagIds)].map((tagId) => ({
        tagId,
        contentType: GROUP_COACHING_EVENT_CONTENT_TYPE,
        contentId: eventId,
      })),
    );
  }
  return NextResponse.json({ event: { ...event, tagIds } });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { eventId } = await params;
  await db.delete(tagContentGrants).where(
    and(
      eq(tagContentGrants.contentType, GROUP_COACHING_EVENT_CONTENT_TYPE),
      eq(tagContentGrants.contentId, eventId),
    ),
  );
  const [deleted] = await db
    .delete(groupCoachingEvents)
    .where(eq(groupCoachingEvents.id, eventId))
    .returning({ id: groupCoachingEvents.id });
  if (!deleted) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
