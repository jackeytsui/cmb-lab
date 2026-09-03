import "server-only";

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { convertScript } from "@/lib/chinese-convert";
import { smartRomanise } from "@/lib/romanise";

export type VocalHackLanguage = "mandarin" | "cantonese";

const cleanedTranscriptSchema = z.object({
  chinese: z
    .string()
    .describe("The single Chinese sentence spoken by the coach, without repetition"),
  english: z.string().describe("A concise natural English translation"),
});

function extensionForContentType(contentType: string) {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("quicktime")) return "mov";
  if (contentType.includes("mpeg")) return "mp3";
  if (contentType.includes("wav")) return "wav";
  return "mp4";
}

function hasHanCharacters(value: string) {
  return /\p{Script=Han}/u.test(value);
}

/**
 * Transcribe one coach sentence video and derive all editable Vocal Hack text.
 * Cantonese is explicitly normalized to Traditional Chinese; Mandarin is
 * normalized to Simplified Chinese. Romanisation is always derived from the
 * cleaned Chinese sentence so the rows cannot describe different phrases.
 */
export async function transcribeVocalHackVideo(input: {
  videoUrl: string;
  language: VocalHackLanguage;
  context: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!blobToken) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");

  const mediaResponse = await fetch(input.videoUrl, {
    headers: { Authorization: `Bearer ${blobToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!mediaResponse.ok) {
    throw new Error(`Could not read coach video (${mediaResponse.status})`);
  }
  const contentType =
    mediaResponse.headers.get("content-type")?.split(";", 1)[0] ??
    "video/mp4";
  const media = await mediaResponse.blob();
  const formData = new FormData();
  formData.append(
    "file",
    new File(
      [media],
      `coach-sentence.${extensionForContentType(contentType)}`,
      { type: contentType },
    ),
  );
  formData.append(
    "model",
    process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-transcribe",
  );
  formData.append("language", "zh");
  formData.append("response_format", "json");
  formData.append(
    "prompt",
    input.language === "cantonese"
      ? "請用繁體中文準確轉寫教練說的廣東話句子。同一句重複示範時，只寫一次。"
      : "请用简体中文准确转写教练说的普通话句子。同一句重复示范时，只写一次。",
  );

  const transcriptionResponse = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(50_000),
    },
  );
  const transcriptionPayload = (await transcriptionResponse
    .json()
    .catch(() => null)) as { text?: string; error?: { message?: string } } | null;
  if (!transcriptionResponse.ok || !transcriptionPayload?.text?.trim()) {
    throw new Error(
      transcriptionPayload?.error?.message ||
        `AI transcription failed (${transcriptionResponse.status})`,
    );
  }
  const rawTranscript = transcriptionPayload.text.trim();

  const languageLabel =
    input.language === "cantonese" ? "Cantonese" : "Mandarin";
  const scriptInstruction =
    input.language === "cantonese"
      ? "Use natural Traditional Chinese characters and Cantonese wording."
      : "Use natural Simplified Chinese characters and standard Mandarin wording.";
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: cleanedTranscriptSchema,
    system:
      `You clean transcripts for a Chinese pronunciation course. ` +
      `The clip demonstrates exactly one ${languageLabel} sentence, sometimes ` +
      `repeated twice. Keep one faithful copy of the taught sentence, remove ` +
      `fillers and duplicate repetitions, and translate it concisely. ` +
      scriptInstruction,
    prompt: `Course item: ${input.context}\nRaw transcript: ${rawTranscript}`,
  });
  const cleanedChinese = object.chinese.trim();
  const english = object.english.trim();
  if (!cleanedChinese || !hasHanCharacters(cleanedChinese)) {
    throw new Error("AI did not return a usable Chinese sentence");
  }
  const chinese = await convertScript(
    cleanedChinese,
    "original",
    input.language === "cantonese" ? "traditional" : "simplified",
  );

  return {
    rawTranscript,
    chinese,
    pinyin: smartRomanise(chinese, input.language),
    english,
  };
}
