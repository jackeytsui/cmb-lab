// ---------------------------------------------------------------------------
// VideoAsk → Vocal Hack mapping
//
// Pure, dependency-free normalization that turns a VideoAsk *form* (as returned
// by the read-only VideoAsk MCP `get_form` tool, or the raw VideoAsk REST API)
// into the Course Library **Vocal Hack** lesson content shape.
//
// Design decisions (confirmed with the team):
//   - 1 VideoAsk form  ==  1 Vocal Hack lesson.
//   - Each *video step* in the form  ==  1 sentence (the step's recorded media
//     is the coach demonstration video).
//   - Non-video steps (welcome / instructions / thank-you / questions) are
//     folded into the lesson `description`.
//   - Chinese text: pulled automatically from a step's title/text when it
//     contains Han characters; otherwise left blank and flagged
//     (`needsChinese`) so a human fills it in during review. This "handles
//     both" the typed-caption and spoken-only setups.
//   - pinyin / english are left blank here and generated at import time from
//     the Chinese (same jieba/tone-sandhi pipeline the lesson editor uses).
//
// VideoAsk's API shapes vary by account/version, so every field read here is
// defensive: we probe a list of candidate keys/paths rather than assuming one.
// This mirrors the `_pick_value` approach in the provided videoask_client.py.
// ---------------------------------------------------------------------------

/** A loose VideoAsk question/step object. We only trust `raw` and probe it. */
export interface VideoAskQuestion {
  id?: string | null;
  label?: string | null;
  type?: string | null;
  /** Full untouched question object from VideoAsk — the source of truth. */
  raw?: Record<string, unknown> | null;
}

/** A loose VideoAsk form header. */
export interface VideoAskForm {
  form_id?: string | null;
  id?: string | null;
  title?: string | null;
  name?: string | null;
  share_url?: string | null;
  url?: string | null;
  raw?: Record<string, unknown> | null;
}

/** One sentence in the normalized Vocal Hack lesson. */
export interface NormalizedVocalHackSentence {
  /** Stable id derived from the VideoAsk question id (falls back to index). */
  id: string;
  order: number;
  /**
   * Direct, downloadable media URL for the coach video. Populated by the
   * scraper after mirroring to Vercel Blob; before that it is the VideoAsk
   * source URL (or null when only a share link is available).
   */
  videoUrl: string | null;
  /** Original VideoAsk media URL (kept for auditing / re-mirroring). */
  sourceVideoUrl: string | null;
  /** VideoAsk share page for the step (fallback when no direct media URL). */
  shareUrl: string | null;
  /** Best-guess Chinese line (empty when none could be extracted). */
  chinese: string;
  /** Filled at import time from `chinese`. */
  pinyin: string;
  /** Filled at import time from `chinese` (optional). */
  english: string;
  /** True when we could not auto-extract Chinese and a human must add it. */
  needsChinese: boolean;
  /** True when the step looked like a video step but had no usable media URL. */
  needsVideo: boolean;
  /** Provenance. */
  videoaskQuestionId: string | null;
  questionType: string | null;
  rawLabel: string | null;
}

/** A whole VideoAsk form normalized to one Vocal Hack lesson. */
export interface NormalizedVocalHackLesson {
  videoaskFormId: string;
  title: string;
  shareUrl: string | null;
  /** Rich-text HTML instructions shown above the sentences. */
  description: string;
  sentences: NormalizedVocalHackSentence[];
  stats: {
    totalSteps: number;
    videoSteps: number;
    infoSteps: number;
    sentencesNeedingChinese: number;
    sentencesNeedingVideo: number;
  };
  /** True when any sentence needs Chinese or a video before it's publishable. */
  needsReview: boolean;
  scrapedAt: string | null;
}

