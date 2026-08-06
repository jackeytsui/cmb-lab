import { NextResponse } from "next/server";
import { z } from "zod";
import { hasMinimumRole } from "@/lib/auth";
import { prepareVocalHackPlacements } from "@/lib/videoask/vocal-hack-workflow";

export const maxDuration = 60;

const prepareSchema = z.object({
  formImportIds: z.array(z.string().uuid()).max(200).optional(),
});

export async function POST(request: Request) {
  if (!(await hasMinimumRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const parsed = prepareSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid VideoAsk placement selection" },
        { status: 400 },
      );
    }
    return NextResponse.json({
      result: await prepareVocalHackPlacements(parsed.data),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not prepare Vocal Hacks";
    console.error("[videoask/vocal-hack/prepare]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
