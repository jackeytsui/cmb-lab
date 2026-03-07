import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { courseAccess, courses } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ studentId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { studentId } = await params;

  // Check permission
  const authorized = await hasMinimumRole("coach");
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    // Fetch all courses
    const allCourses = await db
      .select({
        id: courses.id,
        title: courses.title,
      })
      .from(courses);

    // Fetch existing access for student
    const existingAccess = await db
      .select({
        courseId: courseAccess.courseId,
        accessTier: courseAccess.accessTier,
        expiresAt: courseAccess.expiresAt,
      })
      .from(courseAccess)
      .where(eq(courseAccess.userId, studentId));

    return NextResponse.json({
      courses: allCourses,
      access: existingAccess,
    });
  } catch (error) {
    console.error("Failed to fetch student access:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { studentId } = await params;

  // Check permission
  const authorized = await hasMinimumRole("admin"); // Only admins can modify access
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { courseId, action } = body; // action: "grant" | "revoke"

    if (!courseId || !action) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (action === "grant") {
      // Check if already exists
      const existing = await db
        .select()
        .from(courseAccess)
        .where(
          and(
            eq(courseAccess.userId, studentId),
            eq(courseAccess.courseId, courseId)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(courseAccess).values({
          userId: studentId,
          courseId: courseId,
          accessTier: "full",
          grantedBy: "admin",
        });
      }
    } else if (action === "revoke") {
      await db
        .delete(courseAccess)
        .where(
          and(
            eq(courseAccess.userId, studentId),
            eq(courseAccess.courseId, courseId)
          )
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update student access:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
