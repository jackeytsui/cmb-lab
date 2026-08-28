import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { canStaffAccessStudent } from "@/lib/coach-student-scope";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";
import { getStudyPreferences, upsertStudyPreferences } from "@/lib/study";

const paramsSchema = z.object({ studentId: z.string().uuid() });
const preferenceSchema = z.object({
  dailyMinutes: z.number().int().min(10).max(180),
});

type RouteContext = {
  params: Promise<{ studentId: string }>;
};

async function authorizeStudent(context: RouteContext) {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      student: null,
    };
  }
  if (access.status !== "authorized" || !access.actor) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      student: null,
    };
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return {
      error: NextResponse.json({ error: "Invalid student ID" }, { status: 400 }),
      student: null,
    };
  }

  const student = await db.query.users.findFirst({
    where: and(
      eq(users.id, parsedParams.data.studentId),
      eq(users.role, "student"),
      isNull(users.deletedAt),
    ),
    columns: { id: true, assignedCoachId: true },
  });
  if (
    !student ||
    !canStaffAccessStudent({
      actorUserId: access.actor.id,
      actorRole: access.actor.role,
      assignedCoachId: student.assignedCoachId,
    })
  ) {
    return {
      error: NextResponse.json({ error: "Student not found" }, { status: 404 }),
      student: null,
    };
  }

  return { error: null, student };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const authorization = await authorizeStudent(context);
  if (authorization.error || !authorization.student) return authorization.error;

  const preferences = await getStudyPreferences(authorization.student.id);
  return NextResponse.json({ preferences });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authorization = await authorizeStudent(context);
  if (authorization.error || !authorization.student) return authorization.error;

  const parsedBody = preferenceSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Daily study goal must be between 10 and 180 minutes" },
      { status: 400 },
    );
  }

  const preferences = await upsertStudyPreferences(
    authorization.student.id,
    parsedBody.data.dailyMinutes,
  );
  return NextResponse.json({ preferences });
}
