import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { scriptLines } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import {
  resolveVoice,
  buildSSML,
  synthesizeSpeech,
  synthesizeSpeechElevenLabs,
} from "@/lib/tts";

export const maxDuration = 60;

type FieldName = "cantoneseAudioUrl" | "mandarinAudioUrl";

/**
 * POST /api/admin/accelerator/scripts/regenerate-audio
 * Body: { lineId: string, field: "cantoneseAudioUrl" | "mandarinAudioUrl" }
 *
 * Regenerates audio for a single conversation-script line using the stored text
 * via TTS, uploads the MP3 to Vercel Blob, and updates just that line's audio
 * URL column directly (no destructive bulk re-insert). Coach+ only.
 */
export async function POST(req: NextRequest) {
  if (!(await hasMinimumRole("coach"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { lineId?: string; field?: FieldName };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { lineId, field } = body;
  if (!lineId || !field || (field !== "cantoneseAudioUrl" && field !== "mandarinAudioUrl")) {
    return NextResponse.json(
      { error: "lineId and field (cantoneseAudioUrl|mandarinAudioUrl) required" },
      { status: 400 },
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage is not configured (BLOB_READ_WRITE_TOKEN missing)" },
      { status: 500 },
    );
  }

  // 1. Load the line
  const line = await db.query.scriptLines.findFirst({
    where: eq(scriptLines.id, lineId),
  });
  if (!line) {
    return NextResponse.json({ error: "Line not found" }, { status: 404 });
  }

  const isCantonese = field === "cantoneseAudioUrl";
  const text = (isCantonese ? line.cantoneseText : line.mandarinText)?.trim();
  if (!text) {
    return NextResponse.json(
      { error: `No ${isCantonese ? "Cantonese" : "Mandarin"} text to synthesize on this line` },
      { status: 400 },
    );
  }

  // 2. Synthesize. Cantonese: ElevenLabs (if configured) with Azure fallback;
  //    Mandarin: Azure direct. ElevenLabs failures are common (model/language
  //    combos, voice config drift, quota), so a fallback keeps the feature
  //    working — the regenerated audio just won't be the ElevenLabs voice.
  const hasElevenLabs = Boolean(
    process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_CANTONESE_VOICE_ID,
  );

  let audio: Buffer | null = null;
  let primaryError: string | null = null;

  if (isCantonese && hasElevenLabs) {
    try {
      audio = await synthesizeSpeechElevenLabs(text, "medium");
    } catch (err) {
      primaryError = err instanceof Error ? err.message : "ElevenLabs failed";
      console.warn("[regenerate-audio] ElevenLabs failed, falling back to Azure:", err);
    }
  }

  if (!audio) {
    try {
      const { voiceName, lang } = resolveVoice(isCantonese ? "zh-HK" : "zh-CN");
      const ssml = buildSSML(text, voiceName, lang, "medium");
      audio = await synthesizeSpeech(ssml);
    } catch (err) {
      const azureError = err instanceof Error ? err.message : "Azure failed";
      console.error("[regenerate-audio] Azure failed:", err);
      const combined = primaryError
        ? `Both providers failed. ElevenLabs: ${primaryError}. Azure: ${azureError}`
        : azureError;
      return NextResponse.json({ error: combined }, { status: 502 });
    }
  }

  // 3. Upload to Blob
  const pathname = `conversation-scripts/${line.scriptId}/${line.id}/regen-${isCantonese ? "yue" : "cmn"}-${Date.now()}.mp3`;
  let blobUrl: string;
  try {
    // CMB Lab Blob store is private-only — public access fails with 400.
    const blob = await put(pathname, audio, {
      access: "private",
      contentType: "audio/mpeg",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: true,
    });
    blobUrl = blob.url;
  } catch (err) {
    console.error("[regenerate-audio] Blob upload failure:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: `Failed to store generated audio: ${message}`,
        hint:
          message.toLowerCase().includes("token") || message.toLowerCase().includes("auth")
            ? "Check BLOB_READ_WRITE_TOKEN env var on Vercel"
            : message.toLowerCase().includes("access")
              ? "Vercel Blob store may be in private mode — see existing AdminScriptsClient pattern"
              : undefined,
      },
      { status: 502 },
    );
  }

  // 4. Update just this one column on this line (non-destructive — does NOT touch
  //    other lines or any text columns, so coach edits are preserved)
  await db
    .update(scriptLines)
    .set(isCantonese ? { cantoneseAudioUrl: blobUrl } : { mandarinAudioUrl: blobUrl })
    .where(eq(scriptLines.id, lineId));

  return NextResponse.json({ url: blobUrl });
}
