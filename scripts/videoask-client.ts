/**
 * VideoAsk API client (TypeScript)
 *
 * A read-only client for the VideoAsk REST API, ported from the Python client
 * shipped with the VideoAsk MCP package (videoask_client.py). It is used by
 * scripts/videoask-migrate.ts so the scraper can talk to VideoAsk directly —
 * the same self-contained pattern as scripts/ghl-scrape-course.ts.
 *
 * It supports the same two credential modes as the MCP:
 *   - VIDEOASK_API_KEY, or
 *   - VIDEOASK_CLIENT_ID + VIDEOASK_CLIENT_SECRET + VIDEOASK_REFRESH_TOKEN
 *
 * If you would rather pull data through the MCP (from Claude Code / Codex)
 * instead of hitting the API directly, use `--from-json` on the migrate
 * script and drop the MCP's get_form output into the input directory. See
 * docs/videoask-migration.md.
 */

const BASE_URL = "https://api.videoask.com";
const AUTH_URL = "https://auth.videoask.com/oauth/token";

export class VideoAskError extends Error {}

export interface RawForm extends Record<string, unknown> {
  form_id?: string;
  id?: string;
  title?: string;
  name?: string;
  share_url?: string;
  url?: string;
}

export interface GetFormResult {
  form: Record<string, unknown>;
  questions: Array<{
    id: string | null;
    label: string | null;
    type: string | null;
    raw: Record<string, unknown>;
  }>;
  raw_questions: Array<Record<string, unknown>>;
}

export class VideoAskClient {
  private apiKey?: string;
  private clientId?: string;
  private clientSecret?: string;
  private refreshToken?: string;
  private accessToken?: string;
  private accessTokenExpiresAt = 0;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.apiKey = env.VIDEOASK_API_KEY;
    this.clientId = env.VIDEOASK_CLIENT_ID;
    this.clientSecret = env.VIDEOASK_CLIENT_SECRET;
    this.refreshToken = env.VIDEOASK_REFRESH_TOKEN;

    if (
      !this.apiKey &&
      !(this.clientId && this.clientSecret && this.refreshToken)
    ) {
      throw new VideoAskError(
        "Missing VideoAsk credentials. Set VIDEOASK_API_KEY or the OAuth trio " +
          "VIDEOASK_CLIENT_ID / VIDEOASK_CLIENT_SECRET / VIDEOASK_REFRESH_TOKEN.",
      );
    }
  }

  private async authHeaders(): Promise<Record<string, string>> {
    if (this.apiKey) {
      return {
        Authorization: `Bearer ${this.apiKey}`,
        "X-API-Key": this.apiKey,
      };
    }
    return { Authorization: `Bearer ${await this.accessTokenValue()}` };
  }

  private async accessTokenValue(): Promise<string> {
    const now = Date.now() / 1000;
    if (this.accessToken && now < this.accessTokenExpiresAt) {
      return this.accessToken;
    }
    if (!(this.clientId && this.clientSecret && this.refreshToken)) {
      throw new VideoAskError("OAuth credentials are missing.");
    }
    const resp = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
      }),
    });
    if (!resp.ok) {
      throw new VideoAskError(
        `VideoAsk token refresh failed (${resp.status}): ${await resp.text()}`,
      );
    }
    const payload = (await resp.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!payload.access_token) {
      throw new VideoAskError("VideoAsk token response missing access_token");
    }
    this.accessToken = payload.access_token;
    this.accessTokenExpiresAt = now + (payload.expires_in ?? 3600) - 60;
    return this.accessToken;
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, string>,
    retry = true,
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    let headers = { Accept: "application/json", ...(await this.authHeaders()) };
    let resp = await fetch(url, { method, headers });

    if (resp.status === 401 && retry && !this.apiKey) {
      // Token likely expired mid-run; force a refresh and retry once.
      this.accessToken = undefined;
      this.accessTokenExpiresAt = 0;
      headers = { Accept: "application/json", ...(await this.authHeaders()) };
      resp = await fetch(url, { method, headers });
    }
    if (!resp.ok) {
      throw new VideoAskError(
        `VideoAsk request failed (${resp.status}) for ${method} ${path}: ${await resp.text()}`,
      );
    }
    return (await resp.json()) as T;
  }

  private static extractItems(payload: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(payload)) {
      return payload.filter((i): i is Record<string, unknown> => !!i && typeof i === "object");
    }
    if (!payload || typeof payload !== "object") return [];
    const obj = payload as Record<string, unknown>;
    for (const key of ["data", "items", "forms", "contacts", "responses", "results"]) {
      const v = obj[key];
      if (Array.isArray(v)) {
        return v.filter((i): i is Record<string, unknown> => !!i && typeof i === "object");
      }
    }
    return [];
  }

  private static extractNextCursor(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null;
    const obj = payload as Record<string, unknown>;
    for (const key of ["next_cursor", "nextCursor", "cursor", "next"]) {
      const v = obj[key];
      if (typeof v === "string" && v) return v;
    }
    const paging = obj.paging;
    if (paging && typeof paging === "object") {
      for (const key of ["next_cursor", "nextCursor"]) {
        const v = (paging as Record<string, unknown>)[key];
        if (typeof v === "string" && v) return v;
      }
    }
    return null;
  }

  /** List forms, following cursor pagination up to `limit`. */
  async listForms(limit = 100): Promise<RawForm[]> {
    const items: Record<string, unknown>[] = [];
    let cursor: string | null = null;
    let path = "/forms";
    let params: Record<string, string> = { limit: String(limit) };
    for (;;) {
      if (cursor && /^https?:\/\//i.test(cursor)) {
        const u = new URL(cursor);
        path = u.pathname;
        params = Object.fromEntries(u.searchParams.entries());
      } else if (cursor) {
        params.cursor = cursor;
      }
      const payload: unknown = await this.request("GET", path, params);
      items.push(...VideoAskClient.extractItems(payload));
      cursor = VideoAskClient.extractNextCursor(payload);
      if (!cursor || items.length >= limit) break;
    }
    return items.slice(0, limit) as RawForm[];
  }

  /** Fetch one form and normalize its questions (label/type + raw). */
  async getForm(formId: string): Promise<GetFormResult> {
    const payload = (await this.request<Record<string, unknown>>(
      "GET",
      `/forms/${formId}`,
    )) as Record<string, unknown>;

    const form =
      payload.form && typeof payload.form === "object"
        ? (payload.form as Record<string, unknown>)
        : payload;

    let rawQuestions: Array<Record<string, unknown>> = [];
    for (const src of [payload, form]) {
      for (const key of ["raw_questions", "questions"]) {
        const v = (src as Record<string, unknown>)[key];
        if (Array.isArray(v)) {
          rawQuestions = v.filter(
            (q): q is Record<string, unknown> => !!q && typeof q === "object",
          );
          break;
        }
      }
      if (rawQuestions.length) break;
    }

    const questions = rawQuestions.map((q) => ({
      id:
        (q.id as string) ??
        (q.question_id as string) ??
        (q.uuid as string) ??
        (q._id as string) ??
        null,
      label:
        (q.label as string) ??
        (q.title as string) ??
        (q.text as string) ??
        (q.question as string) ??
        null,
      type: (q.type as string) ?? (q.kind as string) ?? null,
      raw: q,
    }));

    return { form, questions, raw_questions: rawQuestions };
  }
}
