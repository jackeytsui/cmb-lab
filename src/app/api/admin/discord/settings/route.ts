// /api/admin/discord/settings
// GET/PATCH the Discord automation settings (removal policy).
// Requires admin role.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasMinimumRole } from "@/lib/auth";
import { getRemovalPolicy, setRemovalPolicy } from "@/lib/discord/sync";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  removalPolicy: z.enum(["kick", "strip_roles"]),
});

export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ removalPolicy: await getRemovalPolicy() });
}

export async function PATCH(req: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await setRemovalPolicy(parsed.data.removalPolicy);
  return NextResponse.json({ removalPolicy: parsed.data.removalPolicy });
}
