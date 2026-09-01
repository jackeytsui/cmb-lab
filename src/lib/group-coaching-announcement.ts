import "server-only";

import { and, asc, eq, gte, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { groupCoachingEvents, studentTags, tags } from "@/db/schema";
import { expandCoachingOccurrences } from "@/lib/group-coaching-recurrence";
import {
  groupCoachingSessionState,
  isGroupCoachingReminderBannerVisible,
} from "@/lib/group-coaching-session-state";
import {
  getRestrictedContentIds,
  getUserContentGrants,
  GROUP_COACHING_EVENT_CONTENT_TYPE,
} from "@/lib/tag-feature-access";

export type CoachingAnnouncement = {
  id: string;
  title: string;
  body: string;
  linkUrl: string;
  linkLabel: string;
  tone: "coaching-upcoming" | "coaching-live";
  eyebrow: string;
};

function safeTimeZone(timeZone: string | null | undefined) {
  if (!timeZone) return "America/Toronto";
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return timeZone;
  } catch {
    return "America/Toronto";
  }
}

function calendarDateKey(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(value);
}

/**
 * Build a per-student banner from the same tag grants and recurrence rules as
 * the schedule API. Nothing is persisted, so the banner appears and expires
 * exactly with the session clock.
 */
export async function getIgcCoachingAnnouncement(
  userId: string,
  userTimeZone: string | null | undefined,
  now = new Date(),
): Promise<CoachingAnnouncement | null> {
  const [membership] = await db
    .select({ tagId: studentTags.tagId })
    .from(studentTags)
    .innerJoin(tags, eq(tags.id, studentTags.tagId))
    .where(
      and(
        eq(studentTags.userId, userId),
        eq(tags.name, "icgc_student"),
      ),
    )
    .limit(1);
  if (!membership) return null;

  const recentCutoff = new Date(now.getTime() - 6 * 60 * 60_000);

  const [templates, grantedIds, restrictedIds] = await Promise.all([
    db
      .select({
        id: groupCoachingEvents.id,
        title: groupCoachingEvents.title,
        description: groupCoachingEvents.description,
        startsAt: groupCoachingEvents.startsAt,
        durationMinutes: groupCoachingEvents.durationMinutes,
        meetingUrl: groupCoachingEvents.meetingUrl,
        isCancelled: groupCoachingEvents.isCancelled,
      })
      .from(groupCoachingEvents)
      .where(
        and(
          eq(groupCoachingEvents.isCancelled, false),
          or(
            gte(groupCoachingEvents.startsAt, recentCutoff),
            ilike(groupCoachingEvents.description, "%Repeats every%"),
          ),
        ),
      )
      .orderBy(asc(groupCoachingEvents.startsAt))
      .limit(500),
    getUserContentGrants(userId, GROUP_COACHING_EVENT_CONTENT_TYPE),
    getRestrictedContentIds(GROUP_COACHING_EVENT_CONTENT_TYPE),
  ]);

  const nowMs = now.getTime();
  const occurrences = expandCoachingOccurrences(templates, {
    startsAt: recentCutoff,
    endsAt: new Date(nowMs + 60 * 60_000),
  })
    .filter(
      (event) =>
        (!restrictedIds.has(event.sourceEventId) ||
          grantedIds.has(event.sourceEventId)) &&
        isGroupCoachingReminderBannerVisible(event, nowMs),
    )
    .sort((left, right) => {
      const leftLive = groupCoachingSessionState(left, nowMs) === "live";
      const rightLive = groupCoachingSessionState(right, nowMs) === "live";
      if (leftLive !== rightLive) return leftLive ? -1 : 1;
      return left.startsAt.getTime() - right.startsAt.getTime();
    });

  const event = occurrences[0];
  if (!event) return null;

  const timeZone = safeTimeZone(userTimeZone);
  const state = groupCoachingSessionState(event, nowMs);
  const isLive = state === "live";
  const minutesUntil = Math.max(
    1,
    Math.ceil((event.startsAt.getTime() - nowMs) / 60_000),
  );
  const startsToday =
    calendarDateKey(event.startsAt, timeZone) === calendarDateKey(now, timeZone);
  const startTime = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(event.startsAt);
  const countdown = minutesUntil >= 56 ? "in 1 hour" : `in ${minutesUntil} minutes`;

  return {
    id: `icgc-${event.sourceEventId}-${event.startsAt.toISOString()}`,
    title: isLive
      ? `${event.title} is live now`
      : `${startsToday ? "Today's" : "Your next"} ICGC session starts ${countdown}`,
    body: isLive
      ? "Your coaching session is live. Join now so you do not miss it."
      : `${event.title} starts at ${startTime}. Use the Join button when you are ready.`,
    linkUrl: event.meetingUrl,
    linkLabel: isLive ? "Join live now" : "Join session",
    tone: isLive ? "coaching-live" : "coaching-upcoming",
    eyebrow: isLive ? "ICGC · Live now" : "ICGC · Starting soon",
  };
}
