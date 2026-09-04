import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { validateBearerApiKey } from "@/lib/validate-api-key";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { composeStudentName } from "@/lib/student-name";
import { setPortalAccess } from "@/lib/portal-access";
import {
  DEFAULT_PLATFORM_ROLE,
  normalizePlatformRole,
} from "@/lib/platform-roles";

const bodySchema = z.object({
  email: z.string().email(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
}).strict();

export async function POST(req: NextRequest) {
  const apiKey = await validateBearerApiKey(req);
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { email, firstName, lastName } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const name = composeStudentName(firstName, lastName);

  const clerk = await clerkClient();

  // Check if this email already has a Clerk account
  const lookup = await clerk.users.getUserList({ emailAddress: [normalizedEmail], limit: 1 });
  const clerkUser = lookup.data[0] ?? null;

  const enrollmentMetadata = {
    cmbPortalAccessStatus: "active",
    cmbPortalAccessRevoked: false,
    cmbInviteFirstName: firstName ?? null,
    cmbInviteLastName: lastName ?? null,
    cmbInviteRole: "student",
    invitedBy: "fanbasis_checkout",
  };

  if (clerkUser) {
    const existingByClerk = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkUser.id),
      columns: { id: true, role: true },
    });
    const existingByEmail = existingByClerk
      ? null
      : await db.query.users.findFirst({
          where: eq(users.email, normalizedEmail),
          columns: { id: true, role: true },
        });
    const existingRole = existingByClerk?.role ?? existingByEmail?.role;
    const role = normalizePlatformRole(existingRole) ?? DEFAULT_PLATFORM_ROLE;

    // Existing Clerk user — grant/restore access
    await clerk.users.updateUserMetadata(clerkUser.id, {
      publicMetadata: {
        ...(clerkUser.publicMetadata ?? {}),
        ...enrollmentMetadata,
        role,
      },
    });
    // An explicit checkout can restore a valid term, but must not bypass an
    // expired end date or an independent security ban.
    const access = await setPortalAccess(clerk, clerkUser.id, {
      status: "active", reason: "fanbasis_checkout",
    });

    // Upsert DB record
    if (existingByClerk) {
      await db
        .update(users)
        .set({
          email: normalizedEmail,
          ...(name ? { name } : {}),
          role,
          deletedAt: null,
        })
        .where(eq(users.id, existingByClerk.id));
    } else {
      if (existingByEmail) {
        await db
          .update(users)
          .set({
            clerkId: clerkUser.id,
            ...(name ? { name } : {}),
            role,
            deletedAt: null,
          })
          .where(eq(users.id, existingByEmail.id));
      } else {
        await db
          .insert(users)
          .values({
            clerkId: clerkUser.id,
            email: normalizedEmail,
            name,
            role: DEFAULT_PLATFORM_ROLE,
          })
          .onConflictDoNothing();
      }
    }

    return NextResponse.json({ success: true, action: access.status === "active" ? "access_granted" : "access_expired", status: access.status, email: normalizedEmail });
  }

  // No Clerk account yet — send a Clerk invitation (magic-link email)
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://cmb-lab.thecmblueprint.com";

  try {
    await clerk.invitations.createInvitation({
      emailAddress: normalizedEmail,
      redirectUrl: `${appUrl}/sign-in`,
      publicMetadata: { ...enrollmentMetadata, role: DEFAULT_PLATFORM_ROLE },
      notify: true,
    });
  } catch (err: unknown) {
    // Clerk returns 422 if a pending invitation already exists for this email.
    // Treat that as success — the invite is already on its way.
    const status = (err as { status?: number })?.status;
    const clerkCode = (err as { errors?: { code?: string }[] })?.errors?.[0]?.code;
    if (status === 422 || clerkCode === "duplicate_record") {
      return NextResponse.json({ success: true, action: "invitation_already_pending", email: normalizedEmail });
    }
    console.error("[enroll] clerk.invitations.createInvitation failed:", err);
    return NextResponse.json({ error: "Failed to send invitation" }, { status: 500 });
  }

  return NextResponse.json({ success: true, action: "invitation_sent", email: normalizedEmail });
}
