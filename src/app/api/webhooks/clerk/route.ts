import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, roles, tags } from "@/db/schema";
import { eq, and, ilike, isNull } from "drizzle-orm";
import { updateGhlContactEmail } from "@/lib/ghl/contacts";
import { resolveRoleFromEmail } from "@/lib/access-control";
import { ensureDefaultStudentRoleAssignment } from "@/lib/student-role";
import { assignRole } from "@/lib/user-roles";
import { assignTag } from "@/lib/tags";

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses: Array<{
      id: string;
      email_address: string;
    }>;
    primary_email_address_id: string;
    first_name: string | null;
    last_name: string | null;
  };
}

function normalizeRoleValue(value: unknown): "student" | "coach" | "admin" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "student" || normalized === "coach" || normalized === "admin") {
    return normalized;
  }
  return null;
}

function parseInviteTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 50);
}

function colorFromTagName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const r = (Math.abs(hash) >> 16) & 0xff;
  const g = (Math.abs(hash) >> 8) & 0xff;
  const b = Math.abs(hash) & 0xff;
  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

async function ensureTagIdByName(tagName: string, creatorId: string | null) {
  const existing = await db.query.tags.findFirst({
    where: ilike(tags.name, tagName),
    columns: { id: true },
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(tags)
    .values({
      name: tagName,
      color: colorFromTagName(tagName),
      type: "coach",
      createdBy: creatorId ?? undefined,
    })
    .returning({ id: tags.id });
  return created.id;
}

async function applyInvitationMetadataToUser(
  userId: string,
  invitationMetadata: Record<string, unknown> | null | undefined
) {
  if (!invitationMetadata) return;

  const inviteRoleRaw = invitationMetadata.cmbInviteRole;
  const inviteTagsRaw = invitationMetadata.cmbInviteTags;

  const normalizedRole = normalizeRoleValue(inviteRoleRaw);
  if (normalizedRole) {
    await db.update(users).set({ role: normalizedRole }).where(eq(users.id, userId));
    if (normalizedRole === "student") {
      await ensureDefaultStudentRoleAssignment(userId);
    }
  } else if (typeof inviteRoleRaw === "string" && inviteRoleRaw.trim()) {
    const namedRole = await db.query.roles.findFirst({
      where: and(
        ilike(roles.name, inviteRoleRaw.trim()),
        isNull(roles.deletedAt)
      ),
      columns: { id: true },
    });
    if (namedRole) {
      await assignRole(userId, namedRole.id, null);
    }
  }

  const inviteTags = parseInviteTags(inviteTagsRaw);
  for (const tagName of inviteTags) {
    const tagId = await ensureTagIdByName(tagName, null);
    await assignTag(userId, tagId, undefined, { source: "webhook" });
  }
}

export async function POST(req: NextRequest) {
  try {
    const signingSecret =
      process.env.CLERK_WEBHOOK_SIGNING_SECRET?.trim() ||
      process.env.CLERK_WEBHOOK_SECRET?.trim() ||
      undefined;
    const evt = (await verifyWebhook(req, { signingSecret })) as ClerkWebhookEvent;
    const clerk = await clerkClient();

    let invitationMetadata: Record<string, unknown> | undefined;
    try {
      const fullUser = await clerk.users.getUser(evt.data.id);
      invitationMetadata = (fullUser.publicMetadata ?? {}) as Record<string, unknown>;
    } catch (metadataErr) {
      console.error("Failed to load Clerk user metadata:", metadataErr);
    }

    if (evt.type === "user.created") {
      const { id, email_addresses, first_name, last_name } = evt.data;
      const primaryEmail = email_addresses.find(
        (e) => e.id === evt.data.primary_email_address_id
      )?.email_address;

      if (primaryEmail) {
        const normalizedEmail = primaryEmail.trim().toLowerCase();
        const role = resolveRoleFromEmail(primaryEmail);
        const existingByEmail = await db.query.users.findFirst({
          where: ilike(users.email, normalizedEmail),
          columns: { id: true },
        });
        const [created] = existingByEmail
          ? await db
              .update(users)
              .set({
                clerkId: id,
                email: normalizedEmail,
                name: [first_name, last_name].filter(Boolean).join(" ") || null,
                role,
                deletedAt: null,
              })
              .where(eq(users.id, existingByEmail.id))
              .returning({ id: users.id })
          : await db
              .insert(users)
              .values({
                clerkId: id,
                email: normalizedEmail,
                name: [first_name, last_name].filter(Boolean).join(" ") || null,
                role,
              })
              .returning({ id: users.id });

        if (role === "student") {
          await ensureDefaultStudentRoleAssignment(created.id);
        }

        await applyInvitationMetadataToUser(created.id, invitationMetadata);
      }
    }

    if (evt.type === "user.updated") {
      const { id, email_addresses, first_name, last_name } = evt.data;
      const primaryEmail = email_addresses.find(
        (e) => e.id === evt.data.primary_email_address_id
      )?.email_address;

      if (primaryEmail) {
        const normalizedEmail = primaryEmail.trim().toLowerCase();
        const role = resolveRoleFromEmail(primaryEmail);
        let [updated] = await db
          .update(users)
          .set({
            email: normalizedEmail,
            name: [first_name, last_name].filter(Boolean).join(" ") || null,
            role,
          })
          .where(eq(users.clerkId, id))
          .returning({ id: users.id });

        if (!updated) {
          const existingByEmail = await db.query.users.findFirst({
            where: ilike(users.email, normalizedEmail),
            columns: { id: true },
          });
          if (existingByEmail) {
            [updated] = await db
              .update(users)
              .set({
                clerkId: id,
                email: normalizedEmail,
                name: [first_name, last_name].filter(Boolean).join(" ") || null,
                role,
                deletedAt: null,
              })
              .where(eq(users.id, existingByEmail.id))
              .returning({ id: users.id });
          }
        }

        if (role === "student" && updated) {
          await ensureDefaultStudentRoleAssignment(updated.id);
        }

        if (updated) {
          await applyInvitationMetadataToUser(updated.id, invitationMetadata);
        }

        // Sync email change to GHL if user is linked
        const user = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkId, id))
          .limit(1);
        if (user.length > 0) {
          await updateGhlContactEmail(user[0].id, normalizedEmail);
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Clerk webhook error:", err);
    return new Response("Webhook error", { status: 400 });
  }
}
