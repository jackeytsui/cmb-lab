import { NextResponse } from "next/server";
import {
  and,
  asc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  or,
} from "drizzle-orm";
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
import { expandCoachingOccurrences } from "@/lib/group-coaching-recurrence";
import { groupCoachingReminderKey } from "@/lib/group-coaching-session-state";
import { sendCoachingReminderPush } from "@/lib/web-push";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const COPY = {
  one_hour: {
    title: "Today's ICGC session starts in 1 hour",
    lead: "Get ready for",
  },
  starting_now: { title: "ICGC is live now", lead: "Join now:" },
} as const;

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

  const [candidateEvents, audienceGrants, restrictedEvents, recipients] =
    await Promise.all([
    db
      .select({
        id: groupCoachingEvents.id,
        title: groupCoachingEvents.title,
        description: groupCoachingEvents.description,
        startsAt: groupCoachingEvents.startsAt,
        meetingUrl: groupCoachingEvents.meetingUrl,
      })
      .from(groupCoachingEvents)
      .where(
        and(
          eq(groupCoachingEvents.isCancelled, false),
          or(
            gte(groupCoachingEvents.startsAt, windowStart),
            ilike(groupCoachingEvents.description, "%Repeats every%"),
          ),
        ),
      )
      .orderBy(asc(groupCoachingEvents.startsAt))
      .limit(500),
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
      .selectDistinct({ contentId: tagContentGrants.contentId })
      .from(tagContentGrants)
      .where(
        eq(
          tagContentGrants.contentType,
          GROUP_COACHING_EVENT_CONTENT_TYPE,
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

  const candidateOccurrences = expandCoachingOccurrences(candidateEvents, {
    startsAt: windowStart,
    endsAt: windowEnd,
  });
  const grantedEventIds = new Set(audienceGrants.map((grant) => grant.contentId));
  const restrictedEventIds = new Set(
    restrictedEvents.map((grant) => grant.contentId),
  );
  const recipientIds = recipients.map((recipient) => recipient.id);
  if (candidateOccurrences.length === 0 || recipientIds.length === 0) {
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
  let pushSent = 0;
  for (const event of candidateOccurrences) {
    if (
      restrictedEventIds.has(event.sourceEventId) &&
      !grantedEventIds.has(event.sourceEventId)
    ) {
      continue;
    }
    const reminderKey = groupCoachingReminderKey(event.startsAt, now.getTime());
    if (!reminderKey || activeRecipientIds.length === 0) continue;
    processedEvents++;

    const claimed = await db
      .insert(groupCoachingEventReminders)
      .values(
        activeRecipientIds.map((userId) => ({
          eventId: event.sourceEventId,
          userId,
          occurrenceStartsAt: event.startsAt,
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
        linkUrl: event.meetingUrl,
        metadata: JSON.stringify({
          coachingEventId: event.sourceEventId,
          occurrenceStartsAt: event.startsAt.toISOString(),
          reminderKey,
          meetingUrl: event.meetingUrl,
        }),
      })),
    );
    const pushResult = await sendCoachingReminderPush(
      {
        id: `${event.sourceEventId}:${event.startsAt.toISOString()}:${reminderKey}`,
        title: copy.title,
        body: `${copy.lead} ${event.title}`,
        linkUrl: event.meetingUrl,
      },
      claimed.map(({ userId }) => userId),
    );
    sent += claimed.length;
    pushSent += pushResult.sent;
  }

  return NextResponse.json({
    events: processedEvents,
    recipients: activeRecipientIds.length,
    muted: mutedIds.size,
    sent,
    pushSent,
  });
}
