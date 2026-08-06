export type VocalHackResponseMediaType = "audio" | "video";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

/** Preserve the response modes enabled on the original VideoAsk step. */
export function sourceResponseMediaTypes(
  sourceSnapshot: unknown,
): VocalHackResponseMediaType[] {
  const allowed = asObject(sourceSnapshot).allowed_answer_media_types;
  const values = Array.isArray(allowed)
    ? allowed.map((value) => String(value).toLowerCase())
    : [];
  const result: VocalHackResponseMediaType[] = [];
  // Prefer the lighter audio response while retaining VideoAsk's camera option.
  if (values.includes("audio")) result.push("audio");
  if (values.includes("video")) result.push("video");
  return result.length > 0 ? result : ["audio"];
}

/** VideoAsk stores one response limit per form. Keep a safe five-minute cap. */
export function sourceResponseTimeLimitSeconds(
  sourceFormSnapshot: unknown,
  fallback = 300,
) {
  const raw = asObject(sourceFormSnapshot).reply_media_time_limit;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  const seconds = Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  return Math.min(600, Math.max(10, seconds));
}

/** Hide VideoAsk's generic labels while preserving meaningful coach prompts. */
export function studentFacingSourcePrompt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const prompt = value.trim();
  if (!prompt) return null;
  if (/^(?:step|sentence)\s*#?\s*\d+\.?$/i.test(prompt)) return null;
  return prompt;
}
