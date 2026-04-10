import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { createGhlClient, getGhlClientForLocation } from "@/lib/ghl/client";
import { db } from "@/db";
import { ghlLocations } from "@/db/schema";
import { eq } from "drizzle-orm";

interface GhlLocationResponse {
  location: {
    id: string;
    name: string;
  };
}

/**
 * POST /api/admin/ghl/test-connection
 * Test GHL API connection.
 * Supports ?locationId=xxx to test a specific location from the DB.
 * Without locationId, tests the first active location or falls back to env vars.
 * Requires admin role.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const locationId = request.nextUrl.searchParams.get("locationId");

  try {
    let client;
    let testLocationId: string;

    if (locationId) {
      // Test a specific location from the DB
      const rows = await db
        .select({
          apiToken: ghlLocations.apiToken,
          ghlLocationId: ghlLocations.ghlLocationId,
        })
        .from(ghlLocations)
        .where(eq(ghlLocations.id, locationId))
        .limit(1);

      if (rows.length === 0) {
        return NextResponse.json(
          { connected: false, error: "Location not found" },
          { status: 404 }
        );
      }

      client = createGhlClient(rows[0].apiToken);
      testLocationId = rows[0].ghlLocationId;
    } else {
      // Fall back: try first active DB location, then env vars
      const rows = await db
        .select({
          apiToken: ghlLocations.apiToken,
          ghlLocationId: ghlLocations.ghlLocationId,
        })
        .from(ghlLocations)
        .where(eq(ghlLocations.isActive, true))
        .limit(1);

      if (rows.length > 0) {
        client = createGhlClient(rows[0].apiToken);
        testLocationId = rows[0].ghlLocationId;
      } else if (process.env.GHL_API_TOKEN && process.env.GHL_LOCATION_ID) {
        client = createGhlClient(process.env.GHL_API_TOKEN);
        testLocationId = process.env.GHL_LOCATION_ID;
      } else {
        return NextResponse.json({
          connected: false,
          error: "No GHL locations configured. Add one in the Locations section above.",
        });
      }
    }

    const response = await client.get<GhlLocationResponse>(
      `/locations/${testLocationId}`
    );

    return NextResponse.json({
      connected: true,
      locationName: response.data.location.name,
      locationId: testLocationId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    if (message.includes("401") || message.includes("Unauthorized")) {
      return NextResponse.json({
        connected: false,
        error: "Invalid API token",
      });
    }

    return NextResponse.json({
      connected: false,
      error: message,
    });
  }
}
