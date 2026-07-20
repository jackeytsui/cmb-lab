// src/app/api/admin/lab-assistant/ghl-fields/route.ts
// Lists the GHL location's custom fields and suggests which field matches
// each Lab Assistant allowlist concept, so the admin block can wire the
// five field mappings in one click instead of hunting for field IDs.

import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { ghlFieldMappings } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { createGhlClient, getAnyActiveGhlLocation } from "@/lib/ghl/client";
import { ALLOWLISTED_FIELD_CONCEPTS } from "@/lib/lab-assistant/allowlist";
import {
  suggestField,
  type CatalogField as GhlCustomField,
} from "@/lib/lab-assistant/field-resolution";

interface GhlCustomFieldsResponse {
  customFields: Array<{ id: string; name?: string; fieldKey?: string }>;
}

export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const location = await getAnyActiveGhlLocation();

    if (!location) {
      return NextResponse.json(
        { error: "No active GHL location configured" },
        { status: 400 }
      );
    }

    const client = createGhlClient(location.apiToken);
    const response = await client.get<GhlCustomFieldsResponse>(
      `/locations/${location.ghlLocationId}/customFields`
    );

    const fields: GhlCustomField[] = (response.data.customFields ?? [])
      .filter((f) => f.id)
      .map((f) => ({ id: f.id, name: f.name || f.fieldKey || f.id }));

    const existing = await db
      .select({
        lmsConcept: ghlFieldMappings.lmsConcept,
        ghlFieldId: ghlFieldMappings.ghlFieldId,
      })
      .from(ghlFieldMappings)
      .where(
        inArray(ghlFieldMappings.lmsConcept, [...ALLOWLISTED_FIELD_CONCEPTS])
      );
    const existingByConcept = new Map(
      existing.map((m) => [m.lmsConcept, m.ghlFieldId])
    );

    return NextResponse.json({
      location: location.name,
      fields,
      concepts: ALLOWLISTED_FIELD_CONCEPTS.map((concept) => ({
        concept,
        currentFieldId: existingByConcept.get(concept) ?? null,
        suggestedFieldId:
          existingByConcept.get(concept) ??
          suggestField(concept, fields)?.id ??
          null,
      })),
    });
  } catch (error) {
    console.error("[Lab Assistant] GHL fields fetch failed:", error);
    return NextResponse.json(
      { error: "Failed to load GHL custom fields" },
      { status: 500 }
    );
  }
}
