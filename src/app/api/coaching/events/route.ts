import { NextResponse } from "next/server";
import { asc, gte } from "drizzle-orm";
import { db } from "@/db";
import { groupCoachingEvents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import {
  getRestrictedContentIds,
  getUserContentGrants,
  GROUP_COACHING_EVENT_CONTENT_TYPE,
} from "@/lib/tag-feature-access";
import { isStaffRole } from "@/lib/platform-roles";

export const dynamic = "force-dynamic";

/** Upcoming coaching sessions visible to the current student's package tags. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Keep an in-progress session visible for up to six hours after its start.
  const recentCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(groupCoachingEvents)
    .where(gte(groupCoachingEvents.startsAt, recentCutoff))
    .orderBy(asc(groupCoachingEvents.startsAt))
    .limit(200);

  if (isStaffRole(user.role)) {
    return NextResponse.json({ events: rows });
  }

  const [grantedIds, restrictedIds] = await Promise.all([
    getUserContentGrants(user.id, GROUP_COACHING_EVENT_CONTENT_TYPE),
    getRestrictedContentIds(GROUP_COACHING_EVENT_CONTENT_TYPE),
  ]);
  const visible = rows.filter(
    (event) => !restrictedIds.has(event.id) || grantedIds.has(event.id),
  );
  return NextResponse.json({ events: visible });
}
