import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { syncEvents } from "@/db/schema";
import { desc, eq, and, count } from "drizzle-orm";

/**
 * GET /api/admin/ghl/sync-events
 * List sync events with optional filtering and pagination.
 * Requires admin role.
 *
 * Query params:
 *   direction - "inbound" | "outbound" (optional)
 *   status - "pending" | "processing" | "completed" | "failed" (optional)
 *   limit - number, default 50, max 200 (optional)
 *   offset - number, default 0 (optional)
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = request.nextUrl;

    const direction = searchParams.get("direction") as
      | "inbound"
      | "outbound"
      | null;
    const status = searchParams.get("status") as
      | "pending"
      | "processing"
      | "completed"
      | "failed"
      | null;
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
      200
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") || "0", 10) || 0,
      0
    );

    // Build where conditions
    const conditions = [];
    if (
      direction &&
      (direction === "inbound" || direction === "outbound")
    ) {
      conditions.push(eq(syncEvents.direction, direction));
    }
    if (
      status &&
      ["pending", "processing", "completed", "failed"].includes(status)
    ) {
      conditions.push(
        eq(
          syncEvents.status,
          status as "pending" | "processing" | "completed" | "failed"
        )
      );
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch events and total count in parallel
    const [events, [totalResult]] = await Promise.all([
      db
        .select()
        .from(syncEvents)
        .where(whereClause)
        .orderBy(desc(syncEvents.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(syncEvents)
        .where(whereClause),
    ]);

    return NextResponse.json({
      events,
      total: totalResult?.total ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching sync events:", error);
    return NextResponse.json(
      { error: "Failed to fetch sync events" },
      { status: 500 }
    );
  }
}
