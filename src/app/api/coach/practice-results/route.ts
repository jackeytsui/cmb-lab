import { NextRequest, NextResponse } from "next/server";
import { getPracticeResults } from "@/lib/coach-practice";
import type { PracticeResultsFilters } from "@/lib/coach-practice";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";

/**
 * GET /api/coach/practice-results
 *
 * Returns combined practice attempt details and aggregate analytics for coaches.
 * Supports filtering by student name, practice set, date range, and score range.
 *
 * Query params:
 *   student  — search by student name or email (partial match)
 *   setId    — filter by practice set ID ("all" skips)
 *   from     — start date (ISO string)
 *   to       — end date (ISO string)
 *   scoreMin — minimum score (0-100)
 *   scoreMax — maximum score (0-100)
 */
export async function GET(request: NextRequest) {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);

    // Parse filter query params
    const filters: PracticeResultsFilters = {};

    const student = searchParams.get("student");
    if (student) {
      filters.studentName = student;
    }

    const setId = searchParams.get("setId");
    if (setId && setId !== "all") {
      filters.practiceSetId = setId;
    }

    const fromStr = searchParams.get("from");
    if (fromStr) {
      const fromDate = new Date(fromStr);
      if (!isNaN(fromDate.getTime())) {
        filters.dateFrom = fromDate;
      }
    }

    const toStr = searchParams.get("to");
    if (toStr) {
      const toDate = new Date(toStr);
      if (!isNaN(toDate.getTime())) {
        filters.dateTo = toDate;
      }
    }

    const scoreMinStr = searchParams.get("scoreMin");
    if (scoreMinStr) {
      const scoreMin = parseInt(scoreMinStr, 10);
      if (!isNaN(scoreMin) && scoreMin >= 0 && scoreMin <= 100) {
        filters.scoreMin = scoreMin;
      }
    }

    const scoreMaxStr = searchParams.get("scoreMax");
    if (scoreMaxStr) {
      const scoreMax = parseInt(scoreMaxStr, 10);
      if (!isNaN(scoreMax) && scoreMax >= 0 && scoreMax <= 100) {
        filters.scoreMax = scoreMax;
      }
    }

    const data = await getPracticeResults(
      filters,
      access.actor.role === "admin" ? null : access.actor.id,
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching practice results:", error);
    return NextResponse.json(
      { error: "Failed to fetch practice results" },
      { status: 500 }
    );
  }
}
