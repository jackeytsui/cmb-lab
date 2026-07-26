// src/app/api/coaching/student-end-date/route.ts
// Course end date for a student, resolved live from GoHighLevel.
// GHL is the single source of truth here. The value is resolved through the
// same gatekept pipeline the Lab Assistant uses (getStudentContext): the
// student is identified by EMAIL, every linked contact is email-verified,
// the Course sub-account wins as the primary record, and each contact's
// fields resolve against its own location's catalog. What the coach sees
// always matches what the chatbot tells the student.

import { NextRequest, NextResponse } from "next/server";
import { eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { ghlContacts, users } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import { getStudentContext } from "@/lib/lab-assistant/student-context";

/**
 * Normalize a resolved end-date value to a calendar date string (YYYY-MM-DD).
 * getStudentContext already normalizes epoch/ISO datetimes; this handles the
 * remaining human-formatted strings ("Feb 06 2026") from GHL date fields.
 * Returning a plain date string (not a Date) keeps the client from shifting
 * the day across timezones.
 */
function normalizeToDateString(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
  if (dateOnly) return dateOnly[1];
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * GET /api/coaching/student-end-date?studentEmail=...
 * Supports ?refresh=true to bypass the GHL cache TTL.
 * Requires coach role.
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = request.nextUrl.searchParams.get("studentEmail")?.trim();
  if (!email) {
    return NextResponse.json({ error: "studentEmail required" }, { status: 400 });
  }
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";

  try {
    const student = await db.query.users.findFirst({
      where: ilike(users.email, email),
    });

    if (!student) {
      return NextResponse.json({
        linked: false,
        endDate: null,
        lastFetchedAt: null,
        reason: "student_not_found",
      });
    }

    // refresh=true invalidates the per-contact GHL cache so the reads below
    // hit the API fresh.
    if (refresh) {
      await db
        .update(ghlContacts)
        .set({ lastFetchedAt: null })
        .where(eq(ghlContacts.userId, student.id));
    }

    // Same pipeline as the Lab Assistant: email-verified links only,
    // Course sub-account first, per-location field resolution, merged.
    const context = await getStudentContext(student);

    if (!context.ghlContactId) {
      return NextResponse.json({
        linked: false,
        endDate: null,
        lastFetchedAt: null,
        reason: "not_linked",
      });
    }

    return NextResponse.json({
      linked: true,
      endDate: normalizeToDateString(context.fields.end_date),
      lastFetchedAt: new Date(),
      reason: null,
    });
  } catch (error) {
    console.error("Failed to fetch student end date from GHL:", error);
    return NextResponse.json(
      { error: "Failed to fetch end date" },
      { status: 500 }
    );
  }
}
