import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/db";
import { filterPresets } from "@/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";

const createPresetSchema = z.object({
  name: z.string().min(1).max(100),
  filters: z.object({
    search: z.string().optional(),
    tagIds: z.array(z.string()).optional(),
    courseId: z.string().optional(),
    progressStatus: z.string().optional(),
    atRisk: z.boolean().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
  isDefault: z.boolean().optional(),
});

/**
 * GET /api/admin/students/filter-presets
 * List all filter presets for the current user.
 * Requires coach+ role.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  try {
    const presets = await db
      .select()
      .from(filterPresets)
      .where(eq(filterPresets.createdBy, currentUser.id))
      .orderBy(desc(filterPresets.isDefault), asc(filterPresets.name));

    return NextResponse.json({ presets });
  } catch (error) {
    console.error("Error fetching filter presets:", error);
    return NextResponse.json(
      { error: "Failed to fetch filter presets" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/students/filter-presets
 * Create a new filter preset for the current user.
 * If isDefault is true, unsets any existing default first.
 * Requires coach+ role.
 */
export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createPresetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, filters, isDefault } = parsed.data;

  try {
    // If setting as default, unset any existing default for this user
    if (isDefault) {
      await db
        .update(filterPresets)
        .set({ isDefault: false })
        .where(
          and(
            eq(filterPresets.createdBy, currentUser.id),
            eq(filterPresets.isDefault, true),
          ),
        );
    }

    const [created] = await db
      .insert(filterPresets)
      .values({
        name,
        filters,
        createdBy: currentUser.id,
        isDefault: isDefault ?? false,
      })
      .returning();

    return NextResponse.json({ preset: created }, { status: 201 });
  } catch (error) {
    console.error("Error creating filter preset:", error);
    return NextResponse.json(
      { error: "Failed to create filter preset" },
      { status: 500 },
    );
  }
}
