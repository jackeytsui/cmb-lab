import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { reconcileStudentAccessExpiry } from "@/lib/student-access-expiry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const students = await db.select({ id: users.id, clerkId: users.clerkId })
      .from(users).where(and(eq(users.role, "student"), isNull(users.deletedAt)));
    const result = await reconcileStudentAccessExpiry(await clerkClient(), students, {
      dryRun: new URL(request.url).searchParams.get("dryRun") === "true",
    });
    return NextResponse.json(result, { status: result.failed ? 500 : 200 });
  } catch (error) {
    console.error("[Student expiry] Reconciliation failed:", error);
    return NextResponse.json({ error: "Student access expiry check failed" }, { status: 500 });
  }
}
