import { NextRequest, NextResponse } from "next/server";
import { desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { syncEvents, users } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import { findPendingDuplicateEmailUsers } from "@/lib/ghl/contact-email-repair";
import { updateGhlContactEmail } from "@/lib/ghl/contacts";

const requestSchema = z.object({
  dryRun: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const recentEvents = await db
    .select({
      entityId: syncEvents.entityId,
      eventType: syncEvents.eventType,
      status: syncEvents.status,
      payload: syncEvents.payload,
    })
    .from(syncEvents)
    .where(
      inArray(syncEvents.eventType, [
        "contact.email_updated",
        "contact.email_relinked",
      ]),
    )
    .orderBy(desc(syncEvents.createdAt))
    .limit(500);

  const candidateUserIds = findPendingDuplicateEmailUsers(recentEvents);

  if (candidateUserIds.length === 0) {
    return NextResponse.json({ candidates: 0, repaired: 0, failed: 0 });
  }

  const candidates = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, candidateUserIds));

  if (parsed.data.dryRun) {
    return NextResponse.json({
      candidates: candidates.length,
      repaired: 0,
      failed: 0,
      dryRun: true,
    });
  }

  let repaired = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const result = await updateGhlContactEmail(candidate.id, candidate.email);
      if (result.failed > 0) failed += 1;
      else repaired += 1;
    } catch (error) {
      failed += 1;
      console.error(
        "[GHL] Contact email reconciliation failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return NextResponse.json({
    candidates: candidates.length,
    repaired,
    failed,
    dryRun: false,
  });
}
