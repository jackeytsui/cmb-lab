// src/app/api/coaching/one-on-one-timeline/route.ts
//
// Coach-only. Given a student's email, resolves their GHL program window
// (start / end date custom fields) and tags, then returns the computed 1:1
// coaching timeline — months + days left plus the reminders that should
// surface for the coach right now (Sheldon sessions, consultant call).
//
// Each student resolves to their own GHL contact, so the timeline is naturally
// per-student. Degrades gracefully: an unlinked contact or missing dates
// returns hasWindow=false rather than erroring.

import { NextRequest, NextResponse } from "next/server";
import { ilike } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import {
  fetchGhlContactData,
  resolveCustomFields,
} from "@/lib/ghl/contact-fields";
import { getOneOnOneCoachingConfig } from "@/lib/coaching/one-on-one-config";
import { computeCoachingTimeline } from "@/lib/coaching/timeline";

export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = request.nextUrl.searchParams.get("studentEmail");
  if (!email) {
    return NextResponse.json(
      { error: "studentEmail required" },
      { status: 400 }
    );
  }

  const config = getOneOnOneCoachingConfig();

  try {
    const student = await db.query.users.findFirst({
      where: ilike(users.email, email.trim()),
      columns: { id: true },
    });

    if (!student) {
      return NextResponse.json({ linked: false, timeline: null });
    }

    const { data } = await fetchGhlContactData(student.id);
    if (!data) {
      // Student exists but isn't linked to a GHL contact.
      return NextResponse.json({ linked: false, timeline: null });
    }

    // Resolve mapped custom fields → find the program start / end concepts.
    const resolved = await resolveCustomFields(data.customFields);
    const byConcept = new Map(resolved.map((f) => [f.lmsConcept, f.value]));
    const start = byConcept.get("start_date") ?? null;
    const end = byConcept.get("end_date") ?? null;

    const timeline = computeCoachingTimeline({
      start,
      end,
      tags: data.tags ?? [],
      config,
    });

    // Serialize dates to ISO for the client.
    return NextResponse.json({
      linked: true,
      timeline: {
        ...timeline,
        startDate: timeline.startDate?.toISOString() ?? null,
        endDate: timeline.endDate?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error("[Coaching Timeline] Failed to compute timeline:", error);
    return NextResponse.json(
      { error: "Failed to compute coaching timeline" },
      { status: 500 }
    );
  }
}
