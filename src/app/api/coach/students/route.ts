import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Verify coach role
  const isCoach = await hasMinimumRole("coach");
  if (!isCoach) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    // Return all students. In a more complex LMS, we might filter by assigned students.
    const studentList = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        imageUrl: users.imageUrl,
      })
      .from(users)
      .where(eq(users.role, "student"));

    return NextResponse.json({ students: studentList });
  } catch (error) {
    console.error("Error fetching students:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
