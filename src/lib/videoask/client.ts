import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  videoaskIntegration,
  type VideoAskIntegration,
} from "@/db/schema";
import {
  decryptVideoAskSecret,
  encryptVideoAskSecret,
} from "./crypto";

const VIDEOASK_API_URL = "https://api.videoask.com";
const VIDEOASK_AUTHORIZE_URL = "https://auth.videoask.com/authorize";
const VIDEOASK_TOKEN_URL = "https://auth.videoask.com/oauth/token";
const VIDEOASK_SCOPE = "openid profile email offline_access";
const PRIMARY_CONNECTION_ID = "primary";
const REFRESH_EARLY_MS = 90_000;
const REQUEST_TIMEOUT_MS = 30_000;

export const VIDEOASK_OAUTH_STATE_COOKIE = "videoask_oauth_state";

type VideoAskTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

export type VideoAskOrganization = {
  id: string;
  name: string;
};

export type VideoAskFormSummary = {
  id: string;
  title: string;
  folderId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getVideoAskRedirectUri(): string {
  const explicit = process.env.VIDEOASK_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  const appUrl = requiredEnv("NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
  return `${appUrl}/api/admin/integrations/videoask/callback`;
}

export function getVideoAskAuthorizationUrl(state: string): string {
  const url = new URL(VIDEOASK_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("audience", `${VIDEOASK_API_URL}/`);
  url.searchParams.set("client_id", requiredEnv("VIDEOASK_CLIENT_ID"));
  url.searchParams.set("scope", VIDEOASK_SCOPE);
  url.searchParams.set("redirect_uri", getVideoAskRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

export function getVideoAskConfigurationStatus() {
  return {
    clientId: Boolean(process.env.VIDEOASK_CLIENT_ID?.trim()),
    clientSecret: Boolean(process.env.VIDEOASK_CLIENT_SECRET?.trim()),
    encryptionKey: Boolean(
      process.env.VIDEOASK_TOKEN_ENCRYPTION_KEY?.trim(),
    ),
    appUrl: Boolean(
      process.env.VIDEOASK_REDIRECT_URI?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim(),
    ),
  };
}

function parseTokenResponse(value: unknown): VideoAskTokenResponse {
  if (!value || typeof value !== "object") {
    throw new Error("VideoAsk returned an invalid token response");
  }
  const token = value as Record<string, unknown>;
  const expiresIn = Number(token.expires_in);
  if (
    typeof token.access_token !== "string" ||
    !token.access_token ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new Error("VideoAsk did not return a usable access token");
  }

  return {
    access_token: token.access_token,
    refresh_token:
      typeof token.refresh_token === "string" && token.refresh_token
        ? token.refresh_token
        : undefined,
    expires_in: expiresIn,
    scope: typeof token.scope === "string" ? token.scope : undefined,
    token_type:
      typeof token.token_type === "string" ? token.token_type : undefined,
  };
}

async function postTokenRequest(
  fields: Record<string, string>,
): Promise<VideoAskTokenResponse> {
  const response = await fetch(VIDEOASK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const safeMessage =
      payload && typeof payload === "object"
        ? String(
            (payload as Record<string, unknown>).error_description ||
              (payload as Record<string, unknown>).error ||
              "token request failed",
          )
        : "token request failed";
    throw new Error(`VideoAsk OAuth ${safeMessage} (${response.status})`);
  }

  return parseTokenResponse(payload);
}

export function exchangeVideoAskAuthorizationCode(code: string) {
  return postTokenRequest({
    grant_type: "authorization_code",
    code,
    client_id: requiredEnv("VIDEOASK_CLIENT_ID"),
    client_secret: requiredEnv("VIDEOASK_CLIENT_SECRET"),
    redirect_uri: getVideoAskRedirectUri(),
  });
}

async function refreshVideoAskTokens(refreshToken: string) {
  return postTokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: requiredEnv("VIDEOASK_CLIENT_ID"),
    client_secret: requiredEnv("VIDEOASK_CLIENT_SECRET"),
    scope: VIDEOASK_SCOPE,
  });
}

async function videoAskFetch(
  path: string,
  accessToken: string,
  organizationId?: string,
): Promise<Response> {
  const headers: HeadersInit = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  if (organizationId) headers["organization-id"] = organizationId;

  return fetch(`${VIDEOASK_API_URL}${path}`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function parseApiResponse(response: Response, label: string) {
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(`VideoAsk ${label} request failed (${response.status})`);
  }
  return payload;
}

function objectList(payload: unknown): Record<string, unknown>[] {
  const candidate = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? ((payload as Record<string, unknown>).results ??
        (payload as Record<string, unknown>).organizations ??
        (payload as Record<string, unknown>).items)
      : null;

  return Array.isArray(candidate)
    ? candidate.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
}

export async function fetchVideoAskOrganizations(
  accessToken: string,
): Promise<VideoAskOrganization[]> {
  const response = await videoAskFetch("/organizations", accessToken);
  const payload = await parseApiResponse(response, "organizations");

  return objectList(payload)
    .map((item) => ({
      id: String(item.id || item.organization_id || ""),
      name: String(item.name || item.organization_name || "Unnamed organization"),
    }))
    .filter((organization) => organization.id);
}

export async function saveVideoAskConnection(input: {
  organization: VideoAskOrganization;
  tokens: VideoAskTokenResponse;
  connectedBy: string | null;
}) {
  if (!input.tokens.refresh_token) {
    throw new Error(
      "VideoAsk did not return a refresh token. Reconnect and approve offline access.",
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.tokens.expires_in * 1_000);
  await db
    .insert(videoaskIntegration)
    .values({
      id: PRIMARY_CONNECTION_ID,
      organizationId: input.organization.id,
      organizationName: input.organization.name,
      accessTokenEncrypted: encryptVideoAskSecret(input.tokens.access_token),
      refreshTokenEncrypted: encryptVideoAskSecret(input.tokens.refresh_token),
      accessTokenExpiresAt: expiresAt,
      scope: input.tokens.scope || VIDEOASK_SCOPE,
      connectedBy: input.connectedBy,
      lastValidatedAt: now,
      lastError: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: videoaskIntegration.id,
      set: {
        organizationId: input.organization.id,
        organizationName: input.organization.name,
        accessTokenEncrypted: encryptVideoAskSecret(input.tokens.access_token),
        refreshTokenEncrypted: encryptVideoAskSecret(input.tokens.refresh_token),
        accessTokenExpiresAt: expiresAt,
        scope: input.tokens.scope || VIDEOASK_SCOPE,
        connectedBy: input.connectedBy,
        lastValidatedAt: now,
        lastError: null,
        updatedAt: now,
      },
    });
}

export async function getVideoAskConnection(): Promise<VideoAskIntegration | null> {
  const [connection] = await db
    .select()
    .from(videoaskIntegration)
    .where(eq(videoaskIntegration.id, PRIMARY_CONNECTION_ID))
    .limit(1);
  return connection ?? null;
}

async function recordConnectionError(message: string) {
  await db
    .update(videoaskIntegration)
    .set({ lastError: message.slice(0, 1_000), updatedAt: new Date() })
    .where(eq(videoaskIntegration.id, PRIMARY_CONNECTION_ID));
}

async function refreshConnection(
  connection: VideoAskIntegration,
): Promise<{ connection: VideoAskIntegration; accessToken: string }> {
  let tokens: VideoAskTokenResponse;
  try {
    tokens = await refreshVideoAskTokens(
      decryptVideoAskSecret(connection.refreshTokenEncrypted),
    );
  } catch (error) {
    // Another serverless request may have rotated the refresh token first.
    const latest = await getVideoAskConnection();
    if (latest && latest.updatedAt.getTime() > connection.updatedAt.getTime()) {
      return {
        connection: latest,
        accessToken: decryptVideoAskSecret(latest.accessTokenEncrypted),
      };
    }
    const message = error instanceof Error ? error.message : "Token refresh failed";
    await recordConnectionError(message);
    throw error;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + tokens.expires_in * 1_000);
  const accessTokenEncrypted = encryptVideoAskSecret(tokens.access_token);
  const refreshTokenEncrypted = tokens.refresh_token
    ? encryptVideoAskSecret(tokens.refresh_token)
    : connection.refreshTokenEncrypted;

  const [updated] = await db
    .update(videoaskIntegration)
    .set({
      accessTokenEncrypted,
      refreshTokenEncrypted,
      accessTokenExpiresAt: expiresAt,
      scope: tokens.scope || connection.scope,
      lastValidatedAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(videoaskIntegration.id, PRIMARY_CONNECTION_ID),
        eq(
          videoaskIntegration.refreshTokenEncrypted,
          connection.refreshTokenEncrypted,
        ),
      ),
    )
    .returning();

  if (updated) return { connection: updated, accessToken: tokens.access_token };

  const latest = await getVideoAskConnection();
  if (!latest) throw new Error("VideoAsk connection disappeared during refresh");
  return {
    connection: latest,
    accessToken: decryptVideoAskSecret(latest.accessTokenEncrypted),
  };
}

async function getAuthenticatedConnection(forceRefresh = false) {
  const connection = await getVideoAskConnection();
  if (!connection) throw new Error("VideoAsk is not connected");

  const stillValid =
    connection.accessTokenExpiresAt.getTime() - Date.now() > REFRESH_EARLY_MS;
  if (!forceRefresh && stillValid) {
    return {
      connection,
      accessToken: decryptVideoAskSecret(connection.accessTokenEncrypted),
    };
  }

  return refreshConnection(connection);
}

function formSummary(item: Record<string, unknown>): VideoAskFormSummary | null {
  const id = String(item.id || item.form_id || item.videoask_id || "");
  if (!id) return null;
  return {
    id,
    title: String(item.title || item.name || "Untitled form"),
    folderId:
      typeof item.folder_id === "string" && item.folder_id
        ? item.folder_id
        : null,
    createdAt:
      typeof item.created_at === "string" ? item.created_at : null,
    updatedAt:
      typeof item.updated_at === "string" ? item.updated_at : null,
  };
}

async function fetchFormsPage(
  accessToken: string,
  organizationId: string,
  offset: number,
  limit: number,
) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    with_count: "1",
  });
  const response = await videoAskFetch(
    `/forms?${params.toString()}`,
    accessToken,
    organizationId,
  );
  return { response, payload: await response.clone().json().catch(() => null) };
}

export async function listAllVideoAskForms(): Promise<VideoAskFormSummary[]> {
  let authenticated = await getAuthenticatedConnection();
  const forms: VideoAskFormSummary[] = [];
  const limit = 100;

  for (let offset = 0; ; offset += limit) {
    let { response, payload } = await fetchFormsPage(
      authenticated.accessToken,
      authenticated.connection.organizationId,
      offset,
      limit,
    );

    if (response.status === 401) {
      authenticated = await getAuthenticatedConnection(true);
      ({ response, payload } = await fetchFormsPage(
        authenticated.accessToken,
        authenticated.connection.organizationId,
        offset,
        limit,
      ));
    }

    if (!response.ok) {
      const message = `VideoAsk forms request failed (${response.status})`;
      await recordConnectionError(message);
      throw new Error(message);
    }

    const page = objectList(payload);
    for (const item of page) {
      const form = formSummary(item);
      if (form) forms.push(form);
    }

    const count =
      payload && typeof payload === "object"
        ? Number((payload as Record<string, unknown>).count)
        : Number.NaN;
    if (page.length < limit || (Number.isFinite(count) && forms.length >= count)) {
      break;
    }
  }

  await db
    .update(videoaskIntegration)
    .set({ lastValidatedAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(videoaskIntegration.id, PRIMARY_CONNECTION_ID));

  return forms;
}
