import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { getStudentsPageData, type StudentQueryParams } from "@/lib/student-queries";

/**
 * GET /api/admin/students
 * List students with sorting, filtering, enrichment, and pagination.
 *
 * Query params:
 * - page: page number (default 1)
 * - pageSize: results per page (default 25, max 100)
 * - sortBy: "name" | "email" | "createdAt" | "lastActive" | "completionPercent" (default "createdAt")
 * - sortOrder: "asc" | "desc" (default "desc")
 * - search: filter by name/email (case-insensitive)
 * - tagIds: comma-separated tag UUIDs for "any of" filtering
 * - courseId: filter to students enrolled in a specific course
 * - atRisk: "true" to show only students with no activity in last 7 days
 *
 * Legacy params (backward compatible):
 * - limit: maps to pageSize (default 50)
 * - offset: maps to page calculation
 *
 * Returns: { students: StudentRow[], total: number }
 *
 * Requires coach+ role.
 */
export async function GET(request: NextRequest) {
  // 1. Verify user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify user has coach+ role (coaches manage students)
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // 3. Parse query params with backward compatibility
    const { searchParams } = new URL(request.url);

    // New pagination params
    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("pageSize");

    // Legacy pagination params
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    // Determine pageSize: prefer new param, fall back to legacy limit, default 25
    let pageSize: number;
    if (pageSizeParam) {
      pageSize = Math.min(Math.max(parseInt(pageSizeParam) || 25, 1), 100);
    } else if (limitParam) {
      pageSize = Math.min(Math.max(parseInt(limitParam) || 50, 1), 100);
    } else {
      pageSize = 25;
    }

    // Determine page: prefer new param, calculate from legacy offset, default 1
    let page: number;
    if (pageParam) {
      page = Math.max(parseInt(pageParam) || 1, 1);
    } else if (offsetParam) {
      const offset = parseInt(offsetParam) || 0;
      page = Math.floor(offset / pageSize) + 1;
    } else {
      page = 1;
    }

    // Sorting
    const validSortColumns = ["name", "email", "createdAt", "lastActive", "completionPercent"];
    const sortByRaw = searchParams.get("sortBy") || "createdAt";
    const sortBy = validSortColumns.includes(sortByRaw) ? sortByRaw : "createdAt";
    const sortOrderRaw = searchParams.get("sortOrder") || "desc";
    const sortOrder: "asc" | "desc" = sortOrderRaw === "asc" ? "asc" : "desc";

    // Filtering
    const search = searchParams.get("search") || undefined;
    const tagIdsParam = searchParams.get("tagIds");
    const tagIds = tagIdsParam
      ? tagIdsParam.split(",").filter((id) => id.trim())
      : undefined;
    const courseId = searchParams.get("courseId") || undefined;
    const atRiskParam = searchParams.get("atRisk");
    const atRisk = atRiskParam === "true" ? true : undefined;

    // 4. Execute query
    const params: StudentQueryParams = {
      page,
      pageSize,
      sortBy,
      sortOrder,
      search,
      tagIds,
      courseId,
      atRisk,
    };

    const result = await getStudentsPageData(params);

    return NextResponse.json({
      students: result.students,
      total: result.total,
    });
  } catch (error) {
    console.error("Error fetching students:", error);
    return NextResponse.json(
      { error: "Failed to fetch students" },
      { status: 500 }
    );
  }
}
