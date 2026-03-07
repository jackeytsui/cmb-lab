import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, courses, courseAccess } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";

/**
 * GET /api/students/[studentId]/access
 * List all course access records for a specific student.
 *
 * Requires coach or admin role.
 * Returns course access with joined course details.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  // Require authentication
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Require coach role minimum
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = await params;

  // Validate studentId format (UUID)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return NextResponse.json(
      { error: "Invalid student ID format" },
      { status: 400 }
    );
  }

  try {
    // Verify student exists and has role "student"
    const student = await db.query.users.findFirst({
      where: and(eq(users.id, studentId), eq(users.role, "student")),
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Query course access with joined course data
    const accessRecords = await db
      .select({
        courseId: courseAccess.courseId,
        courseTitle: courses.title,
        accessTier: courseAccess.accessTier,
        grantedBy: courseAccess.grantedBy,
        expiresAt: courseAccess.expiresAt,
        createdAt: courseAccess.createdAt,
      })
      .from(courseAccess)
      .innerJoin(courses, eq(courseAccess.courseId, courses.id))
      .where(
        and(eq(courseAccess.userId, studentId), isNull(courses.deletedAt))
      );

    // Format response with ISO strings for dates
    const formattedAccess = accessRecords.map((record) => ({
      courseId: record.courseId,
      courseTitle: record.courseTitle,
      accessTier: record.accessTier,
      grantedBy: record.grantedBy,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    }));

    return NextResponse.json({ access: formattedAccess });
  } catch (error) {
    console.error("Error fetching student access:", error);
    return NextResponse.json(
      { error: "Failed to fetch student access" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/students/[studentId]/access
 * Grant course access to a student.
 *
 * Requires coach or admin role.
 * Body: { courseId: string, accessTier?: "preview" | "full", expiresAt?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  // Require authentication
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Require coach role minimum
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = await params;

  // Validate studentId format (UUID)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return NextResponse.json(
      { error: "Invalid student ID format" },
      { status: 400 }
    );
  }

  // Parse and validate request body
  let body: {
    courseId?: string;
    accessTier?: "preview" | "full";
    expiresAt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { courseId, accessTier = "full", expiresAt } = body;

  // Validate required fields
  if (!courseId) {
    return NextResponse.json(
      { error: "courseId is required" },
      { status: 400 }
    );
  }

  if (!uuidRegex.test(courseId)) {
    return NextResponse.json(
      { error: "Invalid course ID format" },
      { status: 400 }
    );
  }

  // Validate accessTier
  if (accessTier !== "preview" && accessTier !== "full") {
    return NextResponse.json(
      { error: "accessTier must be 'preview' or 'full'" },
      { status: 400 }
    );
  }

  // Validate expiresAt if provided
  let expiresAtDate: Date | null = null;
  if (expiresAt) {
    expiresAtDate = new Date(expiresAt);
    if (isNaN(expiresAtDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid expiresAt date format" },
        { status: 400 }
      );
    }
  }

  try {
    // Verify student exists and has role "student"
    const student = await db.query.users.findFirst({
      where: and(eq(users.id, studentId), eq(users.role, "student")),
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Verify course exists and is not deleted
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, courseId), isNull(courses.deletedAt)),
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Check if access already exists
    const existingAccess = await db.query.courseAccess.findFirst({
      where: and(
        eq(courseAccess.userId, studentId),
        eq(courseAccess.courseId, courseId)
      ),
    });

    if (existingAccess) {
      return NextResponse.json(
        { error: "Student already has access to this course" },
        { status: 409 }
      );
    }

    // Create access record
    const [newAccess] = await db
      .insert(courseAccess)
      .values({
        userId: studentId,
        courseId,
        accessTier,
        grantedBy: "coach",
        expiresAt: expiresAtDate,
      })
      .returning();

    return NextResponse.json(
      {
        access: {
          id: newAccess.id,
          courseId: newAccess.courseId,
          courseTitle: course.title,
          accessTier: newAccess.accessTier,
          grantedBy: newAccess.grantedBy,
          expiresAt: newAccess.expiresAt?.toISOString() ?? null,
          createdAt: newAccess.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error granting course access:", error);
    return NextResponse.json(
      { error: "Failed to grant course access" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/students/[studentId]/access
 * Revoke course access from a student.
 *
 * Requires coach or admin role.
 * Query param: courseId (required)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  // Require authentication
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Require coach role minimum
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = await params;

  // Validate studentId format (UUID)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return NextResponse.json(
      { error: "Invalid student ID format" },
      { status: 400 }
    );
  }

  // Get courseId from query params
  const url = new URL(request.url);
  const courseId = url.searchParams.get("courseId");

  if (!courseId) {
    return NextResponse.json(
      { error: "courseId query parameter is required" },
      { status: 400 }
    );
  }

  if (!uuidRegex.test(courseId)) {
    return NextResponse.json(
      { error: "Invalid course ID format" },
      { status: 400 }
    );
  }

  try {
    // Check if access exists
    const existingAccess = await db.query.courseAccess.findFirst({
      where: and(
        eq(courseAccess.userId, studentId),
        eq(courseAccess.courseId, courseId)
      ),
    });

    if (!existingAccess) {
      return NextResponse.json(
        { error: "Access record not found" },
        { status: 404 }
      );
    }

    // Delete access record
    await db
      .delete(courseAccess)
      .where(
        and(
          eq(courseAccess.userId, studentId),
          eq(courseAccess.courseId, courseId)
        )
      );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error revoking course access:", error);
    return NextResponse.json(
      { error: "Failed to revoke course access" },
      { status: 500 }
    );
  }
}
