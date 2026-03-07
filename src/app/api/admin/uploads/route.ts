import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { videoUploads } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";

/**
 * GET /api/admin/uploads
 * List uploaded videos with optional status filter.
 * Requires coach role minimum.
 *
 * Query params:
 *   status - Filter by upload status (pending, uploading, processing, ready, errored)
 *   category - Filter by category (lesson, prompt, other)
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const categoryFilter = searchParams.get("category");

    const conditions = [];

    if (
      statusFilter &&
      ["pending", "uploading", "processing", "ready", "errored"].includes(
        statusFilter
      )
    ) {
      conditions.push(
        eq(
          videoUploads.status,
          statusFilter as
            | "pending"
            | "uploading"
            | "processing"
            | "ready"
            | "errored"
        )
      );
    }

    if (
        categoryFilter &&
        ["lesson", "prompt", "other"].includes(categoryFilter)
    ) {
        conditions.push(
            eq(
                videoUploads.category,
                categoryFilter as "lesson" | "prompt" | "other"
            )
        );
    }

    let query = db
      .select()
      .from(videoUploads)
      .orderBy(desc(videoUploads.createdAt));

    if (conditions.length > 0) {
        // @ts-expect-error - drizzle query builder typing
        query = query.where(and(...conditions));
    }

    const uploads = await query;

    return NextResponse.json({ uploads });
  } catch (error) {
    console.error("Error listing uploads:", error);
    return NextResponse.json(
      { error: "Failed to list uploads" },
      { status: 500 }
    );
  }
}
