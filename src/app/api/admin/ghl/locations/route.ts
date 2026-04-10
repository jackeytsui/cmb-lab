import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { ghlLocations } from "@/db/schema";
import { z } from "zod";

const createLocationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  ghlLocationId: z.string().min(1, "GHL Location ID is required"),
  apiToken: z.string().min(1, "API Token is required"),
  webhookSecret: z.string().optional(),
});

/**
 * GET /api/admin/ghl/locations
 * List all GHL locations.
 */
export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const locations = await db
    .select({
      id: ghlLocations.id,
      name: ghlLocations.name,
      ghlLocationId: ghlLocations.ghlLocationId,
      webhookSecret: ghlLocations.webhookSecret,
      isActive: ghlLocations.isActive,
      createdAt: ghlLocations.createdAt,
      updatedAt: ghlLocations.updatedAt,
    })
    .from(ghlLocations);

  // Don't expose full API tokens — just indicate if one is set
  return NextResponse.json({
    locations: locations.map((l) => ({
      ...l,
      hasApiToken: true,
      hasWebhookSecret: !!l.webhookSecret,
    })),
  });
}

/**
 * POST /api/admin/ghl/locations
 * Add a new GHL location (sub-account).
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = createLocationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const [location] = await db
      .insert(ghlLocations)
      .values({
        name: parsed.data.name,
        ghlLocationId: parsed.data.ghlLocationId,
        apiToken: parsed.data.apiToken,
        webhookSecret: parsed.data.webhookSecret || null,
      })
      .returning({
        id: ghlLocations.id,
        name: ghlLocations.name,
        ghlLocationId: ghlLocations.ghlLocationId,
        isActive: ghlLocations.isActive,
        createdAt: ghlLocations.createdAt,
      });

    return NextResponse.json({ location }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "A location with this GHL Location ID already exists" },
        { status: 409 }
      );
    }

    console.error("Error creating GHL location:", error);
    return NextResponse.json(
      { error: "Failed to create location" },
      { status: 500 }
    );
  }
}
