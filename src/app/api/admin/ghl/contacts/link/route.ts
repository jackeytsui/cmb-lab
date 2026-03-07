import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findOrLinkContact } from "@/lib/ghl/contacts";
import { z } from "zod";

const linkContactSchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
});

/**
 * POST /api/admin/ghl/contacts/link
 * Link an LMS user to their GHL contact by searching GHL by email.
 * Requires admin role.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = linkContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { userId } = parsed.data;

    // Look up user to get their email
    const userRows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userRows.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const { email } = userRows[0];

    const result = await findOrLinkContact(userId, email);

    return NextResponse.json({
      ghlContactId: result.ghlContactId,
      isNewLink: result.isNewLink,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    // findOrLinkContact throws when no GHL contact found
    if (message.includes("No GHL contact found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    console.error("Error linking contact:", error);
    return NextResponse.json(
      { error: "Failed to link contact" },
      { status: 500 }
    );
  }
}
