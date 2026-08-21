import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";

const sourceRecordSchema = z.object({
  row: z.number().int().positive().optional(),
  firstName: z.string().trim().max(120),
  lastName: z.string().trim().max(120),
  email: z.string().trim().email(),
  coachName: z.string().trim().max(120),
  courseEndDate: z.string().trim(),
});

const requestSchema = z.object({
  records: z.array(sourceRecordSchema).min(1).max(1000),
  apply: z.boolean().default(false),
});

const COACH_EMAIL_BY_SOURCE_NAME: Record<string, string | null> = {
  gini: "gini.chan@thecmblueprint.com",
  jane: "jane.lee@thecmblueprint.com",
  janelle: "janelle.wong@thecmblueprint.com",
  tiffany: "tiffany.hui@thecmblueprint.com",
  yara: "yara.yin@thecmblueprint.com",
  "no coach (self-study)": null,
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeSourceDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(`${trimmed} 12:00:00 UTC`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function sameRecord(
  left: z.infer<typeof sourceRecordSchema>,
  right: z.infer<typeof sourceRecordSchema>,
) {
  return (
    left.firstName === right.firstName &&
    left.lastName === right.lastName &&
    left.coachName.toLowerCase() === right.coachName.toLowerCase() &&
    normalizeSourceDate(left.courseEndDate) === normalizeSourceDate(right.courseEndDate)
  );
}

export async function POST(request: NextRequest) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const unique = new Map<string, z.infer<typeof sourceRecordSchema>>();
  const conflictingDuplicates: string[] = [];
  for (const record of parsed.data.records) {
    const email = normalizeEmail(record.email);
    const normalized = { ...record, email };
    const existing = unique.get(email);
    if (existing && !sameRecord(existing, normalized)) {
      conflictingDuplicates.push(email);
      unique.delete(email);
      continue;
    }
    if (!conflictingDuplicates.includes(email)) unique.set(email, normalized);
  }

  const [students, staff] = await Promise.all([
    db
      .select({
        id: users.id,
        clerkId: users.clerkId,
        email: users.email,
        name: users.name,
        assignedCoachId: users.assignedCoachId,
      })
      .from(users)
      .where(and(eq(users.role, "student"), isNull(users.deletedAt))),
    db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(isNull(users.deletedAt)),
  ]);

  const studentsByEmail = new Map(
    students.map((student) => [normalizeEmail(student.email), student]),
  );
  const staffByEmail = new Map(
    staff.map((member) => [normalizeEmail(member.email), member.id]),
  );
  const unmatchedEmails = Array.from(unique.keys()).filter(
    (email) => !studentsByEmail.has(email),
  );
  const matched = Array.from(unique.entries()).filter(([email]) =>
    studentsByEmail.has(email),
  );
  const clerk = await clerkClient();
  const results: Array<{
    email: string;
    changed: string[];
    error?: string;
  }> = [];

  for (let index = 0; index < matched.length; index += 10) {
    const batch = matched.slice(index, index + 10);
    const settled = await Promise.allSettled(
      batch.map(async ([email, source]) => {
        const student = studentsByEmail.get(email)!;
        const sourceCoachKey = source.coachName.trim().toLowerCase();
        if (!(sourceCoachKey in COACH_EMAIL_BY_SOURCE_NAME)) {
          throw new Error(`Unknown coach mapping: ${source.coachName || "(blank)"}`);
        }
        const coachEmail = COACH_EMAIL_BY_SOURCE_NAME[sourceCoachKey];
        const coachId = coachEmail ? staffByEmail.get(coachEmail) : null;
        if (coachEmail && !coachId) {
          throw new Error(`Coach account not found: ${coachEmail}`);
        }

        const sourceName = [source.firstName, source.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();
        const sourceEndDate = normalizeSourceDate(source.courseEndDate);
        if (source.courseEndDate && !sourceEndDate) {
          throw new Error(`Invalid course end date: ${source.courseEndDate}`);
        }

        const clerkUser = await clerk.users.getUser(student.clerkId);
        const metadata = (clerkUser.publicMetadata ?? {}) as Record<string, unknown>;
        const currentEndDate =
          typeof metadata.cmbCourseEndDate === "string"
            ? metadata.cmbCourseEndDate.slice(0, 10)
            : null;
        const changed: string[] = [];
        if ((student.name ?? "") !== sourceName) changed.push("name");
        if ((student.assignedCoachId ?? null) !== (coachId ?? null)) changed.push("coach");
        if (currentEndDate !== sourceEndDate) changed.push("courseEndDate");

        if (parsed.data.apply && changed.length > 0) {
          if (changed.includes("name") || changed.includes("coach")) {
            await db
              .update(users)
              .set({
                ...(changed.includes("name") ? { name: sourceName || null } : {}),
                ...(changed.includes("coach")
                  ? { assignedCoachId: coachId ?? null }
                  : {}),
              })
              .where(eq(users.id, student.id));
          }
          if (changed.includes("name")) {
            await clerk.users.updateUser(student.clerkId, {
              firstName: source.firstName || undefined,
              lastName: source.lastName || undefined,
            });
          }
          if (changed.includes("courseEndDate")) {
            await clerk.users.updateUserMetadata(student.clerkId, {
              publicMetadata: {
                ...metadata,
                cmbCourseEndDate: sourceEndDate
                  ? `${sourceEndDate}T23:59:59.999Z`
                  : null,
              },
            });
          }
        }

        return { email, changed };
      }),
    );

    settled.forEach((result, offset) => {
      if (result.status === "fulfilled") results.push(result.value);
      else {
        results.push({
          email: batch[offset][0],
          changed: [],
          error:
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown reconciliation error",
        });
      }
    });
  }

  return NextResponse.json({
    mode: parsed.data.apply ? "apply" : "preview",
    sourceRows: parsed.data.records.length,
    uniqueSourceEmails: unique.size,
    matchedStudents: matched.length,
    unmatchedCount: unmatchedEmails.length,
    conflictingDuplicates,
    changedStudents: results.filter((result) => result.changed.length > 0).length,
    unchangedStudents: results.filter(
      (result) => result.changed.length === 0 && !result.error,
    ).length,
    errorCount: results.filter((result) => result.error).length,
    unmatchedEmails,
    results,
  });
}
