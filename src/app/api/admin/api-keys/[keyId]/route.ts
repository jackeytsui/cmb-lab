import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminApiKeys } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";

interface RouteContext {
  params: Promise<{ keyId: string }>;
}

const patchSchema = z.object({
  action: z.enum(["revoke"]),
});

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { keyId } = await params;

  if (parsed.data.action === "revoke") {
    const [updated] = await db
      .update(adminApiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(adminApiKeys.id, keyId), isNull(adminApiKeys.revokedAt)))
      .returning({ id: adminApiKeys.id });

    if (!updated) {
      return NextResponse.json({ error: "Key not found or already revoked" }, { status: 404 });
    }
  }

  return NextResponse.json({ ok: true });
}
