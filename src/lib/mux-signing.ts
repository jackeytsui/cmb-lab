import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, lessons, videoUploads } from "@/db/schema";
import { mux } from "@/lib/mux";

// ============================================================
// Mux signed playback
//
// All Mux-hosted video is served with the "signed" playback policy so a
// playback ID alone is useless: every stream/thumbnail/storyboard request
// must carry a short-lived JWT minted server-side for a logged-in user.
// Captured URLs die when the token expires, and stream.mux.com no longer
// serves the content to anonymous visitors at all.
// ============================================================

/**
 * Token lifetime. Long enough that a student can watch an entire lesson
 * (and re-watch within a study session) without the player breaking
 * mid-stream; short enough that a URL pulled out of dev tools is dead
 * within hours instead of forever.
 */
const TOKEN_TTL = "6h";

const KEY_ID_SETTING = "mux_signing_key_id";
const KEY_SECRET_SETTING = "mux_signing_key_private_key";
/** Maps a retired public playback ID -> its signed replacement. */
const SWAP_SETTING_PREFIX = "mux_playback_swap_";

export interface MuxPlaybackTokens {
  playback: string;
  thumbnail: string;
  storyboard: string;
}

// Per-instance cache: the signing key never changes once provisioned.
let cachedKey: { keyId: string; keySecret: string } | null = null;

/**
 * Returns the Mux signing key, provisioning one on first use.
 *
 * Resolution order: explicit env vars (MUX_SIGNING_KEY_ID +
 * MUX_SIGNING_KEY_PRIVATE_KEY), then app_settings, then a key created via
 * the Mux API and persisted to app_settings — so no manual dashboard or
 * env setup is required. A concurrent-provisioning race is settled by the
 * database: whoever inserts first wins and everyone re-reads.
 */
export async function getMuxSigningKey(): Promise<{
  keyId: string;
  keySecret: string;
}> {
  if (cachedKey) return cachedKey;

  const envId = process.env.MUX_SIGNING_KEY_ID?.trim();
  const envSecret = process.env.MUX_SIGNING_KEY_PRIVATE_KEY?.trim();
  if (envId && envSecret) {
    cachedKey = { keyId: envId, keySecret: envSecret };
    return cachedKey;
  }

  const readStored = async () => {
    const rows = await db
      .select({ key: appSettings.key, value: appSettings.value })
      .from(appSettings)
      .where(inArray(appSettings.key, [KEY_ID_SETTING, KEY_SECRET_SETTING]));
    const keyId = rows.find((r) => r.key === KEY_ID_SETTING)?.value;
    const keySecret = rows.find((r) => r.key === KEY_SECRET_SETTING)?.value;
    return keyId && keySecret ? { keyId, keySecret } : null;
  };

  const stored = await readStored();
  if (stored) {
    cachedKey = stored;
    return cachedKey;
  }

  const created = await mux.system.signingKeys.create();
  if (!created.id || !created.private_key) {
    throw new Error("Mux did not return a usable signing key");
  }
  await db
    .insert(appSettings)
    .values([
      {
        key: KEY_ID_SETTING,
        value: created.id,
        description: "Mux signing key ID for signed video playback (auto-provisioned)",
      },
      {
        key: KEY_SECRET_SETTING,
        value: created.private_key,
        description: "Mux signing key private key (base64) for signed video playback",
      },
    ])
    .onConflictDoNothing();

  // Re-read: if a concurrent invocation provisioned first, use its key so
  // every instance signs with the same one. Our extra key at Mux is unused.
  const winner = await readStored();
  if (!winner) throw new Error("Failed to persist Mux signing key");
  cachedKey = winner;
  return cachedKey;
}

/** Mints playback/thumbnail/storyboard JWTs for a signed playback ID. */
export async function signPlaybackTokens(
  playbackId: string,
): Promise<MuxPlaybackTokens> {
  const { keyId, keySecret } = await getMuxSigningKey();
  const base = { keyId, keySecret, expiration: TOKEN_TTL };
  const [playback, thumbnail, storyboard] = await Promise.all([
    mux.jwt.signPlaybackId(playbackId, { ...base, type: "video" }),
    mux.jwt.signPlaybackId(playbackId, { ...base, type: "thumbnail" }),
    mux.jwt.signPlaybackId(playbackId, { ...base, type: "storyboard" }),
  ]);
  return { playback, thumbnail, storyboard };
}

