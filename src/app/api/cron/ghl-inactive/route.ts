// src/app/api/cron/ghl-inactive/route.ts
// Daily cron route that detects students inactive for 7+ days and dispatches
// student.inactive webhooks to GHL. Deduplicates within 7-day windows.
// Schedule: daily at 8:00 AM UTC (configured in vercel.json)

import { NextResponse } from "next/server";
import { db } from "@/db";
import { syncEvents, users, lessonProgress, autoTagRules, tags } from "@/db/schema";
import { eq, and, inArray, gte, sql } from "drizzle-orm";
import { dispatchWebhook } from "@/lib/ghl/webhooks";
import { assignTag } from "@/lib/tags";
import { syncTagToGhl } from "@/lib/ghl/tag-sync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Step 1: Verify CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn("[GHL Cron Inactive] CRON_SECRET not set, skipping in development");
    return NextResponse.json({ skipped: true, reason: "no_cron_secret" });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Step 2: Query students inactive for 7+ days
  // Includes students with no lesson_progress whose account is older than 7 days
  const inactiveStudents = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      lastActivityDate: sql<Date | null>`MAX(${lessonProgress.lastAccessedAt})`,
      totalCompleted: sql<number>`COUNT(CASE WHEN ${lessonProgress.completedAt} IS NOT NULL THEN 1 END)::int`,
    })
    .from(users)
    .leftJoin(lessonProgress, eq(users.id, lessonProgress.userId))
    .where(eq(users.role, "student"))
    .groupBy(users.id, users.email, users.name, users.createdAt)
    .having(
      sql`MAX(${lessonProgress.lastAccessedAt}) < NOW() - INTERVAL '7 days'
          OR (MAX(${lessonProgress.lastAccessedAt}) IS NULL AND ${users.createdAt} < NOW() - INTERVAL '7 days')`
    )
    .limit(20);

  const stats = { checked: inactiveStudents.length, dispatched: 0, skipped: 0 };

  // Step 3: Process each inactive student with deduplication
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  for (const student of inactiveStudents) {
    // Check for recent student.inactive event for this user (within 7-day window)
    const recentNotifications = await db
      .select({ id: syncEvents.id })
      .from(syncEvents)
      .where(
        and(
          eq(syncEvents.entityId, student.userId),
          eq(syncEvents.eventType, "student.inactive"),
          eq(syncEvents.direction, "outbound"),
          inArray(syncEvents.status, ["completed", "pending"]),
          gte(syncEvents.createdAt, sevenDaysAgo)
        )
      )
      .limit(1);

    if (recentNotifications.length > 0) {
      stats.skipped++;
      continue;
    }

    // Calculate days since last activity
    const lastActive = student.lastActivityDate ?? student.createdAt;
    const daysSinceActivity = Math.floor(
      (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
    );

    try {
      await dispatchWebhook({
        userId: student.userId,
        userEmail: student.email,
        eventType: "student.inactive",
        entityType: "user",
        entityId: student.userId,
        context: {
          daysSinceActive: daysSinceActivity,
          lastActiveAt: lastActive.toISOString(),
          totalLessonsCompleted: student.totalCompleted,
        },
      });
      stats.dispatched++;
    } catch (error) {
      console.error(
        `[GHL Cron Inactive] Failed to dispatch for user ${student.userId}:`,
        error instanceof Error ? error.message : error
      );
      // Continue processing other students
    }
  }

  // Step 4: Evaluate auto-tag rules for inactive students
  const autoTagStats = await evaluateAutoTagRules(inactiveStudents);

  return NextResponse.json({ ...stats, autoTags: autoTagStats });
}

/**
 * Evaluate active auto-tag rules (conditionType: "inactive_days") against
 * a list of inactive students. Assigns matching tags and syncs to GHL.
 */
async function evaluateAutoTagRules(
  students: Array<{
    userId: string;
    lastActivityDate: Date | null;
    createdAt: Date;
  }>
): Promise<{ evaluated: number; assigned: number }> {
  const stats = { evaluated: 0, assigned: 0 };

  // Fetch active auto-tag rules for inactive_days condition
  const rules = await db
    .select({
      id: autoTagRules.id,
      tagId: autoTagRules.tagId,
      conditionValue: autoTagRules.conditionValue,
      tagName: tags.name,
      tagType: tags.type,
    })
    .from(autoTagRules)
    .innerJoin(tags, eq(autoTagRules.tagId, tags.id))
    .where(
      and(
        eq(autoTagRules.conditionType, "inactive_days"),
        eq(autoTagRules.isActive, true)
      )
    );

  if (rules.length === 0) {
    return stats;
  }

  for (const student of students) {
    const lastActive = student.lastActivityDate ?? student.createdAt;
    const daysSinceActivity = Math.floor(
      (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
    );

    for (const rule of rules) {
      const threshold = parseInt(rule.conditionValue, 10);
      if (isNaN(threshold) || daysSinceActivity < threshold) {
        continue;
      }

      stats.evaluated++;

      try {
        const result = await assignTag(student.userId, rule.tagId, undefined, {
          source: "system",
        });

        if (result.assigned) {
          stats.assigned++;
          // Fire-and-forget sync to GHL
          syncTagToGhl(student.userId, rule.tagName, "add", {
            tagType: rule.tagType,
          }).catch(console.error);
        }
      } catch (error) {
        console.error(
          `[GHL Cron Inactive] Auto-tag failed for user ${student.userId}, rule ${rule.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  return stats;
}
