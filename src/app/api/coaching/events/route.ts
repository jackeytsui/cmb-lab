import { NextResponse } from "next/server";
import { asc, gte, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { groupCoachingEvents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import {
  getRestrictedContentIds,
  getUserContentGrants,
  GROUP_COACHING_EVENT_CONTENT_TYPE,
} from "@/lib/tag-feature-access";
import { isStaffRole } from "@/lib/platform-roles";
import {
  COACHING_SCHEDULE_HORIZON_WEEKS,
  expandCoachingOccurrences,
} from "@/lib/group-coaching-recurrence";

export const dynamic = "force-dynamic";

/** Upcoming coaching sessions visible to the current student's package tags. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Keep an in-progress session visible for up to six hours after its start.
  const recentCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const templates = await db
    .select()
    .from(groupCoachingEvents)
    .where(
      or(
        gte(groupCoachingEvents.startsAt, recentCutoff),
        ilike(groupCoachingEvents.description, "%Repeats every%"),
      ),
    )
    .orderBy(asc(groupCoachingEvents.startsAt))
    .limit(500);

  const horizonEnd = new Date(
    Date.now() + COACHING_SCHEDULE_HORIZON_WEEKS * 7 * 24 * 60 * 60 * 1000,
  );

  if (isStaffRole(user.role)) {
    return NextResponse.json({
      events: expandCoachingOccurrences(templates, {
        startsAt: recentCutoff,
        endsAt: horizonEnd,
      }),
    });
  }

  const [grantedIds, restrictedIds] = await Promise.all([
    getUserContentGrants(user.id, GROUP_COACHING_EVENT_CONTENT_TYPE),
    getRestrictedContentIds(GROUP_COACHING_EVENT_CONTENT_TYPE),
  ]);
  const visibleTemplates = templates.filter(
    (event) => !restrictedIds.has(event.id) || grantedIds.has(event.id),
  );
  return NextResponse.json({
    events: expandCoachingOccurrences(visibleTemplates, {
      startsAt: recentCutoff,
      endsAt: horizonEnd,
    }),
  });
}
