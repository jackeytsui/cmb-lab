// src/lib/discord/oauth.ts
// Discord OAuth2 helpers for the student account-link flow.
// Scopes: identify (who they are) + guilds.join (bot can add them to the
// server automatically -- this is what removes the manual invite step).

import crypto from "crypto";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface DiscordTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  scope: string;
  token_type: string;
}

export interface DiscordOAuthUser {
  id: string;
  username: string;
  avatar: string | null;
}

export function isDiscordOAuthConfigured(): boolean {
  return !!process.env.DISCORD_CLIENT_ID && !!process.env.DISCORD_CLIENT_SECRET;
}

function getClientId(): string {
  const id = process.env.DISCORD_CLIENT_ID;
  if (!id) throw new Error("DISCORD_CLIENT_ID environment variable is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.DISCORD_CLIENT_SECRET;
  if (!secret)
    throw new Error("DISCORD_CLIENT_SECRET environment variable is not set.");
  return secret;
}

export function getRedirectUri(): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  if (!appUrl) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be set to build the Discord OAuth redirect URI."
    );
  }
  return `${appUrl}/api/discord/oauth/callback`;
}

// --- Signed state (CSRF protection, carries the LMS user id) ---

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", getClientSecret())
    .update(payload)
    .digest("base64url");
}

export function createOAuthState(userId: string): string {
  const payload = `${userId}.${Date.now() + STATE_TTL_MS}.${crypto
    .randomBytes(8)
    .toString("hex")}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function verifyOAuthState(state: string): { userId: string } | null {
  const dotIndex = state.lastIndexOf(".");
  if (dotIndex <= 0) return null;

  const encodedPayload = state.slice(0, dotIndex);
  const signature = state.slice(dotIndex + 1);

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = sign(payload);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  const [userId, expiresAtRaw] = payload.split(".");
  const expiresAt = parseInt(expiresAtRaw, 10);
  if (!userId || isNaN(expiresAt) || Date.now() > expiresAt) return null;

  return { userId };
}

// --- OAuth endpoints ---

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "identify guilds.join",
    state,
    prompt: "consent",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<DiscordTokenResponse> {
  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Discord token exchange failed (${response.status}): ${body}`);
  }

  return (await response.json()) as DiscordTokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<DiscordTokenResponse | null> {
  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    // Refresh tokens are revoked when the user de-authorizes the app.
    console.warn(`[Discord OAuth] Token refresh failed (${response.status})`);
    return null;
  }

  return (await response.json()) as DiscordTokenResponse;
}

export async function fetchDiscordUser(
  accessToken: string
): Promise<DiscordOAuthUser> {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Discord /users/@me failed (${response.status})`);
  }

  const data = (await response.json()) as DiscordOAuthUser;
  return { id: data.id, username: data.username, avatar: data.avatar };
}
