import { NextResponse } from "next/server";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  groupCoachingEventReminders,
  groupCoachingEvents,
  notificationPreferences,
  notifications,
  studentTags,
  tagContentGrants,
  tags,
  users,
} from "@/db/schema";
import { GROUP_COACHING_EVENT_CONTENT_TYPE } from "@/lib/tag-feature-access";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ReminderKey = "one_hour" | "five_minutes" | "starting_now";

function dueReminder(deltaMinutes: number): ReminderKey | null {
  if (deltaMinutes <= 0 && deltaMinutes > -5) return "starting_now";
  if (deltaMinutes <= 5 && deltaMinutes > 0) return "five_minutes";
  if (deltaMinutes <= 60 && deltaMinutes > 45) return "one_hour";
  return null;
}

const COPY: Record<ReminderKey, { title: string; lead: string }> = {
  one_hour: { title: "ICGC starts in 1 hour", lead: "Get ready for" },
  five_minutes: { title: "ICGC starts in 5 minutes", lead: "Starting soon:" },
  starting_now: { title: "ICGC is starting now", lead: "Join now:" },
};

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ skipped: true, reason: "no_cron_secret" });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - 5 * 60_000);
  const windowEnd = new Date(now.getTime() + 60 * 60_000);

  const [icgcTag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.name, "icgc_student"))
    .limit(1);
  if (!icgcTag) {
    return NextResponse.json({ skipped: true, reason: "icgc_tag_missing" });
  }

  const [candidateEvents, audienceGrants, recipients] = await Promise.all([
    db
      .select({
        id: groupCoachingEvents.id,
        title: groupCoachingEvents.title,
        startsAt: groupCoachingEvents.startsAt,
      })
      .from(groupCoachingEvents)
      .where(
        and(
          eq(groupCoachingEvents.isCancelled, false),
          gte(groupCoachingEvents.startsAt, windowStart),
          lte(groupCoachingEvents.startsAt, windowEnd),
        ),
      ),
    db
      .select({ contentId: tagContentGrants.contentId })
      .from(tagContentGrants)
      .where(
        and(
          eq(tagContentGrants.tagId, icgcTag.id),
          eq(
            tagContentGrants.contentType,
            GROUP_COACHING_EVENT_CONTENT_TYPE,
          ),
        ),
      ),
    db
      .select({ id: users.id })
      .from(users)
      .innerJoin(studentTags, eq(studentTags.userId, users.id))
      .where(
        and(
          eq(studentTags.tagId, icgcTag.id),
          eq(users.role, "student"),
          isNull(users.deletedAt),
        ),
      ),
  ]);

  const grantedEventIds = new Set(audienceGrants.map((grant) => grant.contentId));
  const recipientIds = recipients.map((recipient) => recipient.id);
  if (candidateEvents.length === 0 || recipientIds.length === 0) {
    return NextResponse.json({ events: 0, recipients: recipientIds.length, sent: 0 });
  }

  const mutedRows = await db
    .select({ userId: notificationPreferences.userId })
    .from(notificationPreferences)
    .where(
      and(
        inArray(notificationPreferences.userId, recipientIds),
        eq(notificationPreferences.category, "system"),
        eq(notificationPreferences.muted, true),
      ),
    );
  const mutedIds = new Set(mutedRows.map((row) => row.userId));
  const activeRecipientIds = recipientIds.filter((id) => !mutedIds.has(id));

  let processedEvents = 0;
  let sent = 0;
  for (const event of candidateEvents) {
    if (!grantedEventIds.has(event.id)) continue;
    const deltaMinutes = (event.startsAt.getTime() - now.getTime()) / 60_000;
    const reminderKey = dueReminder(deltaMinutes);
    if (!reminderKey || activeRecipientIds.length === 0) continue;
    processedEvents++;

    const claimed = await db
      .insert(groupCoachingEventReminders)
      .values(
        activeRecipientIds.map((userId) => ({
          eventId: event.id,
          userId,
          reminderKey,
        })),
      )
      .onConflictDoNothing()
      .returning({ userId: groupCoachingEventReminders.userId });
    if (claimed.length === 0) continue;

    const copy = COPY[reminderKey];
    await db.insert(notifications).values(
      claimed.map(({ userId }) => ({
        userId,
        type: "system" as const,
        category: "system" as const,
        title: copy.title,
        body: `${copy.lead} ${event.title}`,
        linkUrl: "/dashboard/coaching/group-schedule",
        metadata: JSON.stringify({
          coachingEventId: event.id,
          reminderKey,
        }),
      })),
    );
    sent += claimed.length;
  }

  return NextResponse.json({
    events: processedEvents,
    recipients: activeRecipientIds.length,
    muted: mutedIds.size,
    sent,
  });
}
