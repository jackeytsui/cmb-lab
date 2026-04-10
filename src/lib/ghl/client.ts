// src/lib/ghl/client.ts
// Rate-limited GHL API client using Private Integration Token (PIT)
// All GHL API calls MUST go through this client -- never direct fetch()

import { ghlBurstLimiter } from "@/lib/rate-limit";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const MAX_RETRIES = 3;

interface GhlRequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
}

interface GhlResponse<T = unknown> {
  data: T;
  status: number;
  burstRemaining: number | null;
  dailyRemaining: number | null;
}

class GhlClient {
  private tokenOverride: string | null;

  constructor(tokenOverride?: string) {
    this.tokenOverride = tokenOverride ?? null;
  }

  private getToken(): string {
    if (this.tokenOverride) {
      return this.tokenOverride;
    }
    const token = process.env.GHL_API_TOKEN;
    if (!token) {
      throw new Error(
        "GHL_API_TOKEN environment variable is not set. " +
          "Configure your GHL Private Integration Token."
      );
    }
    return token;
  }

  async get<T = unknown>(path: string): Promise<GhlResponse<T>> {
    return this.request<T>({ method: "GET", path });
  }

  async post<T = unknown>(path: string, body: unknown): Promise<GhlResponse<T>> {
    return this.request<T>({ method: "POST", path, body });
  }

  async put<T = unknown>(path: string, body: unknown): Promise<GhlResponse<T>> {
    return this.request<T>({ method: "PUT", path, body });
  }

  async delete<T = unknown>(path: string): Promise<GhlResponse<T>> {
    return this.request<T>({ method: "DELETE", path });
  }

  private async request<T = unknown>(
    options: GhlRequestOptions,
    attempt = 1
  ): Promise<GhlResponse<T>> {
    // Check Upstash rate limiter before making the request
    const rateLimitResult = await ghlBurstLimiter.limit("ghl-api");
    if (!rateLimitResult.success) {
      if (attempt > MAX_RETRIES) {
        throw new Error(
          `GHL API rate limit exceeded after ${MAX_RETRIES} retries. ` +
            `Resets at ${new Date(rateLimitResult.reset).toISOString()}`
        );
      }
      // Wait until rate limit resets
      const waitMs = Math.max(0, rateLimitResult.reset - Date.now());
      const backoffMs = Math.min(waitMs, 1000 * Math.pow(2, attempt - 1));
      await sleep(backoffMs);
      return this.request<T>(options, attempt + 1);
    }

    const token = this.getToken();
    const url = `${GHL_BASE_URL}${options.path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Version: GHL_API_VERSION,
      "Content-Type": "application/json",
    };

    const fetchOptions: RequestInit = {
      method: options.method,
      headers,
    };

    if (options.body && (options.method === "POST" || options.method === "PUT")) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);

    // Track rate limit headers from GHL response
    const burstRemaining = parseHeaderInt(
      response.headers.get("x-ratelimit-remaining")
    );
    const dailyRemaining = parseHeaderInt(
      response.headers.get("x-ratelimit-daily-remaining")
    );

    // Log warnings when approaching limits
    if (burstRemaining !== null && burstRemaining < 20) {
      console.warn(
        `[GHL] Burst rate limit low: ${burstRemaining} remaining`
      );
    }
    if (dailyRemaining !== null && dailyRemaining < 10000) {
      console.warn(
        `[GHL] Daily rate limit low: ${dailyRemaining} remaining`
      );
    }

    // Handle 429 Too Many Requests from GHL
    if (response.status === 429) {
      if (attempt > MAX_RETRIES) {
        throw new Error(
          `GHL API returned 429 after ${MAX_RETRIES} retries.`
        );
      }
      const retryAfter = parseHeaderInt(response.headers.get("retry-after"));
      const waitMs = retryAfter ? retryAfter * 1000 : 1000 * Math.pow(2, attempt - 1);
      console.warn(
        `[GHL] 429 received, retrying in ${waitMs}ms (attempt ${attempt}/${MAX_RETRIES})`
      );
      await sleep(waitMs);
      return this.request<T>(options, attempt + 1);
    }

    // Handle 401 Unauthorized
    if (response.status === 401) {
      throw new Error(
        "GHL API returned 401 Unauthorized. " +
          "Your GHL_API_TOKEN may be invalid or expired. " +
          "Check your Private Integration Token in GHL settings."
      );
    }

    // Handle other error responses
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(
        `GHL API error ${response.status} ${options.method} ${options.path}: ${errorBody}`
      );
    }

    const data = (await response.json()) as T;

    return {
      data,
      status: response.status,
      burstRemaining,
      dailyRemaining,
    };
  }
}

function parseHeaderInt(value: string | null): number | null {
  if (value === null) return null;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Singleton instance -- uses GHL_API_TOKEN env var (backward compat / fallback)
export const ghlClient = new GhlClient();

/**
 * Create a GHL client with a specific API token.
 * Use this for per-location API calls.
 */
export function createGhlClient(apiToken: string): GhlClient {
  return new GhlClient(apiToken);
}

/**
 * Get a GHL client configured for a specific location.
 * Looks up the API token from the ghlLocations table.
 * Returns null if location not found or inactive.
 */
export async function getGhlClientForLocation(
  ghlLocationId: string
): Promise<GhlClient | null> {
  // Lazy import to avoid circular dependency
  const { db } = await import("@/db");
  const { ghlLocations } = await import("@/db/schema");
  const { eq, and } = await import("drizzle-orm");

  const rows = await db
    .select({ apiToken: ghlLocations.apiToken })
    .from(ghlLocations)
    .where(
      and(
        eq(ghlLocations.ghlLocationId, ghlLocationId),
        eq(ghlLocations.isActive, true)
      )
    )
    .limit(1);

  if (rows.length === 0) return null;

  return new GhlClient(rows[0].apiToken);
}

// Helper to read location ID from environment (legacy single-location fallback)
export function getGhlLocationId(): string {
  const locationId = process.env.GHL_LOCATION_ID;
  if (!locationId) {
    throw new Error(
      "GHL_LOCATION_ID environment variable is not set. " +
        "Configure your GHL sub-account location ID."
    );
  }
  return locationId;
}