/**
 * Rewrites every stored reference to a playback ID after a public->signed
 * swap. Covers the structured columns plus the text/JSON columns that embed
 * playback IDs inside stream.mux.com / image.mux.com URLs.
 */
async function rewriteStoredPlaybackId(oldId: string, newId: string) {
  const pattern = `%${oldId}%`;

  await db
    .update(videoUploads)
    .set({ muxPlaybackId: newId })
    .where(eq(videoUploads.muxPlaybackId, oldId));
  await db
    .update(lessons)
    .set({ muxPlaybackId: newId })
    .where(eq(lessons.muxPlaybackId, oldId));

  await db.execute(
    sql`UPDATE video_prompts SET video_url = REPLACE(video_url, ${oldId}, ${newId}) WHERE video_url LIKE ${pattern}`,
  );
  await db.execute(
    sql`UPDATE video_thread_steps SET video_url = REPLACE(video_url, ${oldId}, ${newId}) WHERE video_url LIKE ${pattern}`,
  );
  await db.execute(
    sql`UPDATE submissions SET video_url = REPLACE(video_url, ${oldId}, ${newId}) WHERE video_url LIKE ${pattern}`,
  );
  await db.execute(
    sql`UPDATE tone_mastery_clips SET video_url = REPLACE(video_url, ${oldId}, ${newId}) WHERE video_url LIKE ${pattern}`,
  );
  await db.execute(
    sql`UPDATE course_library_lessons SET content = REPLACE(content::text, ${oldId}, ${newId})::jsonb WHERE content::text LIKE ${pattern}`,
  );
  await db.execute(
    sql`UPDATE practice_exercises SET definition = REPLACE(definition::text, ${oldId}, ${newId})::jsonb WHERE definition::text LIKE ${pattern}`,
  );
}

function isMuxNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: unknown }).status === 404
  );
}

/**
 * Ensures the asset behind a playback ID is only reachable through signed
 * playback. For a public playback ID: adds a signed playback ID (reusing an
 * existing one if present), rewrites every stored reference, records the
 * old->new mapping, then deletes the asset's public playback IDs.
 *
 * Returns the playback ID that should be used from now on.
 */
export async function ensureSignedPlaybackId(
  playbackId: string,
): Promise<string> {
  const info = await mux.video.playbackIds.retrieve(playbackId);
  if (info.policy !== "public") return playbackId;
  if (info.object.type !== "asset") return playbackId;

  const assetId = info.object.id;
  const asset = await mux.video.assets.retrieve(assetId);
  let signedId = asset.playback_ids?.find((p) => p.policy === "signed")?.id;
  if (!signedId) {
    const createdId = (
      await mux.video.assets.createPlaybackId(assetId, { policy: "signed" })
    ).id;
    if (!createdId) throw new Error("Mux did not return a signed playback ID");
    signedId = createdId;
  }

  // Rewrite references and record the mapping BEFORE closing the public
  // door, so a failure part-way through never leaves a video unplayable.
  await rewriteStoredPlaybackId(playbackId, signedId);
  await db
    .insert(appSettings)
    .values({
      key: `${SWAP_SETTING_PREFIX}${playbackId}`,
      value: signedId,
      description: "Retired public Mux playback ID -> signed replacement",
    })
    .onConflictDoNothing();

  for (const p of asset.playback_ids ?? []) {
    if (p.policy === "public" && p.id) {
      try {
        await mux.video.assets.deletePlaybackId(assetId, p.id);
      } catch (err) {
        // Already deleted by a concurrent upgrade — fine.
        if (!isMuxNotFound(err)) throw err;
      }
    }
  }

  return signedId;
}

/**
 * Resolves a stored playback ID to a currently valid signed playback ID
 * plus fresh tokens. Public assets are upgraded to signed on first sight,
 * and IDs retired by an earlier upgrade are followed through the recorded
 * mapping (covers stale references that predate the swap).
 */
export async function resolveSignedPlayback(
  requestedId: string,
): Promise<{ playbackId: string; tokens: MuxPlaybackTokens }> {
  let currentId: string;
  try {
    currentId = await ensureSignedPlaybackId(requestedId);
  } catch (err) {
    if (!isMuxNotFound(err)) throw err;
    const [mapped] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, `${SWAP_SETTING_PREFIX}${requestedId}`))
      .limit(1);
    if (!mapped) throw err;
    currentId = mapped.value;
  }
  const tokens = await signPlaybackTokens(currentId);
  return { playbackId: currentId, tokens };
}
