import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { parseDateRange } from "@/lib/analytics";
import {
  featureLabel,
  getEngagedStudents,
  getEngagementByFeature,
  getEngagementOverview,
  RELEASED_ENGAGEMENT_FEATURES,
} from "@/lib/engagement-analytics";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const { from, to } = parseDateRange(searchParams);
    const limit = Math.min(
      200,
      Math.max(10, Number.parseInt(searchParams.get("limit") ?? "100", 10) || 100),
    );

    const [overview, features, students] = await Promise.all([
      getEngagementOverview(from, to),
      getEngagementByFeature(from, to),
      getEngagedStudents(from, to, limit),
    ]);

    return NextResponse.json({ overview, features, students });
  } catch (error) {
    console.error("Error fetching engagement analytics:", error);
    return NextResponse.json(
      {
        overview: {
          activeStudents: 0,
          totalEvents: 0,
          actionEvents: 0,
          totalSessions: 0,
          totalMinutes: 0,
          avgEventsPerActiveStudent: 0,
          avgSessionMinutes: 0,
          avgActiveMinutesPerActiveStudent: 0,
          topFeature: null,
          topFeatureKey: null,
        },
        features: RELEASED_ENGAGEMENT_FEATURES.map((feature) => ({
          featureKey: feature,
          featureLabel: featureLabel(feature),
          activeStudents: 0,
          totalEvents: 0,
          pageViews: 0,
          actions: 0,
          sessions: 0,
          totalMinutes: 0,
          avgSessionMinutes: 0,
          activeDays: 0,
        })),
        students: [],
      },
      { status: 200 },
    );
  }
}
