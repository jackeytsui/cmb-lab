import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import {
  getStudentsPageData,
  type StudentQueryParams,
} from "@/lib/student-queries";
import { formatCsvRow } from "@/lib/analytics";

/** Column definitions for CSV export */
const COLUMN_DEFS: Record<
  string,
  { header: string; accessor: (row: ExportRow) => string | number | null }
> = {
  name: {
    header: "Name",
    accessor: (r) => r.name,
  },
  email: {
    header: "Email",
    accessor: (r) => r.email,
  },
  coursesEnrolled: {
    header: "Courses Enrolled",
    accessor: (r) => r.coursesEnrolled,
  },
  completionPercent: {
    header: "Completion %",
    accessor: (r) => r.completionPercent,
  },
  lastActive: {
    header: "Last Active",
    accessor: (r) => r.lastActive,
  },
  tags: {
    header: "Tags",
    accessor: (r) => r.tags.map((t) => t.name).join(", "),
  },
  createdAt: {
    header: "Joined Date",
    accessor: (r) => r.createdAt,
  },
};

const DEFAULT_COLUMNS = [
  "name",
  "email",
  "coursesEnrolled",
  "completionPercent",
  "lastActive",
  "tags",
  "createdAt",
];

type ExportRow = {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  createdAt: string;
  coursesEnrolled: number;
  completionPercent: number;
  lastActive: string | null;
  tags: { id: string; name: string; color: string; type: string }[];
};

/**
 * GET /api/admin/students/export
 * Export filtered student data as CSV.
 * Accepts same filter params as /api/admin/students plus `columns` param.
 * Requires coach+ role.
 */
export async function GET(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);

    // Parse filter params (same as main students API)
    const validSortColumns = [
      "name",
      "email",
      "createdAt",
      "lastActive",
      "completionPercent",
    ];
    const sortByRaw = searchParams.get("sortBy") || "createdAt";
    const sortBy = validSortColumns.includes(sortByRaw)
      ? sortByRaw
      : "createdAt";
    const sortOrderRaw = searchParams.get("sortOrder") || "desc";
    const sortOrder: "asc" | "desc" =
      sortOrderRaw === "asc" ? "asc" : "desc";

    const search = searchParams.get("search") || undefined;
    const tagIdsParam = searchParams.get("tagIds");
    const tagIds = tagIdsParam
      ? tagIdsParam.split(",").filter((id) => id.trim())
      : undefined;
    const courseId = searchParams.get("courseId") || undefined;
    const atRiskParam = searchParams.get("atRisk");
    const atRisk = atRiskParam === "true" ? true : undefined;

    // Parse columns param
    const columnsParam = searchParams.get("columns");
    const requestedColumns = columnsParam
      ? columnsParam.split(",").filter((c) => c.trim() in COLUMN_DEFS)
      : DEFAULT_COLUMNS;

    // Fetch all matching students (up to 10000)
    const params: StudentQueryParams = {
      page: 1,
      pageSize: 10000,
      sortBy,
      sortOrder,
      search,
      tagIds,
      courseId,
      atRisk,
    };

    const result = await getStudentsPageData(params);

    // Build CSV
    const headers = requestedColumns.map(
      (col) => COLUMN_DEFS[col]?.header || col,
    );
    let csv = formatCsvRow(headers);

    for (const student of result.students) {
      const row = requestedColumns.map(
        (col) => COLUMN_DEFS[col]?.accessor(student as ExportRow) ?? "",
      );
      csv += formatCsvRow(row);
    }

    // Generate filename with current date
    const date = new Date().toISOString().split("T")[0];

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="students-export-${date}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting students:", error);
    return NextResponse.json(
      { error: "Failed to export students" },
      { status: 500 },
    );
  }
}
