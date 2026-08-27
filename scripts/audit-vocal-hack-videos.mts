import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { config as loadEnv } from "dotenv";

type AuditRow = {
  sentence_id: string;
  lesson_id: string;
  lesson_title: string;
  course_id: string;
  course_title: string;
  course_status: string;
  language: "mandarin" | "cantonese";
  sort_order: number;
  video_url: string | null;
  chinese: string;
  pinyin: string;
  english: string;
  staged_chinese: string | null;
  staged_pinyin: string | null;
  staged_english: string | null;
  staged_transcript: string | null;
};

type TranscriptResult = {
  sentenceId: string;
  lessonId: string;
  courseId: string;
  language: AuditRow["language"];
  transcript?: string;
  error?: string;
};

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string) {
  return process.argv.includes(name);
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function extensionForContentType(contentType: string) {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("quicktime")) return "mov";
  if (contentType.includes("mpeg")) return "mp3";
  if (contentType.includes("wav")) return "wav";
  return "mp4";
}

function loadCompleted(path: string) {
  const completed = new Set<string>();
  if (!existsSync(path)) return completed;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as TranscriptResult;
      if (record.sentenceId && record.transcript) completed.add(record.sentenceId);
    } catch {
      // Preserve the usable part of a partial audit file after interruption.
    }
  }
  return completed;
}

async function transcribe(row: AuditRow, blobToken: string, apiKey: string) {
  if (!row.video_url) throw new Error("Coach video is missing");
  const mediaResponse = await fetch(row.video_url, {
    headers: { Authorization: `Bearer ${blobToken}` },
    signal: AbortSignal.timeout(45_000),
  });
  if (!mediaResponse.ok) {
    throw new Error(`Coach video returned ${mediaResponse.status}`);
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
    row.language === "cantonese"
      ? "請用繁體中文逐字準確轉寫教練說的廣東話。同一句重複示範時只寫一次；不要翻譯或改寫。"
      : "请用简体中文逐字准确转写教练说的普通话。同一句重复示范时只写一次；不要翻译或改写。",
  );

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(75_000),
  });
  const payload = (await response.json().catch(() => null)) as
    | { text?: string; error?: { message?: string } }
    | null;
  if (!response.ok || !payload?.text?.trim()) {
    throw new Error(
      payload?.error?.message || `Transcription returned ${response.status}`,
    );
  }
  return payload.text.trim();
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        await worker(items[index], index);
      }
    }),
  );
}

const envPath = argument("--env");
if (envPath) loadEnv({ path: envPath, quiet: true });

const sql = neon(requiredEnv("DATABASE_URL"));
const rows = (await sql.query(
  `
    SELECT
      sentence.item ->> 'id' AS sentence_id,
      lesson.id::text AS lesson_id,
      lesson.title AS lesson_title,
      course.id::text AS course_id,
      course.title AS course_title,
      course.status::text AS course_status,
      CASE
        WHEN lesson.lesson_type::text = 'vocal_hack_canto' THEN 'cantonese'
        ELSE 'mandarin'
      END AS language,
      COALESCE((sentence.item ->> 'order')::integer, sentence.ordinality::integer - 1) AS sort_order,
      NULLIF(sentence.item ->> 'videoUrl', '') AS video_url,
      COALESCE(sentence.item ->> 'chinese', '') AS chinese,
      COALESCE(sentence.item ->> 'pinyin', '') AS pinyin,
      COALESCE(sentence.item ->> 'english', '') AS english,
      staged.chinese AS staged_chinese,
      staged.pinyin AS staged_pinyin,
      staged.english AS staged_english,
      staged.ai_transcript AS staged_transcript
    FROM course_library_lessons AS lesson
    JOIN course_library_modules AS module ON module.id = lesson.module_id
    JOIN course_library_courses AS course ON course.id = module.course_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(lesson.content -> 'sentences') = 'array'
          THEN lesson.content -> 'sentences'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS sentence(item, ordinality)
    LEFT JOIN videoask_vocal_hack_placements AS placement
      ON placement.published_lesson_id = lesson.id
    LEFT JOIN videoask_vocal_hack_sentences AS staged
      ON staged.placement_id = placement.id
      AND staged.id::text = sentence.item ->> 'id'
    WHERE lesson.lesson_type::text IN ('vocal_hack', 'vocal_hack_canto')
      AND lesson.deleted_at IS NULL
      AND module.deleted_at IS NULL
      AND course.deleted_at IS NULL
    ORDER BY course.sort_order, module.sort_order, lesson.sort_order,
      COALESCE((sentence.item ->> 'order')::integer, sentence.ordinality::integer - 1)
  `,
)) as AuditRow[];

const inventory = {
  courses: new Set(rows.map((row) => row.course_id)).size,
  lessons: new Set(rows.map((row) => row.lesson_id)).size,
  sentences: rows.length,
  videos: rows.filter((row) => row.video_url).length,
  missingVideos: rows.filter((row) => !row.video_url).length,
  missingChinese: rows.filter((row) => !row.chinese.trim()).length,
  missingRomanisation: rows.filter((row) => !row.pinyin.trim()).length,
  missingEnglish: rows.filter((row) => !row.english.trim()).length,
  withoutStagingSource: rows.filter((row) => row.staged_chinese === null).length,
  liveStagingFieldDifferences: rows.filter(
    (row) =>
      row.staged_chinese !== null &&
      (row.chinese !== row.staged_chinese ||
        row.pinyin !== row.staged_pinyin ||
        row.english !== row.staged_english),
  ).length,
};
console.log(JSON.stringify(inventory, null, 2));

if (!flag("--transcribe")) process.exit(0);

const output = argument("--output") || "/tmp/cmb-vocal-hack-video-audit.jsonl";
const language = argument("--language");
const courseId = argument("--course");
const requestedLimit = Number(argument("--limit") || "0");
const concurrency = Math.max(1, Number(argument("--concurrency") || "8"));
const completed = loadCompleted(output);
let pending = rows.filter(
  (row) =>
    row.video_url &&
    !completed.has(row.sentence_id) &&
    (!language || row.language === language) &&
    (!courseId || row.course_id === courseId),
);
if (requestedLimit > 0) pending = pending.slice(0, requestedLimit);

const blobToken = requiredEnv("BLOB_READ_WRITE_TOKEN");
const apiKey = requiredEnv("OPENAI_API_KEY");
let succeeded = 0;
let failed = 0;
await runPool(pending, concurrency, async (row, index) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const transcript = await transcribe(row, blobToken, apiKey);
      appendFileSync(
        output,
        `${JSON.stringify({
          sentenceId: row.sentence_id,
          lessonId: row.lesson_id,
          courseId: row.course_id,
          language: row.language,
          transcript,
        } satisfies TranscriptResult)}\n`,
      );
      succeeded += 1;
      if ((succeeded + failed) % 25 === 0 || index === pending.length - 1) {
        console.log(
          `audited ${succeeded + failed}/${pending.length} (${succeeded} ok, ${failed} failed)`,
        );
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }
  failed += 1;
  appendFileSync(
    output,
    `${JSON.stringify({
      sentenceId: row.sentence_id,
      lessonId: row.lesson_id,
      courseId: row.course_id,
      language: row.language,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    } satisfies TranscriptResult)}\n`,
  );
  console.error(`failed ${row.sentence_id}: ${String(lastError)}`);
});

console.log(JSON.stringify({ output, requested: pending.length, succeeded, failed }));
