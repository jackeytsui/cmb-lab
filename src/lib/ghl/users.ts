import "server-only";

import { getGhlClientForLocation } from "./client";
import {
  selectExactGhlUserId,
  type GhlUserSummary,
} from "./user-resolution";

const USER_CACHE_MS = 10 * 60 * 1000;
const userCache = new Map<string, { userId: string; expires: number }>();

interface GhlLocationResponse {
  location?: { companyId?: string };
}

interface GhlUserSearchResponse {
  users?: GhlUserSummary[];
}

/** Resolve an assignee email to a GHL user ID in one specific sub-account. */
export async function resolveGhlUserIdByEmail(
  ghlLocationId: string,
  email: string,
): Promise<string> {
  const cacheKey = `${ghlLocationId}:${email.trim().toLowerCase()}`;
  const cached = userCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.userId;

  const client = await getGhlClientForLocation(ghlLocationId);
  if (!client) {
    throw new Error(`No active GHL location configured for ${ghlLocationId}`);
  }

  const locationResponse = await client.get<GhlLocationResponse>(
    `/locations/${encodeURIComponent(ghlLocationId)}`,
    { apiVersion: "v3" },
  );
  const companyId = locationResponse.data.location?.companyId;
  if (!companyId) {
    throw new Error(`GHL location ${ghlLocationId} has no company ID`);
  }

  const query = new URLSearchParams({
    companyId,
    locationId: ghlLocationId,
    query: email.trim(),
    limit: "25",
  });
  const usersResponse = await client.get<GhlUserSearchResponse>(
    `/users/search?${query.toString()}`,
    { apiVersion: "v3" },
  );
  const userId = selectExactGhlUserId(usersResponse.data.users ?? [], email);
  if (!userId) {
    throw new Error(
      `No active GHL user found for ${email} in location ${ghlLocationId}`,
    );
  }

  userCache.set(cacheKey, {
    userId,
    expires: Date.now() + USER_CACHE_MS,
  });
  return userId;
}
