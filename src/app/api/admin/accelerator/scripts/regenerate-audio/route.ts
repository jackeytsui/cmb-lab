import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { scriptLines } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import {
  resolveVoice,
  resolveCantoneseProvider,
  buildSSML,
  synthesizeSpeech,
  synthesizeSpeechElevenLabs,
} from "@/lib/tts";

export const maxDuration = 60;

type FieldName = "cantoneseAudioUrl" | "mandarinAudioUrl";

type ScriptLine = typeof scriptLines.$inferSelect;

/**
 * Synthesize one line of text with the shared provider policy.
 * Cantonese follows the same resolution as /api/tts (Azure zh-HK by default;
 * ElevenLabs only via explicit CANTONESE_TTS_PROVIDER=elevenlabs opt-in, with
 * Azure fallback because ElevenLabs failures are common). Mandarin: Azure.
 */
async function synthesizeLine(text: string, isCantonese: boolean): Promise<Buffer> {
  const useElevenLabs =
    isCantonese && resolveCantoneseProvider(process.env) === "elevenlabs";

  let primaryError: string | null = null;
  if (useElevenLabs) {
    try {
      return await synthesizeSpeechElevenLabs(text, "medium");
    } catch (err) {
      primaryError = err instanceof Error ? err.message : "ElevenLabs failed";
      console.warn("[regenerate-audio] ElevenLabs failed, falling back to Azure:", err);
    }
  }

  try {
    const { voiceName, lang } = resolveVoice(isCantonese ? "zh-HK" : "zh-CN");
    const ssml = buildSSML(text, voiceName, lang, "medium");
    return await synthesizeSpeech(ssml);
  } catch (err) {
    const azureError = err instanceof Error ? err.message : "Azure failed";
    console.error("[regenerate-audio] Azure failed:", err);
    throw new Error(
      primaryError
        ? `Both providers failed. ElevenLabs: ${primaryError}. Azure: ${azureError}`
        : azureError,
    );
  }
}

/** Regenerate one line's audio field: synthesize, upload, update the column. */
async function regenerateLine(line: ScriptLine, field: FieldName): Promise<string> {
  const isCantonese = field === "cantoneseAudioUrl";
  const text = (isCantonese ? line.cantoneseText : line.mandarinText)?.trim();
  if (!text) {
    throw new Error(
      `No ${isCantonese ? "Cantonese" : "Mandarin"} text to synthesize on this line`,
    );
  }

  const audio = await synthesizeLine(text, isCantonese);

  const pathname = `conversation-scripts/${line.scriptId}/${line.id}/regen-${isCantonese ? "yue" : "cmn"}-${Date.now()}.mp3`;
  // CMB Lab Blob store is private-only — public access fails with 400.
  const blob = await put(pathname, audio, {
    access: "private",
    contentType: "audio/mpeg",
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: true,
  });

  // Update just this one column on this line (non-destructive — does NOT touch
  // other lines or any text columns, so coach edits are preserved)
  await db
    .update(scriptLines)
    .set(isCantonese ? { cantoneseAudioUrl: blob.url } : { mandarinAudioUrl: blob.url })
    .where(eq(scriptLines.id, line.id));

  return blob.url;
}

/**
 * POST /api/admin/accelerator/scripts/regenerate-audio
 * Body: { lineId, field } — regenerate a single line's audio, OR
 *       { scriptId, field, overwriteUploads? } — bulk mode: regenerate the
 *       field for every line of the script that has text (purges stale/bad
 *       stored TTS audio, e.g. Cantonese generated while the wrong-accent
 *       ElevenLabs default was live).
 *
 * Bulk mode only replaces audio that is missing or was itself TTS-generated
 * (blob path contains "/regen-"). Human-recorded uploads keep their original
 * filenames and are left untouched unless overwriteUploads: true is passed —
 * good audio stays good.
 *
 * Regenerates audio from the stored text via TTS, uploads the MP3 to Vercel
 * Blob, and updates just the audio URL column(s). Coach+ only.
 */
export async function POST(req: NextRequest) {
  if (!(await hasMinimumRole("coach"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    lineId?: string;
    scriptId?: string;
    field?: FieldName;
    overwriteUploads?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { lineId, scriptId, field, overwriteUploads } = body;
  if (!field || (field !== "cantoneseAudioUrl" && field !== "mandarinAudioUrl")) {
    return NextResponse.json(
      { error: "field (cantoneseAudioUrl|mandarinAudioUrl) required" },
      { status: 400 },
    );
  }
  if (!lineId && !scriptId) {
    return NextResponse.json(
      { error: "lineId or scriptId required" },
      { status: 400 },
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage is not configured (BLOB_READ_WRITE_TOKEN missing)" },
      { status: 500 },
    );
  }

  // Single-line mode (existing behavior).
  if (lineId) {
    const line = await db.query.scriptLines.findFirst({
      where: eq(scriptLines.id, lineId),
    });
    if (!line) {
      return NextResponse.json({ error: "Line not found" }, { status: 404 });
    }
    try {
      const url = await regenerateLine(line, field);
      return NextResponse.json({ url });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // Bulk mode: every line of the script with text for this field.
  const lines = await db.query.scriptLines.findMany({
    where: eq(scriptLines.scriptId, scriptId!),
    orderBy: [asc(scriptLines.sortOrder)],
  });
  if (lines.length === 0) {
    return NextResponse.json({ error: "Script has no lines" }, { status: 404 });
  }

  const isCantonese = field === "cantoneseAudioUrl";
  const results: Array<{ lineId: string; url?: string; error?: string }> = [];
  let skippedUploads = 0;
  // Sequential on purpose: keeps provider rate limits happy and failure
  // attribution obvious. A typical script (~10-30 lines) finishes well within
  // maxDuration; the endpoint is idempotent, so a partial run can be re-run.
  for (const line of lines) {
    const text = (isCantonese ? line.cantoneseText : line.mandarinText)?.trim();
    if (!text) continue; // nothing to synthesize for this line
    const currentUrl = isCantonese ? line.cantoneseAudioUrl : line.mandarinAudioUrl;
    const isHumanUpload = Boolean(currentUrl) && !currentUrl!.includes("/regen-");
    if (isHumanUpload && !overwriteUploads) {
      skippedUploads++;
      continue; // keep human recordings untouched
    }
    try {
      const url = await regenerateLine(line, field);
      results.push({ lineId: line.id, url });
    } catch (err) {
      results.push({
        lineId: line.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const failed = results.filter((r) => r.error);
  return NextResponse.json({
    regenerated: results.length - failed.length,
    failed: failed.length,
    skippedUploads,
    results,
  });
}
