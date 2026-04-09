import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  users,
  tags,
  studentTags,
  typingSentences,
  typingProgress,
  scriptLines,
  scriptLineProgress,
  curatedPassages,
  passageReadStatus,
  acceleratorContentCompletion,
  toneMasteryClips,
  toneMasteryProgress,
  listeningQuestions,
  listeningProgress,
  featureEngagementEvents,
  tagFeatureGrants,
} from "@/db/schema";
import { eq, count, and, max, inArray } from "drizzle-orm";
import { excludeWhitelistedUsersSql } from "@/lib/analytics-whitelist";

export async function GET() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Find LTO students (users with the LTO_student tag)
    const ltoTag = await db.query.tags.findFirst({
      where: eq(tags.name, "LTO_student"),
      columns: { id: true },
    });

    if (!ltoTag) {
      return NextResponse.json({
        students: [],
        totals: { typing: 0, scripts: 0, passages: 0, toneClips: 0, listeningQs: 0 },
        studentCount: 0,
      });
    }

    // Get all LTO student user IDs with their info
    const ltoStudents = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(studentTags)
      .innerJoin(users, eq(studentTags.userId, users.id))
      .where(and(
        eq(studentTags.tagId, ltoTag.id),
        excludeWhitelistedUsersSql(users.id),
      ));

    // Get content totals
    const [typingTotal] = await db.select({ count: count() }).from(typingSentences);
    const [scriptsTotal] = await db.select({ count: count() }).from(scriptLines);
    const [passagesTotal] = await db.select({ count: count() }).from(curatedPassages);
    const [toneClipsTotal] = await db.select({ count: count() }).from(toneMasteryClips);
    const [listeningQsTotal] = await db.select({ count: count() }).from(listeningQuestions);

    // Find which extra pack features each student has access to via tags
    const extraPackFeatures = ["audio_accelerator_edition", "tone_mastery", "listening_training"];
    const extraPackGrants = await db
      .select({
        tagId: tagFeatureGrants.tagId,
        featureKey: tagFeatureGrants.featureKey,
      })
      .from(tagFeatureGrants)
      .where(inArray(tagFeatureGrants.featureKey, extraPackFeatures));

    const extraPackTagIds = new Map<string, Set<string>>();
    for (const g of extraPackGrants) {
      if (!extraPackTagIds.has(g.featureKey)) extraPackTagIds.set(g.featureKey, new Set());
      extraPackTagIds.get(g.featureKey)!.add(g.tagId);
    }

    // Get all student tag assignments for extra pack checking
    const studentIds = ltoStudents.map((s) => s.id);
    const allStudentTags = studentIds.length > 0
      ? await db
          .select({ userId: studentTags.userId, tagId: studentTags.tagId })
          .from(studentTags)
          .where(inArray(studentTags.userId, studentIds))
      : [];

    const studentTagMap = new Map<string, Set<string>>();
    for (const st of allStudentTags) {
      if (!studentTagMap.has(st.userId)) studentTagMap.set(st.userId, new Set());
      studentTagMap.get(st.userId)!.add(st.tagId);
    }

    function hasFeature(userId: string, featureKey: string): boolean {
      const userTags = studentTagMap.get(userId);
      const featureTags = extraPackTagIds.get(featureKey);
      if (!userTags || !featureTags) return false;
      for (const t of userTags) {
        if (featureTags.has(t)) return true;
      }
      return false;
    }

    // For each student, get their progress
    const studentData = await Promise.all(
      ltoStudents.map(async (student) => {
        const [typingDone] = await db
          .select({ count: count() })
          .from(typingProgress)
          .where(eq(typingProgress.userId, student.id));

        const [scriptsDone] = await db
          .select({ count: count() })
          .from(scriptLineProgress)
          .where(eq(scriptLineProgress.userId, student.id));

        const [passagesDone] = await db
          .select({ count: count() })
          .from(passageReadStatus)
          .where(eq(passageReadStatus.userId, student.id));

        // Content completions (practice plan, starter pack, typing unlock kit)
        const contentCompletions = await db
          .select({ contentKey: acceleratorContentCompletion.contentKey })
          .from(acceleratorContentCompletion)
          .where(eq(acceleratorContentCompletion.userId, student.id));
        const completedKeys = new Set(contentCompletions.map((r) => r.contentKey));

        // Extra pack progress
        const hasTone = hasFeature(student.id, "tone_mastery");
        const hasListening = hasFeature(student.id, "listening_training");

        let toneDone = 0;
        let listenDone = 0;

        if (hasTone) {
          const [r] = await db
            .select({ count: count() })
            .from(toneMasteryProgress)
            .where(eq(toneMasteryProgress.userId, student.id));
          toneDone = r.count;
        }

        if (hasListening) {
          const [r] = await db
            .select({ count: count() })
            .from(listeningProgress)
            .where(eq(listeningProgress.userId, student.id));
          listenDone = r.count;
        }

        // Last activity from engagement events
        const [lastActivity] = await db
          .select({ lastAt: max(featureEngagementEvents.createdAt) })
          .from(featureEngagementEvents)
          .where(eq(featureEngagementEvents.userId, student.id));

        // Calculate overall (base accelerator sections)
        const baseTotal = typingTotal.count + scriptsTotal.count + passagesTotal.count + 3; // 3 content pages
        const baseDone =
          typingDone.count +
          scriptsDone.count +
          passagesDone.count +
          (completedKeys.has("practice_plan") ? 1 : 0) +
          (completedKeys.has("starter_pack") ? 1 : 0) +
          (completedKeys.has("typing_unlock_kit") ? 1 : 0);

        return {
          id: student.id,
          name: student.name,
          email: student.email,
          typing: { done: typingDone.count, total: typingTotal.count },
          scripts: { done: scriptsDone.count, total: scriptsTotal.count },
          passages: { done: passagesDone.count, total: passagesTotal.count },
          practicePlan: completedKeys.has("practice_plan"),
          starterPack: completedKeys.has("starter_pack"),
          typingKit: completedKeys.has("typing_unlock_kit"),
          tone: hasTone ? { done: toneDone, total: toneClipsTotal.count } : null,
          listening: hasListening ? { done: listenDone, total: listeningQsTotal.count } : null,
          overallPct: baseTotal > 0 ? Math.round((baseDone / baseTotal) * 100) : 0,
          lastActivityAt: lastActivity?.lastAt ?? null,
        };
      }),
    );

    // Sort by overall completion descending
    studentData.sort((a, b) => b.overallPct - a.overallPct);

    return NextResponse.json({
      students: studentData,
      totals: {
        typing: typingTotal.count,
        scripts: scriptsTotal.count,
        passages: passagesTotal.count,
        toneClips: toneClipsTotal.count,
        listeningQs: listeningQsTotal.count,
      },
      studentCount: ltoStudents.length,
    });
  } catch (error) {
    console.error("Failed to fetch LTO report:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
