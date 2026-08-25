// Daily sweep that proactively expires student portal access after the
// configured CMB course end date. Schedule: daily at 09:00 UTC.

import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  buildExpiredPortalMetadata,
  getPortalExpiryDecision,
} from "@/lib/portal-expiry";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CLERK_PAGE_SIZE = 100;
const UPDATE_BATCH_SIZE = 10;

function getCronSecret(value: string | undefined) {
  const secret = value?.trim();
  return secret ? secret : null;
}

export async function GET(request: Request) {
  const cronSecret = getCronSecret(process.env.CRON_SECRET);
  if (!cronSecret) {
    if (process.env.VERCEL_ENV === "production") {
      console.error("[Portal Expiry Cron] CRON_SECRET is not configured in production");
      return NextResponse.json(
        { error: "Cron authentication is not configured" },
        { status: 503 },
      );
    }
    return NextResponse.json({ skipped: true, reason: "no_cron_secret" });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const studentRows = await db
    .select({ clerkId: users.clerkId })
    .from(users)
    .where(
      and(
        eq(users.role, "student"),
        isNull(users.deletedAt),
      ),
    );
  const studentClerkIds = new Set(studentRows.map((row) => row.clerkId));

  const clerk = await clerkClient();
  const clerkStudents: Array<{
    id: string;
    locked?: boolean;
    publicMetadata: Record<string, unknown>;
  }> = [];

  for (let offset = 0; ; offset += CLERK_PAGE_SIZE) {
    const page = await clerk.users.getUserList({
      limit: CLERK_PAGE_SIZE,
      offset,
    });
    for (const user of page.data) {
      if (!studentClerkIds.has(user.id)) continue;
      clerkStudents.push({
        id: user.id,
        locked: user.locked,
        publicMetadata: (user.publicMetadata ?? {}) as Record<string, unknown>,
      });
    }
    if (offset + page.data.length >= page.totalCount || page.data.length === 0) {
      break;
    }
  }

  const stats = {
    students: studentClerkIds.size,
    clerkMatches: clerkStudents.length,
    expired: 0,
    alreadyExpired: 0,
    locksRecovered: 0,
    notEnded: 0,
    missingEndDate: 0,
    invalidEndDate: 0,
    failed: 0,
  };
  const now = new Date();

  for (let index = 0; index < clerkStudents.length; index += UPDATE_BATCH_SIZE) {
    const batch = clerkStudents.slice(index, index + UPDATE_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (student) => {
        const decision = getPortalExpiryDecision(student.publicMetadata, now);

        if (decision.reason === "already_expired") {
          if (student.locked !== true) {
            await clerk.users.lockUser(student.id);
            return "locksRecovered" as const;
          }
          return "alreadyExpired" as const;
        }
        if (!decision.shouldExpire) {
          if (decision.reason === "not_ended") return "notEnded" as const;
          if (decision.reason === "missing_end_date") return "missingEndDate" as const;
          return "invalidEndDate" as const;
        }

        await clerk.users.updateUserMetadata(student.id, {
          publicMetadata: buildExpiredPortalMetadata(student.publicMetadata, now),
        });
        await clerk.users.lockUser(student.id);
        return "expired" as const;
      }),
    );

    settled.forEach((result, offset) => {
      if (result.status === "fulfilled") {
        stats[result.value] += 1;
        return;
      }
      stats.failed += 1;
      console.error("[Portal Expiry Cron] Student update failed", {
        studentId: batch[offset].id,
      });
    });
  }

  return NextResponse.json(stats);
}
