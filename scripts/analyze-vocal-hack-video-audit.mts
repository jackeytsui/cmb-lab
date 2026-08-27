import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { config as loadEnv } from "dotenv";
import { pinyin } from "pinyin-pro";
import ToJyutping from "to-jyutping";

type LessonRow = {
  sentence_id: string;
  lesson_id: string;
  lesson_title: string;
  course_id: string;
  course_title: string;
  language: "mandarin" | "cantonese";
  sort_order: number;
  chinese: string;
  pinyin: string;
  english: string;
  staged_chinese: string | null;
  staged_transcript: string | null;
};

type TranscriptRow = {
  sentenceId: string;
  transcript?: string;
};

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function normalizeChinese(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[裏裡]/gu, "里")
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, "");
}

function normalizeRomanisation(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function deriveRomanisation(
  text: string,
  language: "mandarin" | "cantonese",
) {
  const hanRuns = text.match(/\p{Script=Han}+/gu);
  if (!hanRuns) return "";
  return hanRuns
    .flatMap((run) => {
      if (language === "cantonese") {
        return (
          ToJyutping.getJyutpingList(run)?.flatMap(([, jyutping]) =>
            jyutping ? [jyutping] : [],
          ) ?? []
        );
      }
      return pinyin(run, { toneType: "symbol", type: "array" });
    })
    .join(" ")
    .trim();
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

const envPath = argument("--env");
if (envPath) loadEnv({ path: envPath, quiet: true });
const transcriptPath =
  argument("--transcripts") ||
  "/tmp/cmb-vocal-hack-video-audit-2026-08-27.jsonl";
if (!existsSync(transcriptPath)) {
  throw new Error(`Transcript audit not found: ${transcriptPath}`);
}

const transcripts = new Map<string, string>();
for (const line of readFileSync(transcriptPath, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const record = JSON.parse(line) as TranscriptRow;
  if (record.sentenceId && record.transcript) {
    transcripts.set(record.sentenceId, record.transcript);
  }
}
const secondTranscripts = new Map<string, string>();
const secondTranscriptPath = argument("--second-transcripts");
if (secondTranscriptPath && existsSync(secondTranscriptPath)) {
  for (const line of readFileSync(secondTranscriptPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as TranscriptRow;
    if (record.sentenceId && record.transcript) {
      secondTranscripts.set(record.sentenceId, record.transcript);
    }
  }
}

const sql = neon(requiredEnv("DATABASE_URL"));
const rows = (await sql.query(
  `
    SELECT
      sentence.item ->> 'id' AS sentence_id,
      lesson.id::text AS lesson_id,
      lesson.title AS lesson_title,
      course.id::text AS course_id,
      course.title AS course_title,
      CASE
        WHEN lesson.lesson_type::text = 'vocal_hack_canto' THEN 'cantonese'
        ELSE 'mandarin'
      END AS language,
      COALESCE((sentence.item ->> 'order')::integer, sentence.ordinality::integer - 1) AS sort_order,
      COALESCE(sentence.item ->> 'chinese', '') AS chinese,
      COALESCE(sentence.item ->> 'pinyin', '') AS pinyin,
      COALESCE(sentence.item ->> 'english', '') AS english
      , staged.chinese AS staged_chinese
      , staged.ai_transcript AS staged_transcript
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
)) as LessonRow[];

const comparisons = rows.map((row) => {
  const transcript = transcripts.get(row.sentence_id) || "";
  const secondTranscript = secondTranscripts.get(row.sentence_id) || "";
  const displayed = normalizeChinese(row.chinese);
  const spoken = normalizeChinese(transcript);
  const secondSpoken = normalizeChinese(secondTranscript);
  const distance = levenshtein(displayed, spoken);
  const differenceRatio = distance / Math.max(1, displayed.length, spoken.length);
  const derivedRomanisation = deriveRomanisation(row.chinese, row.language);
  const hanCount = [...row.chinese].filter((char) =>
    /\p{Script=Han}/u.test(char),
  ).length;
  const syllableCount = row.pinyin.trim()
    ? row.pinyin.trim().split(/\s+/).length
    : 0;
  return {
    ...row,
    transcript,
    secondTranscript,
    normalizedDisplayed: displayed,
    normalizedTranscript: spoken,
    normalizedSecondTranscript: secondSpoken,
    independentTranscriptsAgree:
      Boolean(spoken) && Boolean(secondSpoken) && spoken === secondSpoken,
    originalTranscriptAgrees:
      Boolean(spoken) &&
      normalizeChinese(row.staged_transcript || "") === spoken,
    distance,
    differenceRatio,
    romanisationMatchesGenerator:
      normalizeRomanisation(row.pinyin) ===
      normalizeRomanisation(derivedRomanisation),
    derivedRomanisation,
    hanCount,
    syllableCount,
  };
});
const debugId = argument("--debug-id");
if (debugId) {
  console.log(
    JSON.stringify(comparisons.find((row) => row.sentence_id === debugId), null, 2),
  );
}

const candidates = comparisons.filter(
  (row) => !row.transcript || row.normalizedDisplayed !== row.normalizedTranscript,
);
const highRisk = comparisons.filter(
  (row) => !row.transcript || row.differenceRatio > 0.12,
);
const romanisationDrift = comparisons.filter(
  (row) => row.language === "mandarin" && !row.romanisationMatchesGenerator,
);
const syllableAlignmentDrift = comparisons.filter(
  (row) => row.hanCount !== row.syllableCount,
);
const output = argument("--output") || "/tmp/cmb-vocal-hack-video-review.json";
writeFileSync(
  output,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      summary: {
        rows: rows.length,
        transcripts: transcripts.size,
        exactVideoMatches: comparisons.length - candidates.length,
        videoTextCandidates: candidates.length,
        highRiskVideoTextCandidates: highRisk.length,
        mandarinRomanisationDrift: romanisationDrift.length,
        syllableAlignmentDrift: syllableAlignmentDrift.length,
      },
      candidates,
      romanisationDrift,
      syllableAlignmentDrift,
    },
    null,
    2,
  )}\n`,
);
console.log(
  JSON.stringify(
    {
      output,
      rows: rows.length,
      transcripts: transcripts.size,
      exactVideoMatches: comparisons.length - candidates.length,
      videoTextCandidates: candidates.length,
      highRiskVideoTextCandidates: highRisk.length,
      mandarinRomanisationDrift: romanisationDrift.length,
      syllableAlignmentDrift: syllableAlignmentDrift.length,
    },
    null,
    2,
  ),
);
