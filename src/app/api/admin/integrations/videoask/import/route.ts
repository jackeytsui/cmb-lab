import { NextResponse } from "next/server";
import { z } from "zod";
import { getRealUser, hasMinimumRole } from "@/lib/auth";
import { importVideoAskForm } from "@/lib/videoask/importer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  formId: z.string().trim().min(1).max(200),
  force: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid import request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await importVideoAskForm({
      formId: parsed.data.formId,
      force: parsed.data.force,
      user,
    });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    console.error(`[videoask/import] ${parsed.data.formId} failed:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
