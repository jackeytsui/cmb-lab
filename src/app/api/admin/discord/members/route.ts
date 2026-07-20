// GET /api/admin/discord/members
// Lists linked students with their Discord identity, guild status, tags,
// and last sync outcome. Requires admin role.

import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { discordConnections, studentTags, tags, users } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const rows = await db
      .select({
        userId: discordConnections.userId,
        name: users.name,
        email: users.email,
        discordUserId: discordConnections.discordUserId,
        discordUsername: discordConnections.discordUsername,
        guildStatus: discordConnections.guildStatus,
        guildJoinedAt: discordConnections.guildJoinedAt,
        lastSyncedAt: discordConnections.lastSyncedAt,
        lastSyncError: discordConnections.lastSyncError,
      })
      .from(discordConnections)
      .innerJoin(users, eq(discordConnections.userId, users.id))
      .orderBy(desc(discordConnections.createdAt));

    // Attach each member's tags in one query.
    const userIds = rows.map((r) => r.userId);
    const tagRows =
      userIds.length > 0
        ? await db
            .select({
              userId: studentTags.userId,
              tagName: tags.name,
              tagColor: tags.color,
            })
            .from(studentTags)
            .innerJoin(tags, eq(studentTags.tagId, tags.id))
            .where(inArray(studentTags.userId, userIds))
        : [];

    const tagsByUser = new Map<string, { name: string; color: string }[]>();
    for (const t of tagRows) {
      const list = tagsByUser.get(t.userId) ?? [];
      list.push({ name: t.tagName, color: t.tagColor });
      tagsByUser.set(t.userId, list);
    }

    const members = rows.map((r) => ({
      ...r,
      tags: tagsByUser.get(r.userId) ?? [],
    }));

    return NextResponse.json({ members });
  } catch (error) {
    console.error("Error fetching Discord members:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}
