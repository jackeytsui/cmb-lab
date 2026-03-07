import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { ghlClient, getGhlLocationId } from "@/lib/ghl/client";

interface GhlLocationResponse {
  location: {
    id: string;
    name: string;
  };
}

/**
 * POST /api/admin/ghl/test-connection
 * Test GHL API connection by fetching the configured location.
 * Requires admin role.
 */
export async function POST() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const locationId = getGhlLocationId();
    const response = await ghlClient.get<GhlLocationResponse>(
      `/locations/${locationId}`
    );

    return NextResponse.json({
      connected: true,
      locationName: response.data.location.name,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    // Check for specific auth errors
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
