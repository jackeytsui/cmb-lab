// src/lib/discord/sync.ts
// The Discord sync engine: makes a student's Discord membership and roles a
// projection of their LMS tags (which already sync with GoHighLevel).
//
// Desired state per linked student:
// - Discord roles = active mappings for the tags they currently hold
// - Guild membership = they hold at least one grantsMembership-mapped tag
//   (coaches/admins are always entitled)
// When entitlement is lost the removal policy decides: kick from the server
// or just strip the managed roles.
//
// Entry points:
// - queueDiscordSyncForUser(userId): fire-and-forget, called after tag changes
// - syncUserDiscord(userId): full sync for one user, returns a summary
// - syncAllLinkedUsers(): reconciliation pass used by the daily cron

import { db } from "@/db";
import {
  appSettings,
  discordAuditLog,
  discordConnections,
  discordRoleMappings,
  studentTags,
  users,
  type DiscordConnection,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  addGuildMember,
  addMemberRole,
  getGuildMember,
  isDiscordConfigured,
  kickGuildMember,
  removeMemberRole,
} from "@/lib/discord/client";
import { refreshAccessToken } from "@/lib/discord/oauth";

export type RemovalPolicy = "kick" | "strip_roles";

export interface SyncResult {
  status:
    | "synced"
    | "joined"
    | "removed"
    | "stripped"
    | "not_linked"
    | "not_configured"
    | "error";
  rolesAdded: string[];
  rolesRemoved: string[];
  error?: string;
}

// --- Settings ---

const REMOVAL_POLICY_KEY = "discord.removal_policy";

export async function getRemovalPolicy(): Promise<RemovalPolicy> {
  const rows = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, REMOVAL_POLICY_KEY))
    .limit(1);
  return rows[0]?.value === "strip_roles" ? "strip_roles" : "kick";
}

export async function setRemovalPolicy(policy: RemovalPolicy): Promise<void> {
  await db
    .insert(appSettings)
    .values({
      key: REMOVAL_POLICY_KEY,
      value: policy,
      description:
        "What happens on Discord when a student loses all membership-granting tags",
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: policy },
    });
}

// --- Audit log ---

export async function logDiscordAction(entry: {
  userId?: string | null;
  discordUserId?: string | null;
  action: string;
  status?: "success" | "error" | "skipped";
  detail?: Record<string, unknown>;
  errorMessage?: string;
}): Promise<void> {
  try {
    await db.insert(discordAuditLog).values({
      userId: entry.userId ?? null,
      discordUserId: entry.discordUserId ?? null,
      action: entry.action,
      status: entry.status ?? "success",
      detail: entry.detail ?? {},
      errorMessage: entry.errorMessage,
    });
  } catch (error) {
    console.error("[Discord Sync] Failed to write audit log:", error);
  }
}

// --- Desired state ---

interface DesiredState {
  roleIds: string[];
  entitledToMembership: boolean;
}

/**
 * Compute the Discord roles a user should hold and whether they are entitled
 * to guild membership, from their current LMS tags and active role mappings.
 */
export async function computeDesiredState(userId: string): Promise<DesiredState> {
  const [userRows, tagRows, mappings] = await Promise.all([
    db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ tagId: studentTags.tagId })
      .from(studentTags)
      .where(eq(studentTags.userId, userId)),
    db
      .select({
        tagId: discordRoleMappings.tagId,
        discordRoleId: discordRoleMappings.discordRoleId,
        grantsMembership: discordRoleMappings.grantsMembership,
      })
      .from(discordRoleMappings)
      .where(eq(discordRoleMappings.isActive, true)),
  ]);

  const heldTagIds = new Set(tagRows.map((r) => r.tagId));
  const matched = mappings.filter((m) => heldTagIds.has(m.tagId));

  const roleIds = [...new Set(matched.map((m) => m.discordRoleId))];
  const isStaff = userRows[0]?.role === "coach" || userRows[0]?.role === "admin";
  const entitledToMembership =
    isStaff || matched.some((m) => m.grantsMembership);

  return { roleIds, entitledToMembership };
}

/** All Discord role IDs the automation manages (active + inactive mappings). */
async function getManagedRoleIds(): Promise<Set<string>> {
  const rows = await db
    .select({ discordRoleId: discordRoleMappings.discordRoleId })
    .from(discordRoleMappings);
  return new Set(rows.map((r) => r.discordRoleId));
}

// --- Token handling ---

