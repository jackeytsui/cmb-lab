import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { discordConnections } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { isDiscordConfigured } from "@/lib/discord/client";
import { isDiscordOAuthConfigured } from "@/lib/discord/oauth";
import { CommunityClient } from "./CommunityClient";

/**
 * Student-facing Discord community page.
 * One click connects their Discord account; the bot adds them to the server
 * with the right roles automatically -- no manual invites.
 */
export default async function CommunityPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const connections = await db
    .select({
      discordUsername: discordConnections.discordUsername,
      guildStatus: discordConnections.guildStatus,
      guildJoinedAt: discordConnections.guildJoinedAt,
      lastSyncError: discordConnections.lastSyncError,
    })
    .from(discordConnections)
    .where(eq(discordConnections.userId, user.id))
    .limit(1);

  const connection = connections.length > 0 ? connections[0] : null;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <CommunityClient
        configured={isDiscordConfigured() && isDiscordOAuthConfigured()}
        connection={
          connection
            ? {
                username: connection.discordUsername,
                guildStatus: connection.guildStatus,
                joinedAt: connection.guildJoinedAt?.toISOString() ?? null,
                syncError: connection.lastSyncError,
              }
            : null
        }
      />
    </div>
  );
}
