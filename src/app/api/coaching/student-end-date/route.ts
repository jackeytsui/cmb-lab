// src/app/api/coaching/student-end-date/route.ts
// Course end date for a student, resolved live from GoHighLevel.
// GHL is the single source of truth here: the value comes from the contact's
// custom fields (explicit mapping -> mapping by name -> "end date" name
// heuristic) and is never read from LMS-side tables, so what the coach sees
// always matches the CRM.

import { NextRequest, NextResponse } from "next/server";
import { ilike } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import { findOrLinkContact, getGhlContactId } from "@/lib/ghl/contacts";
import {
  fetchGhlContactData,
  refreshGhlContactData,
} from "@/lib/ghl/contact-fields";
import { resolveAllowlistedFields } from "@/lib/lab-assistant/field-resolution";

/**
 * Normalize a GHL custom field value to a calendar date string (YYYY-MM-DD).
 * GHL date fields arrive as "YYYY-MM-DD", ISO timestamps, or epoch millis
 * depending on how the field was populated. Returning a plain date string
 * (not a Date) keeps the client from shifting the day across timezones.
 */
function normalizeToDateString(value: unknown): string | null {
  if (value == null) return null;

  if (typeof value === "string") {
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

  if (typeof value === "number") {
    // Epoch seconds vs millis: anything below 1e12 is seconds.
    const ms = value < 1e12 ? value * 1000 : value;
    const parsed = new Date(ms);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
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
      columns: { id: true },
    });

    if (!student) {
      return NextResponse.json({
        linked: false,
        endDate: null,
        lastFetchedAt: null,
        reason: "student_not_found",
      });
    }

    // Self-heal a missing GHL link so the coach doesn't need an admin to
    // link the contact first. Search failures just leave the link absent.
    let ghlContactId = await getGhlContactId(student.id);
    if (!ghlContactId) {
      try {
        const links = await findOrLinkContact(student.id, email);
        ghlContactId = links[0]?.ghlContactId ?? null;
      } catch {
        ghlContactId = null;
      }
    }

    if (!ghlContactId) {
      return NextResponse.json({
        linked: false,
        endDate: null,
        lastFetchedAt: null,
        reason: "not_linked",
      });
    }

    const result = refresh
      ? await refreshGhlContactData(student.id)
      : await fetchGhlContactData(student.id);

    if (!result.data) {
      return NextResponse.json({
        linked: true,
        endDate: null,
        lastFetchedAt: null,
        reason: "ghl_unavailable",
      });
    }

    const { values, via } = await resolveAllowlistedFields(
      ghlContactId,
      result.data.customFields ?? []
    );

    return NextResponse.json({
      linked: true,
      endDate: normalizeToDateString(values.end_date),
      resolvedVia: via.end_date,
      lastFetchedAt: result.lastFetchedAt,
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