/**
 * Get a usable OAuth access token for guilds.join, refreshing if expired.
 * Returns null when no token is available (user must re-link).
 */
async function getUsableAccessToken(
  connection: DiscordConnection
): Promise<string | null> {
  const notExpired =
    connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > Date.now() + 60_000;
  if (connection.accessToken && notExpired) {
    return connection.accessToken;
  }

  if (!connection.refreshToken) return null;

  const refreshed = await refreshAccessToken(connection.refreshToken);
  if (!refreshed) return null;

  await db
    .update(discordConnections)
    .set({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    })
    .where(eq(discordConnections.id, connection.id));

  return refreshed.access_token;
}

// --- Core sync ---

/**
 * Fully reconcile one user's Discord state with their LMS tags.
 */
export async function syncUserDiscord(userId: string): Promise<SyncResult> {
  const empty = { rolesAdded: [], rolesRemoved: [] };

  if (!isDiscordConfigured()) {
    return { status: "not_configured", ...empty };
  }

  const connections = await db
    .select()
    .from(discordConnections)
    .where(eq(discordConnections.userId, userId))
    .limit(1);

  if (connections.length === 0) {
    return { status: "not_linked", ...empty };
  }
  const connection = connections[0];

  try {
    const [desired, managedRoleIds, policy] = await Promise.all([
      computeDesiredState(userId),
      getManagedRoleIds(),
      getRemovalPolicy(),
    ]);

    const member = await getGuildMember(connection.discordUserId);
    const result: SyncResult = { status: "synced", rolesAdded: [], rolesRemoved: [] };

    if (!member) {
      // Not in the guild. If entitled, add them server-side via guilds.join.
      if (desired.entitledToMembership) {
        const accessToken = await getUsableAccessToken(connection);
        if (!accessToken) {
          await updateConnection(connection.id, {
            guildStatus: "left",
            lastSyncError:
              "Cannot auto-join: Discord authorization expired. Student must reconnect Discord from their dashboard.",
          });
          await logDiscordAction({
            userId,
            discordUserId: connection.discordUserId,
            action: "guild.join",
            status: "error",
            errorMessage: "No usable OAuth token for guilds.join",
          });
          return {
            status: "error",
            ...empty,
            error: "authorization_expired",
          };
        }

        await addGuildMember(
          connection.discordUserId,
          accessToken,
          desired.roleIds
        );
        await updateConnection(connection.id, {
          guildStatus: "joined",
          guildJoinedAt: new Date(),
          lastSyncedAt: new Date(),
          lastSyncError: null,
        });
        await logDiscordAction({
          userId,
          discordUserId: connection.discordUserId,
          action: "guild.join",
          detail: { roles: desired.roleIds },
        });
        return { status: "joined", rolesAdded: desired.roleIds, rolesRemoved: [] };
      }

      // Not entitled and not in guild -- nothing to do.
      await updateConnection(connection.id, {
        guildStatus:
          connection.guildStatus === "removed" ? "removed" : "left",
        lastSyncedAt: new Date(),
        lastSyncError: null,
      });
      return { status: "synced", ...empty };
    }

    // In the guild.
    if (!desired.entitledToMembership) {
      if (policy === "kick") {
        await kickGuildMember(
          connection.discordUserId,
          "CMB Lab automation: course access ended"
        );
        await updateConnection(connection.id, {
          guildStatus: "removed",
          lastSyncedAt: new Date(),
          lastSyncError: null,
        });
        await logDiscordAction({
          userId,
          discordUserId: connection.discordUserId,
          action: "member.kick",
          detail: { reason: "no_membership_tags" },
        });
        return { status: "removed", ...empty };
      }

      // strip_roles policy: keep them in the server, remove managed roles.
      const toStrip = member.roles.filter((r) => managedRoleIds.has(r));
      for (const roleId of toStrip) {
        await removeMemberRole(connection.discordUserId, roleId);
      }
      if (toStrip.length > 0) {
        await logDiscordAction({
          userId,
          discordUserId: connection.discordUserId,
          action: "roles.strip",
          detail: { roles: toStrip },
        });
      }
      await updateConnection(connection.id, {
        guildStatus: "joined",
        lastSyncedAt: new Date(),
        lastSyncError: null,
      });
      return { status: "stripped", rolesAdded: [], rolesRemoved: toStrip };
    }

    // Entitled member: diff managed roles.
    const currentManaged = member.roles.filter((r) => managedRoleIds.has(r));
    const desiredSet = new Set(desired.roleIds);
    const currentSet = new Set(currentManaged);

    const toAdd = desired.roleIds.filter((r) => !currentSet.has(r));
    const toRemove = currentManaged.filter((r) => !desiredSet.has(r));

    for (const roleId of toAdd) {
      await addMemberRole(connection.discordUserId, roleId);
      result.rolesAdded.push(roleId);
    }
    for (const roleId of toRemove) {
      await removeMemberRole(connection.discordUserId, roleId);
      result.rolesRemoved.push(roleId);
    }

    if (toAdd.length > 0 || toRemove.length > 0) {
      await logDiscordAction({
        userId,
        discordUserId: connection.discordUserId,
        action: "roles.sync",
        detail: { added: toAdd, removed: toRemove },
      });
    }

    await updateConnection(connection.id, {
      guildStatus: "joined",
      guildJoinedAt: connection.guildJoinedAt ?? new Date(),
      lastSyncedAt: new Date(),
      lastSyncError: null,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Discord Sync] Failed for user ${userId}:`, message);
    await updateConnection(connection.id, { lastSyncError: message });
    await logDiscordAction({
      userId,
      discordUserId: connection.discordUserId,
      action: "sync",
      status: "error",
      errorMessage: message,
    });
    return { status: "error", ...empty, error: message };
  }
}

async function updateConnection(
  connectionId: string,
  set: Partial<{
    guildStatus: string;
    guildJoinedAt: Date;
    lastSyncedAt: Date;
    lastSyncError: string | null;
  }>
): Promise<void> {
  await db
    .update(discordConnections)
    .set(set)
    .where(eq(discordConnections.id, connectionId));
}

/**
 * Fire-and-forget sync used after tag changes. Never throws.
 * Call as: queueDiscordSyncForUser(userId) -- no await needed.
 */
export function queueDiscordSyncForUser(userId: string): void {
  if (!isDiscordConfigured()) return;
  syncUserDiscord(userId).catch((error) =>
    console.error(
      `[Discord Sync] Background sync failed for user ${userId}:`,
      error instanceof Error ? error.message : error
    )
  );
}

/**
 * Fire-and-forget sync for every user holding a tag. Used when a role mapping
 * itself changes (created, deactivated, deleted).
 */
export async function queueDiscordSyncForTag(tagId: string): Promise<number> {
  const rows = await db
    .select({ userId: studentTags.userId })
    .from(studentTags)
    .where(eq(studentTags.tagId, tagId));
  for (const row of rows) {
    queueDiscordSyncForUser(row.userId);
  }
  return rows.length;
}

/**
 * Reconciliation pass over all linked users. Used by the daily cron and the
 * admin "Sync all now" button. Processes sequentially to stay well inside
 * Discord rate limits.
 */
export async function syncAllLinkedUsers(limit?: number): Promise<{
  processed: number;
  joined: number;
  removed: number;
  stripped: number;
  roleChanges: number;
  errors: number;
}> {
  const stats = {
    processed: 0,
    joined: 0,
    removed: 0,
    stripped: 0,
    roleChanges: 0,
    errors: 0,
  };

  if (!isDiscordConfigured()) return stats;

  let query = db
    .select({ userId: discordConnections.userId })
    .from(discordConnections)
    .$dynamic();
  if (limit) query = query.limit(limit);
  const connections = await query;

  for (const { userId } of connections) {
    const result = await syncUserDiscord(userId);
    stats.processed++;
    if (result.status === "joined") stats.joined++;
    if (result.status === "removed") stats.removed++;
    if (result.status === "stripped") stats.stripped++;
    if (result.status === "error") stats.errors++;
    if (result.rolesAdded.length > 0 || result.rolesRemoved.length > 0) {
      stats.roleChanges++;
    }
  }

  return stats;
}

/**
 * Sync users whose tags are affected by a set of tag IDs -- convenience for
 * webhook handlers that know which tags changed.
 */
export async function syncUsersForTags(tagIds: string[]): Promise<void> {
  if (tagIds.length === 0) return;
  const rows = await db
    .select({ userId: studentTags.userId })
    .from(studentTags)
    .where(inArray(studentTags.tagId, tagIds));
  const unique = [...new Set(rows.map((r) => r.userId))];
  for (const userId of unique) {
    queueDiscordSyncForUser(userId);
  }
}
