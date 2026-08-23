import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { getRealUser } from "@/lib/auth";
import { getWebPushPublicKey } from "@/lib/web-push";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(16).max(512),
    auth: z.string().min(8).max(256),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

export async function GET() {
  const user = await getRealUser();
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const publicKey = getWebPushPublicKey();
  return NextResponse.json({ configured: Boolean(publicKey), publicKey });
}

export async function POST(request: NextRequest) {
  const user = await getRealUser();
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = subscriptionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid push subscription" },
      { status: 400 },
    );
  }

  const { endpoint, keys } = parsed.data;
  await db
    .insert(pushSubscriptions)
    .values({
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: request.headers.get("user-agent"),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: request.headers.get("user-agent"),
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ subscribed: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getRealUser();
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = unsubscribeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
  }

  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, user.id),
        eq(pushSubscriptions.endpoint, parsed.data.endpoint),
      ),
    );

  return NextResponse.json({ subscribed: false });
}
