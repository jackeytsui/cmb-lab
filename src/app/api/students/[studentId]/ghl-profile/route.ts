// src/app/api/students/[studentId]/ghl-profile/route.ts
// Returns GHL contact data for a student, including resolved custom fields,
// freshness timestamp, and deep link to GHL contact page.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { getGhlContactId, getLocationForContact } from "@/lib/ghl/contacts";
import {
  fetchGhlContactData,
  refreshGhlContactData,
  resolveCustomFields,
} from "@/lib/ghl/contact-fields";

/**
 * GET /api/students/[studentId]/ghl-profile
 * Fetch GHL contact data for a student.
 * Supports ?refresh=true to force cache refresh.
 * Requires coach role.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { studentId } = await params;
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";

    // Get the GHL contact ID for deep link generation
    const ghlContactId = await getGhlContactId(studentId);

    // Fetch contact data (with or without forced refresh)
    const result = refresh
      ? await refreshGhlContactData(studentId)
      : await fetchGhlContactData(studentId);

    if (!result.data) {
      return NextResponse.json({
        data: null,
        lastFetchedAt: null,
        fields: [],
        ghlContactId: null,
        ghlDeepLink: null,
      });
    }

    // Resolve custom fields using active field mappings
    const fields = await resolveCustomFields(result.data.customFields);

    // Build GHL deep link using the contact's linked location
    const locationId = ghlContactId
      ? await getLocationForContact(ghlContactId)
      : null;
    const ghlDeepLink =
      ghlContactId && locationId
        ? `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${ghlContactId}`
        : null;

    return NextResponse.json({
      data: result.data,
      lastFetchedAt: result.lastFetchedAt,
      fields,
      ghlContactId,
      ghlDeepLink,
    });
  } catch (error) {
    console.error("Error fetching GHL profile:", error);
    return NextResponse.json(
      { error: "Failed to fetch GHL profile" },
      { status: 500 }
    );
  }
}
