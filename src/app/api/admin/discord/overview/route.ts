// GET /api/admin/discord/overview
// Connection status, guild info, link/membership counts, and recent audit log
// for the admin Discord dashboard. Requires admin role.

import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  discordAuditLog,
  discordConnections,
  discordRoleMappings,
  users,
} from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { getGuild, isDiscordConfigured } from "@/lib/discord/client";
import { isDiscordOAuthConfigured } from "@/lib/discord/oauth";
import { getRemovalPolicy } from "@/lib/discord/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const botConfigured = isDiscordConfigured();
    const oauthConfigured = isDiscordOAuthConfigured();

    let guild: { id: string; name: string; memberCount?: number } | null = null;
    let guildError: string | null = null;
    if (botConfigured) {
      try {
        const g = await getGuild();
        if (g) {
          guild = {
            id: g.id,
            name: g.name,
            memberCount: g.approximate_member_count,
          };
        }
      } catch (error) {
        guildError = error instanceof Error ? error.message : String(error);
      }
    }

    const [counts, mappingCount, policy, recentAudit] = await Promise.all([
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
          joined: sql<number>`COUNT(*) FILTER (WHERE ${discordConnections.guildStatus} = 'joined')::int`,
          errored: sql<number>`COUNT(*) FILTER (WHERE ${discordConnections.lastSyncError} IS NOT NULL)::int`,
        })
        .from(discordConnections),
      db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(discordRoleMappings)
        .where(eq(discordRoleMappings.isActive, true)),
      getRemovalPolicy(),
      db
        .select({
          id: discordAuditLog.id,
          action: discordAuditLog.action,
          status: discordAuditLog.status,
          detail: discordAuditLog.detail,
          errorMessage: discordAuditLog.errorMessage,
          createdAt: discordAuditLog.createdAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(discordAuditLog)
        .leftJoin(users, eq(discordAuditLog.userId, users.id))
        .orderBy(desc(discordAuditLog.createdAt))
        .limit(30),
    ]);

    return NextResponse.json({
      botConfigured,
      oauthConfigured,
      guild,
      guildError,
      linkedUsers: counts[0]?.total ?? 0,
      joinedUsers: counts[0]?.joined ?? 0,
      erroredUsers: counts[0]?.errored ?? 0,
      activeMappings: mappingCount[0]?.total ?? 0,
      removalPolicy: policy,
      recentAudit,
    });
  } catch (error) {
    console.error("Error fetching Discord overview:", error);
    return NextResponse.json(
      { error: "Failed to fetch Discord overview" },
      { status: 500 }
    );
  }
}
