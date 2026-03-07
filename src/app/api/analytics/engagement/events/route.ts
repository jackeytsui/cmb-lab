import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/db";
import { users, featureEngagementEvents } from "@/db/schema";
import { eq } from "drizzle-orm";

const payloadSchema = z.object({
  feature: z.enum([
    "ai_passage_reader",
    "youtube_listening_lab",
    "coaching_one_on_one",
    "coaching_inner_circle",
  ]),
  eventType: z.enum(["page_view", "action", "session_end"]),
  action: z.string().trim().min(1).max(120).optional(),
  route: z.string().trim().max(240).optional(),
  sessionKey: z.string().trim().max(120).optional(),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const dbUser = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
      columns: { id: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 },
      );
    }

    const { feature, eventType, action, route, sessionKey, durationMs, metadata } =
      parsed.data;

    await db.insert(featureEngagementEvents).values({
      userId: dbUser.id,
      feature,
      eventType,
      action: action ?? null,
      route: route ?? null,
      sessionKey: sessionKey ?? null,
      durationMs: durationMs ?? null,
      metadata: metadata ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to record engagement event:", error);
    return NextResponse.json(
      { error: "Failed to record event" },
      { status: 500 },
    );
  }
}
