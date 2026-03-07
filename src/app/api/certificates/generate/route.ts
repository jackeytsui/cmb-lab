import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  checkCourseCompletion,
  createCertificate,
} from "@/lib/certificates";

export async function POST(request: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const { courseId } = body;
    if (!courseId) {
      return NextResponse.json(
        { error: "courseId is required" },
        { status: 400 }
      );
    }

    const isComplete = await checkCourseCompletion(user.id, courseId);
    if (!isComplete) {
      return NextResponse.json(
        { error: "Course not completed" },
        { status: 400 }
      );
    }

    const certificate = await createCertificate(user.id, courseId);

    return NextResponse.json({
      certificate: {
        verificationId: certificate.verificationId,
        completedAt: certificate.completedAt,
      },
    });
  } catch (error) {
    console.error("Certificate generation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
