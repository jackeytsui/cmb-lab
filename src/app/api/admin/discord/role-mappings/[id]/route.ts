// /api/admin/discord/role-mappings/[id]
// PATCH: toggle isActive / grantsMembership. DELETE: remove the mapping.
// Both re-queue a sync for affected students. Requires admin role.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { discordConnections, discordRoleMappings, studentTags } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isDiscordConfigured, removeMemberRole } from "@/lib/discord/client";
import { logDiscordAction, queueDiscordSyncForTag } from "@/lib/discord/sync";

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  grantsMembership: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(discordRoleMappings)
      .set(parsed.data)
      .where(eq(discordRoleMappings.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    const queued = await queueDiscordSyncForTag(updated.tagId);
    return NextResponse.json({ mapping: updated, syncQueued: queued });
  } catch (error) {
    console.error("Error updating Discord role mapping:", error);
    return NextResponse.json(
      { error: "Failed to update mapping" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const [deleted] = await db
      .delete(discordRoleMappings)
      .where(eq(discordRoleMappings.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    // Once the row is gone the role is unmanaged, so the sync engine would
    // leave it on members forever. Strip it here from every linked student
    // who held the mapped tag.
    let stripped = 0;
    if (isDiscordConfigured()) {
      const affected = await db
        .select({ discordUserId: discordConnections.discordUserId })
        .from(studentTags)
        .innerJoin(
          discordConnections,
          eq(studentTags.userId, discordConnections.userId)
        )
        .where(eq(studentTags.tagId, deleted.tagId));

      for (const { discordUserId } of affected) {
        try {
          await removeMemberRole(discordUserId, deleted.discordRoleId);
          stripped++;
        } catch (error) {
          console.error(
            `[Discord] Failed to strip role ${deleted.discordRoleId} from ${discordUserId}:`,
            error instanceof Error ? error.message : error
          );
        }
      }
      await logDiscordAction({
        action: "mapping.delete",
        detail: {
          tagId: deleted.tagId,
          discordRoleId: deleted.discordRoleId,
          strippedFrom: stripped,
        },
      });
    }

    // Re-sync entitlement for anyone whose membership depended on this tag.
    const queued = await queueDiscordSyncForTag(deleted.tagId);
    return NextResponse.json({ success: true, stripped, syncQueued: queued });
  } catch (error) {
    console.error("Error deleting Discord role mapping:", error);
    return NextResponse.json(
      { error: "Failed to delete mapping" },
      { status: 500 }
    );
  }
}
