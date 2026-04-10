import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { courseLibraryModules } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().optional(),
});

interface RouteParams {
  params: Promise<{ moduleId: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(courseLibraryModules)
    .set(parsed.data)
    .where(
      and(
        eq(courseLibraryModules.id, moduleId),
        isNull(courseLibraryModules.deletedAt),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  return NextResponse.json({ module: updated });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;

  const [deleted] = await db
    .update(courseLibraryModules)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(courseLibraryModules.id, moduleId),
        isNull(courseLibraryModules.deletedAt),
      ),
    )
    .returning({ id: courseLibraryModules.id });

  if (!deleted) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
