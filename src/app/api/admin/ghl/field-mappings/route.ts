import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { ghlFieldMappings } from "@/db/schema";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { logSyncEvent } from "@/lib/ghl/sync-logger";

/**
 * GET /api/admin/ghl/field-mappings
 * List all field mappings ordered by lmsConcept.
 * Requires admin role.
 */
export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const fieldMappings = await db
      .select()
      .from(ghlFieldMappings)
      .orderBy(asc(ghlFieldMappings.lmsConcept));

    return NextResponse.json({ fieldMappings });
  } catch (error) {
    console.error("Error fetching field mappings:", error);
    return NextResponse.json(
      { error: "Failed to fetch field mappings" },
      { status: 500 }
    );
  }
}

const createFieldMappingSchema = z.object({
  lmsConcept: z.string().min(1, "lmsConcept is required"),
  ghlFieldId: z.string().min(1, "ghlFieldId is required"),
  ghlFieldName: z.string().min(1, "ghlFieldName is required"),
});

/**
 * POST /api/admin/ghl/field-mappings
 * Create or update a field mapping (upsert on lmsConcept).
 * Requires admin role.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = createFieldMappingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { lmsConcept, ghlFieldId, ghlFieldName } = parsed.data;

    const [fieldMapping] = await db
      .insert(ghlFieldMappings)
      .values({ lmsConcept, ghlFieldId, ghlFieldName })
      .onConflictDoUpdate({
        target: ghlFieldMappings.lmsConcept,
        set: { ghlFieldId, ghlFieldName },
      })
      .returning();

    await logSyncEvent({
      eventType: "field_mapping.updated",
      direction: "outbound",
      entityType: "field_mapping",
      payload: { lmsConcept, ghlFieldId, ghlFieldName },
    });

    return NextResponse.json({ fieldMapping }, { status: 201 });
  } catch (error) {
    console.error("Error creating field mapping:", error);
    return NextResponse.json(
      { error: "Failed to create field mapping" },
      { status: 500 }
    );
  }
}
