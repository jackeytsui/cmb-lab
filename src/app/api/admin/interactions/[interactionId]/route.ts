import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { interactions } from "@/db/schema";
import { eq, isNull, and, ne } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ interactionId: string }>;
}

/**
 * GET /api/admin/interactions/[interactionId]
 * Get a single interaction by ID.
 * Requires admin role.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { interactionId } = await params;

    const [interaction] = await db
      .select()
      .from(interactions)
      .where(and(eq(interactions.id, interactionId), isNull(interactions.deletedAt)));

    if (!interaction) {
      return NextResponse.json({ message: "Interaction not found" }, { status: 404 });
    }

    return NextResponse.json({ interaction });
  } catch (error) {
    console.error("Error fetching interaction:", error);
    return NextResponse.json(
      { message: "Failed to fetch interaction" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/interactions/[interactionId]
 * Update interaction fields (partial update).
 * Requires admin role.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { interactionId } = await params;
    const body = await request.json();
    const {
      timestamp,
      type,
      language,
      prompt,
      expectedAnswer,
      correctThreshold,
      sortOrder,
    } = body;

    // Check interaction exists
    const [existing] = await db
      .select()
      .from(interactions)
      .where(and(eq(interactions.id, interactionId), isNull(interactions.deletedAt)));

    if (!existing) {
      return NextResponse.json({ message: "Interaction not found" }, { status: 404 });
    }

    // Build update object
    const updates: Partial<typeof interactions.$inferInsert> = {};

    // Validate and set timestamp if provided
    if (timestamp !== undefined) {
      if (typeof timestamp !== "number" || timestamp < 0 || !Number.isInteger(timestamp)) {
        return NextResponse.json(
          { message: "Timestamp must be a positive integer" },
          { status: 400 }
        );
      }

      updates.timestamp = timestamp;
    }

    // Validate type if provided
    if (type !== undefined) {
      const validTypes = ["text", "audio"];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { message: "Type must be 'text' or 'audio'" },
          { status: 400 }
        );
      }
      updates.type = type;
    }

    // Validate language if provided
    if (language !== undefined) {
      const validLanguages = ["cantonese", "mandarin", "both"];
      if (!validLanguages.includes(language)) {
        return NextResponse.json(
          { message: "Language must be 'cantonese', 'mandarin', or 'both'" },
          { status: 400 }
        );
      }
      updates.language = language;
    }

    // Validate prompt if provided
    if (prompt !== undefined) {
      if (typeof prompt !== "string" || prompt.trim().length < 5) {
        return NextResponse.json(
          { message: "Prompt must be at least 5 characters" },
          { status: 400 }
        );
      }
      updates.prompt = prompt.trim();
    }

    // Set expectedAnswer if provided (can be null)
    if (expectedAnswer !== undefined) {
      updates.expectedAnswer = expectedAnswer?.trim() || null;
    }

    // Validate correctThreshold if provided
    if (correctThreshold !== undefined) {
      if (typeof correctThreshold !== "number" || correctThreshold < 0 || correctThreshold > 100) {
        return NextResponse.json(
          { message: "Correct threshold must be between 0 and 100" },
          { status: 400 }
        );
      }
      updates.correctThreshold = correctThreshold;
    }

    // Set sortOrder if provided
    if (sortOrder !== undefined) {
      updates.sortOrder = sortOrder;
    }

    // Perform update if there are changes
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ interaction: existing });
    }

    const [updated] = await db
      .update(interactions)
      .set(updates)
      .where(eq(interactions.id, interactionId))
      .returning();

    return NextResponse.json({ interaction: updated });
  } catch (error) {
    console.error("Error updating interaction:", error);
    return NextResponse.json(
      { message: "Failed to update interaction" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/interactions/[interactionId]
 * Soft delete by setting deletedAt.
 * Requires admin role.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { interactionId } = await params;

    // Check interaction exists
    const [existing] = await db
      .select({ id: interactions.id })
      .from(interactions)
      .where(and(eq(interactions.id, interactionId), isNull(interactions.deletedAt)));

    if (!existing) {
      return NextResponse.json({ message: "Interaction not found" }, { status: 404 });
    }

    // Soft delete
    await db
      .update(interactions)
      .set({ deletedAt: new Date() })
      .where(eq(interactions.id, interactionId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting interaction:", error);
    return NextResponse.json(
      { message: "Failed to delete interaction" },
      { status: 500 }
    );
  }
}
