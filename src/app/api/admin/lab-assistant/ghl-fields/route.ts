// src/app/api/admin/lab-assistant/ghl-fields/route.ts
// Lists the GHL location's custom fields and suggests which field matches
// each Lab Assistant allowlist concept, so the admin block can wire the
// five field mappings in one click instead of hunting for field IDs.

import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { ghlFieldMappings, ghlLocations } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { createGhlClient } from "@/lib/ghl/client";
import {
  ALLOWLISTED_FIELD_CONCEPTS,
  type AllowlistedFieldConcept,
} from "@/lib/lab-assistant/allowlist";

interface GhlCustomField {
  id: string;
  name: string;
}

interface GhlCustomFieldsResponse {
  customFields: Array<{ id: string; name?: string; fieldKey?: string }>;
}

// Name heuristics per concept, tried in order (first match wins).
const CONCEPT_PATTERNS: Record<AllowlistedFieldConcept, RegExp[]> = {
  start_date: [/start\s*date/i, /date.*start/i],
  end_date: [/end\s*date/i, /date.*end/i],
  assigned_coach: [/coach/i],
  referral_source: [/referral.*source/i, /referred\s*by/i, /referral(?!.*status)/i],
  referral_status: [/referral.*status/i],
};

function suggestField(
  concept: AllowlistedFieldConcept,
  fields: GhlCustomField[]
): GhlCustomField | null {
  for (const pattern of CONCEPT_PATTERNS[concept]) {
    const match = fields.find((f) => pattern.test(f.name));
    if (match) return match;
  }
  return null;
}

export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [location] = await db
      .select({
        ghlLocationId: ghlLocations.ghlLocationId,
        apiToken: ghlLocations.apiToken,
        name: ghlLocations.name,
      })
      .from(ghlLocations)
      .where(eq(ghlLocations.isActive, true))
      .limit(1);

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
