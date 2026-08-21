import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getRealUser } from "@/lib/auth";
import { excludeWhitelistedUsersSql } from "@/lib/analytics-whitelist";

export async function GET() {
  const user = await getRealUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Verify coach role
  if (user.role !== "admin" && user.role !== "coach") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const conditions = [
      eq(users.role, "student"),
      isNull(users.deletedAt),
      excludeWhitelistedUsersSql(users.id),
    ];
    if (user.role !== "admin") {
      conditions.push(eq(users.assignedCoachId, user.id));
    }

    const studentList = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        imageUrl: users.imageUrl,
      })
      .from(users)
      .where(and(...conditions));

    return NextResponse.json({ students: studentList });
  } catch (error) {
    console.error("Error fetching students:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
