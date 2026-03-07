import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { parseDateRange, formatCsvResponse } from "@/lib/analytics";
import { getOverviewData } from "../overview/route";
import { getCompletionData } from "../completion/route";
import { getDropoffData } from "../dropoff/route";
import { getStudentsData } from "../students/route";
import { getDifficultyData } from "../difficulty/route";
import {
  getEngagedStudents,
  getEngagementByFeature,
  getEngagementEventsForExport,
  getEngagementOverview,
} from "@/lib/engagement-analytics";

/**
 * GET /api/admin/analytics/export
 * Exports analytics data as CSV.
 * Accepts `metric` query param:
 * overview | completion | dropoff | students | difficulty |
 * engagement_overview | engagement_features | engagement_students | engagement_events
 * Coaches can also access this endpoint (not just admins).
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Coaches can export too (ANLYT-08)
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const metric = searchParams.get("metric");
    const { from, to } = parseDateRange(searchParams);

    if (!metric) {
      return NextResponse.json(
        { error: "Missing required 'metric' query parameter" },
        { status: 400 }
      );
    }

    let headers: string[];
    let rows: (string | number | null)[][];

    switch (metric) {
      case "overview": {
        const data = await getOverviewData(from, to);
        headers = ["Metric", "Value"];
        rows = [
          ["Active Students", data.activeStudents],
          ["Total Students", data.totalStudents],
          ["Inactive Students (Logged In Before)", data.inactiveStudentsLoggedInOnce],
          ["Inactive Students (Never Logged In)", data.inactiveStudentsNeverLoggedIn],
        ];
        break;
      }

      case "completion": {
        const data = await getCompletionData(from, to);
        headers = [
          "Course",
          "Total Lessons",
          "Enrolled",
          "Completed",
          "Completion Rate",
        ];
        rows = data.map((row) => [
          row.courseTitle,
          row.totalLessons,
          row.enrolledStudents,
          row.completedStudents,
          row.completionRate,
        ]);
        break;
      }

      case "dropoff": {
        const data = await getDropoffData(from, to);
        headers = [
          "Lesson",
          "Module",
          "Course",
          "Started",
          "Completed",
          "Drop-off Rate",
        ];
        rows = data.map((row) => [
          row.lessonTitle,
          row.moduleTitle,
          row.courseTitle,
          row.startedCount,
          row.completedCount,
          row.dropoffRate,
        ]);
        break;
      }

      case "students": {
        const data = await getStudentsData(from, to);
        headers = [
          "Name",
          "Email",
          "Last Activity",
          "Days Inactive",
          "Lessons Completed",
        ];
        rows = data.map((row) => [
          row.name,
          row.email,
          row.lastActivity,
          row.daysSinceActivity,
          row.totalLessonsCompleted,
        ]);
        break;
      }

      case "difficulty": {
        const data = await getDifficultyData(from, to);
        headers = [
          "Lesson",
          "Module",
          "Course",
          "Interactions",
          "Avg Attempts",
        ];
        rows = data.map((row) => [
          row.lessonTitle,
          row.moduleTitle,
          row.courseTitle,
          row.interactionCount,
          row.avgAttemptsToPass,
        ]);
        break;
      }

      case "engagement_overview": {
        const data = await getEngagementOverview(from, to);
        headers = ["Metric", "Value"];
        rows = [
          ["Active Students", data.activeStudents],
          ["Total Events", data.totalEvents],
          ["Action Events", data.actionEvents],
          ["Total Sessions", data.totalSessions],
          ["Total Minutes", data.totalMinutes],
          ["Avg Events Per Active Student", data.avgEventsPerActiveStudent],
          ["Avg Session Minutes", data.avgSessionMinutes],
          ["Avg Active Minutes Per Active Student", data.avgActiveMinutesPerActiveStudent],
          ["Top Feature", data.topFeature ?? ""],
        ];
        break;
      }

      case "engagement_features": {
        const data = await getEngagementByFeature(from, to);
        headers = [
          "Feature",
          "Feature Key",
          "Active Students",
          "Total Events",
          "Page Views",
          "Actions",
          "Sessions",
          "Total Minutes",
          "Avg Session Minutes",
          "Active Days",
        ];
        rows = data.map((row) => [
          row.featureLabel,
          row.featureKey,
          row.activeStudents,
          row.totalEvents,
          row.pageViews,
          row.actions,
          row.sessions,
          row.totalMinutes,
          row.avgSessionMinutes,
          row.activeDays,
        ]);
        break;
      }

      case "engagement_students": {
        const data = await getEngagedStudents(from, to, 1000);
        headers = [
          "Student",
          "Email",
          "Total Events",
          "Actions",
          "Sessions",
          "Total Minutes",
          "Avg Session Minutes",
          "Top Feature",
          "Last Activity",
        ];
        rows = data.map((row) => [
          row.name ?? "",
          row.email ?? "",
          row.totalEvents,
          row.actions,
          row.sessions,
          row.totalMinutes,
          row.avgSessionMinutes,
          row.topFeatureLabel ?? "",
          row.lastActivityAt ?? "",
        ]);
        break;
      }

      case "engagement_events": {
        const data = await getEngagementEventsForExport(from, to);
        headers = [
          "Created At",
          "Feature",
          "Feature Key",
          "Event Type",
          "Action",
          "Session Key",
          "Duration (ms)",
          "Route",
          "Student Name",
          "Student Email",
        ];
        rows = data.map((row) => [
          row.createdAt,
          row.featureLabel,
          row.featureKey,
          row.eventType,
          row.action,
          row.sessionKey,
          row.durationMs,
          row.route,
          row.userName,
          row.userEmail,
        ]);
        break;
      }

      default:
        return NextResponse.json(
          {
            error:
              "Invalid metric. Must be one of: overview, completion, dropoff, students, difficulty, engagement_overview, engagement_features, engagement_students, engagement_events",
          },
          { status: 400 }
        );
    }

    return formatCsvResponse(headers, rows);
  } catch (error) {
    console.error("Error exporting analytics:", error);
    return NextResponse.json(
      { error: "Failed to export analytics" },
      { status: 500 }
    );
  }
}
