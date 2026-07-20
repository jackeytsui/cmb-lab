// /api/admin/discord/role-mappings
// GET: list tag -> Discord role mappings.
// POST: create a mapping. Can attach an existing Discord role, auto-create a
// new one, and optionally provision a private role-gated channel.
// Requires admin role.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasMinimumRole, getRealUser } from "@/lib/auth";
import { db } from "@/db";
import { discordRoleMappings, tags } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  createGuildRole,
  createPrivateChannelForRole,
  isDiscordConfigured,
} from "@/lib/discord/client";
import { logDiscordAction, queueDiscordSyncForTag } from "@/lib/discord/sync";

export const dynamic = "force-dynamic";

const createMappingSchema = z
  .object({
    tagId: z.string().uuid(),
    discordRoleId: z.string().min(1).optional(),
    createRoleName: z.string().min(1).max(100).optional(),
    createPrivateChannel: z.boolean().default(false),
    privateChannelName: z.string().min(1).max(100).optional(),
    grantsMembership: z.boolean().default(true),
  })
  .refine((d) => d.discordRoleId || d.createRoleName, {
    message: "Provide discordRoleId or createRoleName",
  });

export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const mappings = await db
      .select({
        id: discordRoleMappings.id,
        tagId: discordRoleMappings.tagId,
        tagName: tags.name,
        tagColor: tags.color,
        discordRoleId: discordRoleMappings.discordRoleId,
        discordRoleName: discordRoleMappings.discordRoleName,
        grantsMembership: discordRoleMappings.grantsMembership,
        privateChannelId: discordRoleMappings.privateChannelId,
        isActive: discordRoleMappings.isActive,
        createdAt: discordRoleMappings.createdAt,
      })
      .from(discordRoleMappings)
      .innerJoin(tags, eq(discordRoleMappings.tagId, tags.id))
      .orderBy(desc(discordRoleMappings.createdAt));

    return NextResponse.json({ mappings });
  } catch (error) {
    console.error("Error fetching Discord role mappings:", error);
    return NextResponse.json(
      { error: "Failed to fetch role mappings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isDiscordConfigured()) {
    return NextResponse.json(
      { error: "Discord bot is not configured (DISCORD_BOT_TOKEN, DISCORD_GUILD_ID)" },
      { status: 503 }
    );
  }

  try {
    const parsed = createMappingSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const tagRows = await db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .where(eq(tags.id, data.tagId))
      .limit(1);
    if (tagRows.length === 0) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }
    const tag = tagRows[0];

    // Resolve or create the Discord role.
    let discordRoleId = data.discordRoleId;
    let discordRoleName: string | null = null;
    if (!discordRoleId) {
      const colorInt = parseInt(tag.color.replace("#", ""), 16);
      const role = await createGuildRole(
        data.createRoleName!,
        isNaN(colorInt) ? undefined : colorInt
      );
      discordRoleId = role.id;
      discordRoleName = role.name;
      await logDiscordAction({
        action: "role.create",
        detail: { roleId: role.id, name: role.name, tagId: tag.id },
      });
    }

    // Optionally provision a private channel gated to the role.
    let privateChannelId: string | null = null;
    if (data.createPrivateChannel) {
      const channelName = (data.privateChannelName ?? tag.name)
        .toLowerCase()
        .replace(/[^a-z0-9一-鿿-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 90);
      const channel = await createPrivateChannelForRole(
        channelName || "students",
        discordRoleId
      );
      privateChannelId = channel.id;
      await logDiscordAction({
        action: "channel.create",
        detail: { channelId: channel.id, name: channel.name, roleId: discordRoleId },
      });
    }

    const user = await getRealUser();
    const [mapping] = await db
      .insert(discordRoleMappings)
      .values({
        tagId: data.tagId,
        discordRoleId,
        discordRoleName,
        grantsMembership: data.grantsMembership,
        privateChannelId,
        createdBy: user?.id ?? null,
      })
      .onConflictDoUpdate({
        target: [discordRoleMappings.tagId, discordRoleMappings.discordRoleId],
        set: {
          grantsMembership: data.grantsMembership,
          privateChannelId,
          isActive: true,
        },
      })
      .returning();

    // Retro-apply to everyone already holding the tag.
    const queued = await queueDiscordSyncForTag(data.tagId);

    return NextResponse.json({ mapping, syncQueued: queued });
  } catch (error) {
    console.error("Error creating Discord role mapping:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create mapping" },
      { status: 500 }
    );
  }
}
