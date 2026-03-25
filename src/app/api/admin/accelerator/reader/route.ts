import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { curatedPassages } from "@/db/schema/accelerator";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

const singlePassageSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  body: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

const bulkPassageSchema = z.object({
  passages: z.array(singlePassageSchema),
});

const passageInputSchema = z.union([singlePassageSchema, bulkPassageSchema]);

/**
 * GET /api/admin/accelerator/reader
 * Fetch all curated passages ordered by sortOrder.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const passages = await db
      .select()
      .from(curatedPassages)
      .orderBy(asc(curatedPassages.sortOrder));

    return NextResponse.json({ passages });
  } catch (error) {
    console.error("Failed to fetch curated passages:", error);
    return NextResponse.json(
      { error: "Failed to fetch passages" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/accelerator/reader
 * Create single or bulk curated passages.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = passageInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isBulk = "passages" in parsed.data;
    const passageList = isBulk
      ? (parsed.data as z.infer<typeof bulkPassageSchema>).passages
      : [parsed.data as z.infer<typeof singlePassageSchema>];

    const inserted = await db
      .insert(curatedPassages)
      .values(
        passageList.map((p) => ({
          title: p.title,
          description: p.description ?? null,
          body: p.body,
          sortOrder: p.sortOrder ?? 0,
          createdBy: user.id,
        }))
      )
      .returning();

    return NextResponse.json({ passages: inserted }, { status: 201 });
  } catch (error) {
    console.error("Failed to create curated passage(s):", error);
    return NextResponse.json(
      { error: "Failed to create passage(s)" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/accelerator/reader
 * Update a curated passage by ID.
 */
export async function PUT(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const schema = z.object({
      id: z.string().uuid(),
      title: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      body: z.string().min(1).optional(),
      sortOrder: z.number().int().optional(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, ...updates } = parsed.data;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(curatedPassages)
      .set(updates)
      .where(eq(curatedPassages.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Passage not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ passage: updated });
  } catch (error) {
    console.error("Failed to update curated passage:", error);
    return NextResponse.json(
      { error: "Failed to update passage" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/accelerator/reader
 * Delete a curated passage by ID.
 */
export async function DELETE(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const schema = z.object({ id: z.string().uuid() });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await db
      .delete(curatedPassages)
      .where(eq(curatedPassages.id, parsed.data.id));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete curated passage:", error);
    return NextResponse.json(
      { error: "Failed to delete passage" },
      { status: 500 }
    );
  }
}
