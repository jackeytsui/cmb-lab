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
} from "@/db/schema";
import { eq, count, sql, and } from "drizzle-orm";
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
        totals: { typing: 0, scripts: 0, passages: 0 },
      });
    }

    // Get all LTO student user IDs with their info (excluding whitelisted)
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

        const totalItems = typingTotal.count + scriptsTotal.count + passagesTotal.count;
        const totalDone = typingDone.count + scriptsDone.count + passagesDone.count;

        return {
          id: student.id,
          name: student.name,
          email: student.email,
          typing: { done: typingDone.count, total: typingTotal.count },
          scripts: { done: scriptsDone.count, total: scriptsTotal.count },
          passages: { done: passagesDone.count, total: passagesTotal.count },
          overallPct: totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0,
        };
      })
    );

    // Sort by overall completion descending
    studentData.sort((a, b) => b.overallPct - a.overallPct);

    return NextResponse.json({
      students: studentData,
      totals: {
        typing: typingTotal.count,
        scripts: scriptsTotal.count,
        passages: passagesTotal.count,
      },
      studentCount: ltoStudents.length,
    });
  } catch (error) {
    console.error("Failed to fetch LTO report:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
