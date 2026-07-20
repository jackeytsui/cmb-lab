// src/lib/discord/client.ts
// Rate-limit-aware Discord REST client using the bot token.
// All Discord API calls MUST go through this module -- never direct fetch().
// Mirrors the conventions of src/lib/ghl/client.ts.

const DISCORD_API_BASE = "https://discord.com/api/v10";
const MAX_RETRIES = 3;

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}

export interface DiscordGuild {
  id: string;
  name: string;
  approximate_member_count?: number;
}

export interface DiscordGuildMember {
  user?: { id: string; username: string; avatar: string | null };
  roles: string[];
  joined_at: string;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

export function isDiscordConfigured(): boolean {
  return !!process.env.DISCORD_BOT_TOKEN && !!process.env.DISCORD_GUILD_ID;
}

export function getDiscordGuildId(): string {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    throw new Error(
      "DISCORD_GUILD_ID environment variable is not set. " +
        "Configure the Discord server (guild) ID for the student community."
    );
  }
  return guildId;
}

function getBotToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "DISCORD_BOT_TOKEN environment variable is not set. " +
        "Create a bot at https://discord.com/developers/applications and configure its token."
    );
  }
  return token;
}

interface DiscordRequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  auditReason?: string;
}

/**
 * Raw Discord API request with 429 retry handling.
 * Returns null for 404s on GET/DELETE (caller decides how to treat missing
 * resources); throws on other errors.
 */
async function discordRequest<T = unknown>(
  options: DiscordRequestOptions,
  attempt = 1
): Promise<{ data: T | null; status: number }> {
  const url = `${DISCORD_API_BASE}${options.path}`;
  const headers: Record<string, string> = {
    Authorization: `Bot ${getBotToken()}`,
    "Content-Type": "application/json",
  };
  if (options.auditReason) {
    headers["X-Audit-Log-Reason"] = encodeURIComponent(options.auditReason);
  }

  const fetchOptions: RequestInit = { method: options.method, headers };
  if (options.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);

  if (response.status === 429) {
    if (attempt > MAX_RETRIES) {
      throw new Error(`Discord API returned 429 after ${MAX_RETRIES} retries.`);
    }
    let waitMs = 1000 * Math.pow(2, attempt - 1);
    try {
      const body = (await response.json()) as { retry_after?: number };
      if (typeof body.retry_after === "number") {
        waitMs = Math.ceil(body.retry_after * 1000) + 100;
      }
    } catch {
      // fall back to exponential backoff
    }
    console.warn(
      `[Discord] 429 received, retrying in ${waitMs}ms (attempt ${attempt}/${MAX_RETRIES})`
    );
    await sleep(waitMs);
    return discordRequest<T>(options, attempt + 1);
  }

  if (response.status === 404) {
    return { data: null, status: 404 };
  }

  if (response.status === 401) {
    throw new Error(
      "Discord API returned 401 Unauthorized. DISCORD_BOT_TOKEN may be invalid."
    );
  }

  if (response.status === 403) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Discord API returned 403 Forbidden for ${options.method} ${options.path}. ` +
        `Check the bot's permissions and role position in the server. ${errorBody}`
    );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Discord API error ${response.status} ${options.method} ${options.path}: ${errorBody}`
    );
  }

  // 204 No Content
  if (response.status === 204) {
    return { data: null, status: 204 };
  }

  const data = (await response.json()) as T;
  return { data, status: response.status };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Guild ---

export async function getGuild(): Promise<DiscordGuild | null> {
  const guildId = getDiscordGuildId();
  const { data } = await discordRequest<DiscordGuild>({
    method: "GET",
    path: `/guilds/${guildId}?with_counts=true`,
  });
  return data;
}

export async function listGuildRoles(): Promise<DiscordRole[]> {
  const guildId = getDiscordGuildId();
  const { data } = await discordRequest<DiscordRole[]>({
    method: "GET",
    path: `/guilds/${guildId}/roles`,
  });
  return data ?? [];
}

export async function createGuildRole(
  name: string,
  color?: number
): Promise<DiscordRole> {
  const guildId = getDiscordGuildId();
  const { data } = await discordRequest<DiscordRole>({
    method: "POST",
    path: `/guilds/${guildId}/roles`,
    body: { name, color: color ?? 0, mentionable: false, hoist: false },
    auditReason: "CMB Lab automation: role provisioned for tag mapping",
  });
  if (!data) throw new Error("Discord role creation returned no data");
  return data;
}

// --- Members ---

export async function getGuildMember(
  discordUserId: string
): Promise<DiscordGuildMember | null> {
  const guildId = getDiscordGuildId();
  const { data } = await discordRequest<DiscordGuildMember>({
    method: "GET",
    path: `/guilds/${guildId}/members/${discordUserId}`,
  });
  return data;
}

/**
 * Add a user to the guild using their OAuth2 access token (guilds.join scope),
 * optionally with initial roles. Returns "added" | "already_member".
 */
export async function addGuildMember(
  discordUserId: string,
  accessToken: string,
  roleIds: string[]
): Promise<"added" | "already_member"> {
  const guildId = getDiscordGuildId();
  const { status } = await discordRequest({
    method: "PUT",
    path: `/guilds/${guildId}/members/${discordUserId}`,
    body: { access_token: accessToken, roles: roleIds },
  });
  // 201 = joined, 204 = already a member
  return status === 201 ? "added" : "already_member";
}

export async function addMemberRole(
  discordUserId: string,
  roleId: string
): Promise<void> {
  const guildId = getDiscordGuildId();
  await discordRequest({
    method: "PUT",
    path: `/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
    auditReason: "CMB Lab automation: tag-based role sync",
  });
}

export async function removeMemberRole(
  discordUserId: string,
  roleId: string
): Promise<void> {
  const guildId = getDiscordGuildId();
  await discordRequest({
    method: "DELETE",
    path: `/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
    auditReason: "CMB Lab automation: tag-based role sync",
  });
}

export async function kickGuildMember(
  discordUserId: string,
  reason: string
): Promise<void> {
  const guildId = getDiscordGuildId();
  await discordRequest({
    method: "DELETE",
    path: `/guilds/${guildId}/members/${discordUserId}`,
    auditReason: reason,
  });
}

// --- Channels ---

// Discord permission bits
const VIEW_CHANNEL = "1024"; // 1 << 10

/**
 * Create a private text channel visible only to a role (and the bot).
 * everyone is denied VIEW_CHANNEL; the role is allowed it.
 */
export async function createPrivateChannelForRole(
  name: string,
  roleId: string
): Promise<DiscordChannel> {
  const guildId = getDiscordGuildId();
  const { data } = await discordRequest<DiscordChannel>({
    method: "POST",
    path: `/guilds/${guildId}/channels`,
    body: {
      name,
      type: 0, // text channel
      permission_overwrites: [
        { id: guildId, type: 0, deny: VIEW_CHANNEL }, // @everyone
        { id: roleId, type: 0, allow: VIEW_CHANNEL },
      ],
    },
    auditReason: "CMB Lab automation: private channel provisioned for tag mapping",
  });
  if (!data) throw new Error("Discord channel creation returned no data");
  return data;
}
