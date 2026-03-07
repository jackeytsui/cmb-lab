import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { autoTagRules, tags } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const createRuleSchema = z.object({
  tagId: z.string().uuid("tagId must be a valid UUID"),
  conditionType: z.string().min(1, "conditionType is required"),
  conditionValue: z.string().min(1, "conditionValue is required"),
});

const toggleRuleSchema = z.object({
  ruleId: z.string().uuid("ruleId must be a valid UUID"),
  isActive: z.boolean(),
});

const deleteRuleSchema = z.object({
  ruleId: z.string().uuid("ruleId must be a valid UUID"),
});

/**
 * GET /api/admin/auto-tag-rules
 * List all auto-tag rules with associated tag info.
 * Requires coach role.
 */
export async function GET() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const rules = await db
      .select({
        id: autoTagRules.id,
        tagId: autoTagRules.tagId,
        tagName: tags.name,
        tagColor: tags.color,
        conditionType: autoTagRules.conditionType,
        conditionValue: autoTagRules.conditionValue,
        isActive: autoTagRules.isActive,
        createdBy: autoTagRules.createdBy,
        createdAt: autoTagRules.createdAt,
      })
      .from(autoTagRules)
      .innerJoin(tags, eq(autoTagRules.tagId, tags.id));

    return NextResponse.json({ rules });
  } catch (error) {
    console.error("Error fetching auto-tag rules:", error);
    return NextResponse.json(
      { error: "Failed to fetch auto-tag rules" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/auto-tag-rules
 * Create a new auto-tag rule.
 * Requires coach role.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = createRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const currentUser = await getCurrentUser();

    const [rule] = await db
      .insert(autoTagRules)
      .values({
        tagId: parsed.data.tagId,
        conditionType: parsed.data.conditionType,
        conditionValue: parsed.data.conditionValue,
        createdBy: currentUser?.id,
      })
      .returning();

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error("Error creating auto-tag rule:", error);
    return NextResponse.json(
      { error: "Failed to create auto-tag rule" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/auto-tag-rules
 * Toggle an auto-tag rule's active state.
 * Body: { ruleId: string, isActive: boolean }
 * Requires coach role.
 */
export async function PATCH(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = toggleRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(autoTagRules)
      .set({ isActive: parsed.data.isActive })
      .where(eq(autoTagRules.id, parsed.data.ruleId))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Auto-tag rule not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ rule: updated });
  } catch (error) {
    console.error("Error toggling auto-tag rule:", error);
    return NextResponse.json(
      { error: "Failed to toggle auto-tag rule" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/auto-tag-rules
 * Delete an auto-tag rule.
 * Body: { ruleId: string }
 * Requires coach role.
 */
export async function DELETE(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = deleteRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const deleted = await db
      .delete(autoTagRules)
      .where(eq(autoTagRules.id, parsed.data.ruleId))
      .returning({ id: autoTagRules.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Auto-tag rule not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting auto-tag rule:", error);
    return NextResponse.json(
      { error: "Failed to delete auto-tag rule" },
      { status: 500 }
    );
  }
}
