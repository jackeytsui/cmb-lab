// src/app/api/discord/oauth/callback/route.ts
// Discord OAuth callback: verifies state, stores the connection, and
// immediately joins the student to the guild with their tag-mapped roles.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { discordConnections } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import {
  exchangeCode,
  fetchDiscordUser,
  verifyOAuthState,
} from "@/lib/discord/oauth";
import { logDiscordAction, syncUserDiscord } from "@/lib/discord/sync";

export const dynamic = "force-dynamic";

function redirectToCommunity(req: NextRequest, result: string): NextResponse {
  const appUrl =
    (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "") ||
    req.nextUrl.origin;
  return NextResponse.redirect(
    `${appUrl}/dashboard/community?discord=${result}`
  );
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (req.nextUrl.searchParams.get("error")) {
    // User declined the consent screen.
    return redirectToCommunity(req, "declined");
  }

  if (!code || !state) {
    return redirectToCommunity(req, "error");
  }

  const verified = verifyOAuthState(state);
  if (!verified) {
    return redirectToCommunity(req, "error");
  }

  try {
    const tokens = await exchangeCode(code);
    const discordUser = await fetchDiscordUser(tokens.access_token);

    // A Discord account can only be linked to one LMS user at a time.
    const conflict = await db
      .select({ id: discordConnections.id })
      .from(discordConnections)
      .where(
        and(
          eq(discordConnections.discordUserId, discordUser.id),
          ne(discordConnections.userId, verified.userId)
        )
      )
      .limit(1);
    if (conflict.length > 0) {
      return redirectToCommunity(req, "already_linked");
    }

    await db
      .insert(discordConnections)
      .values({
        userId: verified.userId,
        discordUserId: discordUser.id,
        discordUsername: discordUser.username,
        discordAvatar: discordUser.avatar,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        guildStatus: "pending",
      })
      .onConflictDoUpdate({
        target: discordConnections.userId,
        set: {
          discordUserId: discordUser.id,
          discordUsername: discordUser.username,
          discordAvatar: discordUser.avatar,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          lastSyncError: null,
        },
      });

    await logDiscordAction({
      userId: verified.userId,
      discordUserId: discordUser.id,
      action: "account.link",
      detail: { username: discordUser.username },
    });

    // Join the guild + assign roles right away (no manual invite).
    const result = await syncUserDiscord(verified.userId);

    if (result.status === "joined" || result.status === "synced") {
      return redirectToCommunity(req, "connected");
    }
    if (result.status === "not_configured") {
      return redirectToCommunity(req, "linked_only");
    }
    // Linked, but no membership-granting tag yet (or sync error). The daily
    // cron / next tag change will pick them up.
    return redirectToCommunity(
      req,
      result.status === "error" ? "linked_only" : "connected"
    );
  } catch (error) {
    console.error(
      "[Discord OAuth] Callback failed:",
      error instanceof Error ? error.message : error
    );
    return redirectToCommunity(req, "error");
  }
}
