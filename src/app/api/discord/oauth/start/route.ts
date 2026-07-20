// src/app/api/discord/oauth/start/route.ts
// Begins the Discord account-link flow for the signed-in user.
// Redirects to Discord's consent screen with a signed state token.

import { NextResponse } from "next/server";
import { getRealUser } from "@/lib/auth";
import {
  buildAuthorizeUrl,
  createOAuthState,
  isDiscordOAuthConfigured,
} from "@/lib/discord/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDiscordOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Discord integration is not configured. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.",
      },
      { status: 503 }
    );
  }

  const state = createOAuthState(user.id);
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
