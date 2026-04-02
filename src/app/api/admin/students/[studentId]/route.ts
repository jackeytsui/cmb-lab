import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { users, courseAccess, lessonProgress } from "@/db/schema";
import { eq, sql, max } from "drizzle-orm";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ studentId: string }>;
}

const patchStudentSchema = z.object({
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  email: z.string().trim().email(),
  role: z.enum(["student", "coach", "admin"]),
});

/**
 * GET /api/admin/students/[studentId]
 * Get single student details with summary stats.
 * Requires admin role.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  // 1. Verify user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify user has admin role
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = await params;

  try {
    // 3. Fetch student from database
    const student = await db.query.users.findFirst({
      where: eq(users.id, studentId),
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // 4. Fetch summary stats in parallel
    const [coursesEnrolledResult, lessonsCompletedResult, lastActiveResult] =
      await Promise.all([
        // Count of courseAccess records
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(courseAccess)
          .where(eq(courseAccess.userId, studentId)),
        // Count of completed lessons
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(lessonProgress)
          .where(
            sql`${lessonProgress.userId} = ${studentId} AND ${lessonProgress.completedAt} IS NOT NULL`
          ),
        // Most recent lastAccessedAt
        db
          .select({ lastActive: max(lessonProgress.lastAccessedAt) })
          .from(lessonProgress)
          .where(eq(lessonProgress.userId, studentId)),
      ]);

    return NextResponse.json({
      student: {
        id: student.id,
        clerkId: student.clerkId,
        email: student.email,
        name: student.name,
        createdAt: student.createdAt,
      },
      stats: {
        coursesEnrolled: Number(coursesEnrolledResult[0]?.count || 0),
        lessonsCompleted: Number(lessonsCompletedResult[0]?.count || 0),
        lastActive: lastActiveResult[0]?.lastActive || null,
      },
    });
  } catch (error) {
    console.error("Error fetching student:", error);
    return NextResponse.json(
      { error: "Failed to fetch student" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/students/[studentId]
 * Update student profile fields (name/email/role) in both DB and Clerk.
 * Requires admin role.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = patchStudentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { studentId } = await params;
  const student = await db.query.users.findFirst({
    where: eq(users.id, studentId),
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const firstName = parsed.data.firstName?.trim() || "";
  const lastName = parsed.data.lastName?.trim() || "";
  const name = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
  const normalizedEmail = parsed.data.email.trim().toLowerCase();

  // Prevent duplicate local users by email.
  const existingEmail = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
    columns: { id: true },
  });
  if (existingEmail && existingEmail.id !== student.id) {
    return NextResponse.json(
      { error: "Another user already uses this email address" },
      { status: 409 }
    );
  }

  try {
    const clerk = await clerkClient();
    await clerk.users.updateUser(student.clerkId, {
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      primaryEmailAddressID: undefined,
    });

    // Update email via Clerk API only when changed.
    if (student.email.toLowerCase() !== normalizedEmail) {
      const clerkUser = await clerk.users.getUser(student.clerkId);
      const existingAddress = clerkUser.emailAddresses.find(
        (item) => item.emailAddress.toLowerCase() === normalizedEmail
      );

      const emailAddress =
        existingAddress ??
        (await clerk.emailAddresses.createEmailAddress({
          userId: student.clerkId,
          emailAddress: normalizedEmail,
          verified: true,
          primary: true,
        }));

      if (!existingAddress) {
        await clerk.users.updateUser(student.clerkId, {
          primaryEmailAddressID: emailAddress.id,
        });
      } else if (clerkUser.primaryEmailAddressId !== existingAddress.id) {
        await clerk.users.updateUser(student.clerkId, {
          primaryEmailAddressID: existingAddress.id,
        });
      }
    }
  } catch (error) {
    console.error("Failed to update Clerk student profile:", error);
    return NextResponse.json(
      { error: "Failed to update Clerk profile fields" },
      { status: 502 }
    );
  }

  const [updated] = await db
    .update(users)
    .set({
      email: normalizedEmail,
      name,
      role: parsed.data.role,
    })
    .where(eq(users.id, student.id))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    });

  return NextResponse.json({ student: updated });
}

/**
 * DELETE /api/admin/students/[studentId]
 * Soft-delete a user (sets deletedAt). Requires admin role.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = await params;
  const student = await db.query.users.findFirst({
    where: eq(users.id, studentId),
  });
  if (!student) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await db
    .update(users)
    .set({ deletedAt: new Date() })
    .where(eq(users.id, studentId));

  // Lock in Clerk so they can't log in
  try {
    const clerk = await clerkClient();
    await clerk.users.lockUser(student.clerkId);
  } catch {
    // Non-critical
  }

  return NextResponse.json({ success: true });
}