// ---------------------------------------------------------------------------
// Field probing
// ---------------------------------------------------------------------------

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Read a nested value by a dotted path, tolerant of missing keys. */
function dig(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** First non-empty string found among the candidate paths. */
function pick(obj: unknown, paths: string[]): string | null {
  for (const p of paths) {
    const v = asString(dig(obj, p));
    if (v) return v;
  }
  return null;
}

const HAN_RE = /\p{Script=Han}/u;

/** True when the text contains at least one Han (Chinese) character. */
export function hasHan(text: string | null | undefined): boolean {
  return typeof text === "string" && HAN_RE.test(text);
}

const VIDEO_URL_PATHS = [
  "media_url",
  "video_url",
  "media.url",
  "media.media_url",
  "media.video_url",
  "media.download_url",
  "media.transcoded_url",
  "answer.media_url",
  "video.url",
  "thumbnail.video_url",
];

const SHARE_URL_PATHS = ["share_url", "url", "media.share_url", "public_url"];

const TEXT_PATHS = [
  "title",
  "label",
  "text",
  "question",
  "settings.title",
  "settings.text",
  "caption",
];

/** Extract a direct, downloadable coach-video URL from a raw question. */
export function extractQuestionVideoUrl(raw: unknown): string | null {
  const url = pick(raw, VIDEO_URL_PATHS);
  if (!url) return null;
  // Only accept http(s) media URLs; ignore blob:/data: and share pages here.
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

/** Extract the VideoAsk share-page URL for a step (fallback link). */
export function extractQuestionShareUrl(raw: unknown): string | null {
  return pick(raw, SHARE_URL_PATHS);
}

/** Extract the human-authored caption/title text for a step. */
export function extractQuestionText(raw: unknown): string | null {
  return pick(raw, TEXT_PATHS);
}

/** True when the step's declared type looks video-ish. */
function typeLooksVideo(type: string | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t.includes("video") || t.includes("wistia") || t.includes("record");
}

// ---------------------------------------------------------------------------
// Description building
// ---------------------------------------------------------------------------

const DEFAULT_DESCRIPTION =
  "<p>Watch the coach read each sentence, then record yourself imitating it as closely as you can.</p>";

/** Escape text for safe embedding inside the rich-text HTML description. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build the lesson description from the info (non-video) steps' text. Falls
 * back to the standard Vocal Hack instruction when there's nothing usable.
 */
export function buildDescription(infoTexts: string[]): string {
  const paras = infoTexts
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `<p>${escapeHtml(t)}</p>`);
  return paras.length > 0 ? paras.join("") : DEFAULT_DESCRIPTION;
}

// ---------------------------------------------------------------------------
// Form → Vocal Hack lesson
// ---------------------------------------------------------------------------

export interface NormalizeOptions {
  /** ISO timestamp to stamp on the result (scripts pass Date.now()). */
  scrapedAt?: string | null;
  /**
   * Treat *every* step (even ones with no direct media URL) as a sentence when
   * its type looks video-ish. Off by default: a video-typed step with no
   * downloadable URL becomes a `needsVideo` sentence so it isn't silently lost.
   */
}

/**
 * Normalize a VideoAsk form + its questions into a single Vocal Hack lesson.
 * `questions` should be in presentation order (VideoAsk returns them ordered).
 */
export function normalizeFormToVocalHack(
  form: VideoAskForm,
  questions: VideoAskQuestion[],
  opts: NormalizeOptions = {},
): NormalizedVocalHackLesson {
  const formId = asString(form.form_id) ?? asString(form.id) ?? "";
  const title =
    asString(form.title) ?? asString(form.name) ?? `VideoAsk ${formId}`;
  const shareUrl = asString(form.share_url) ?? asString(form.url);

  const sentences: NormalizedVocalHackSentence[] = [];
  const infoTexts: string[] = [];
  let videoSteps = 0;
  let infoSteps = 0;

  questions.forEach((q, idx) => {
    const raw = (q.raw ?? (q as unknown)) as Record<string, unknown>;
    const type = asString(q.type) ?? asString(dig(raw, "type"));
    const videoUrl = extractQuestionVideoUrl(raw);
    const shareStepUrl = extractQuestionShareUrl(raw);
    const text = asString(q.label) ?? extractQuestionText(raw);

    const isVideoStep = Boolean(videoUrl) || typeLooksVideo(type);

    if (!isVideoStep) {
      // Info step — fold its caption into the lesson description.
      infoSteps++;
      if (text) infoTexts.push(text);
      return;
    }

    videoSteps++;
    const qid =
      asString(q.id) ??
      asString(dig(raw, "question_id")) ??
      asString(dig(raw, "id")) ??
      asString(dig(raw, "uuid"));
    const chinese = hasHan(text) ? (text as string).trim() : "";

    sentences.push({
      id: qid ? `va-${qid}` : `va-step-${idx}`,
      order: sentences.length,
      videoUrl: videoUrl ?? null,
      sourceVideoUrl: videoUrl ?? null,
      shareUrl: shareStepUrl,
      chinese,
      pinyin: "",
      english: "",
      needsChinese: chinese === "",
      needsVideo: !videoUrl,
      videoaskQuestionId: qid,
      questionType: type,
      rawLabel: text,
    });
  });

  const sentencesNeedingChinese = sentences.filter((s) => s.needsChinese).length;
  const sentencesNeedingVideo = sentences.filter((s) => s.needsVideo).length;

  return {
    videoaskFormId: formId,
    title: title.trim(),
    shareUrl,
    description: buildDescription(infoTexts),
    sentences,
    stats: {
      totalSteps: questions.length,
      videoSteps,
      infoSteps,
      sentencesNeedingChinese,
      sentencesNeedingVideo,
    },
    needsReview: sentencesNeedingChinese > 0 || sentencesNeedingVideo > 0,
    scrapedAt: opts.scrapedAt ?? null,
  };
}

/**
 * The final content blob written to a `vocal_hack` course-library lesson.
 * Matches CourseLibraryVocalHackContent in db/schema/course-library.ts.
 */
export interface VocalHackLessonContent {
  description: string;
  sentences: Array<{
    id: string;
    order: number;
    videoUrl: string | null;
    chinese: string;
    pinyin: string;
    english: string;
  }>;
}

/**
 * Project a normalized lesson down to the exact `content` JSON stored on a
 * course-library lesson row. Drops the migration-only bookkeeping fields.
 */
export function toVocalHackContent(
  lesson: NormalizedVocalHackLesson,
): VocalHackLessonContent {
  return {
    description: lesson.description,
    sentences: lesson.sentences.map((s, idx) => ({
      id: s.id,
      order: idx,
      videoUrl: s.videoUrl,
      chinese: s.chinese.trim(),
      pinyin: s.pinyin.trim(),
      english: s.english.trim(),
    })),
  };
}
