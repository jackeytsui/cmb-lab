/**
 * GHL Course Scraper — one-shot migration helper
 *
 * Reads courses from a GHL sub-account by mimicking the logged-in admin UI,
 * mirrors the videos to Vercel Blob, and writes a normalized JSON file per
 * course that the /admin/course-library/import-from-ghl admin page can then
 * import into Course Library.
 *
 * Why a local script and not a Next.js route:
 *   - Auth is cookie + custom `token-id` header copied from a logged-in
 *     DevTools session. That's per-user and short-lived; no place for it in
 *     the deployed app.
 *   - Mirroring 400+ videos per course (~30GB) would blow past Vercel
 *     serverless function timeouts and memory. Runs cleanly from a laptop.
 *
 * Usage:
 *   npx tsx scripts/ghl-scrape-course.ts \
 *     --products f0d58583-...,dabccdf2-...,f1fd89bf-... \
 *     [--location JOdDwlRF2K16cnIYW9Er] \
 *     [--skip-videos] \
 *     [--limit-videos N]
 *
 * Required env vars (in .env.local):
 *   GHL_COOKIE            The full cookie: value from DevTools -> Network ->
 *                         any backend.leadconnectorhq.com request -> Headers.
 *   GHL_TOKEN_ID          The token-id: header value from the same place.
 *                         Some endpoints (the smart-list one) need it;
 *                         others only need cookies. We send both on every
 *                         request to cover all cases.
 *   BLOB_READ_WRITE_TOKEN Vercel Blob token (skip if --skip-videos).
 *
 * How to get GHL_COOKIE and GHL_TOKEN_ID:
 *   1. Log into https://app.gohighlevel.com as a sub-account admin.
 *   2. Open DevTools -> Network, filter "leadconnectorhq".
 *   3. Click any backend.leadconnectorhq.com request.
 *   4. Headers tab -> Request Headers.
 *   5. Copy the entire cookie: value          -> GHL_COOKIE
 *   6. Find a request whose headers include token-id: (the smart-list
 *      offers-products call has one) and copy it -> GHL_TOKEN_ID
 */

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import { put } from "@vercel/blob";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// GHL response types (only fields we actually use)
// ---------------------------------------------------------------------------

interface GhlProduct {
  id: string;
  locationId: string;
  title: string;
  description: string | null;
  posterImage: string | null;
  customizations?: {
    instructorHeading?: string | null;
    instructorName?: string | null;
    instructorHeadshot?: string | null;
    instructorBio?: string | null;
  } | null;
}

interface GhlVideo {
  id: string;
  url: string;
  title: string | null;
  thumbnail: string | null;
  videoFormats?: string[];
  transcodingStatus?: string;
}

interface GhlPost {
  id: string;
  title: string;
  description: string | null;
  categoryId: string;
  visibility: "published" | "draft";
  sequenceNo: number;
  contentType: "video" | "audio" | "assignment" | "quiz";
  productId: string;
  posterImage: string | null;
  video: GhlVideo | null;
}

interface GhlCategory {
  id: string;
  parentCategory: string | null;
  title: string;
  description: string | null;
  visibility: "published" | "draft";
  sequenceNo: number;
  productId: string;
  posts?: GhlPost[];
}

// ---------------------------------------------------------------------------
// Normalized output types — match Course Library schema
// ---------------------------------------------------------------------------

type NormalizedLessonContent =
  | { videoUrl: string; description?: string; posterUrl?: string; thumbnailUrl?: string }
  | { body: string; thumbnailUrl?: string }
  | { passingScore: number; questions: [] }
  | { fileUrl: string; fileName: string; sizeBytes: number };

interface NormalizedLesson {
  title: string;
  lessonType: "video" | "text" | "quiz" | "download";
  sortOrder: number;
  content: NormalizedLessonContent;
  ghlPostId: string;
  ghlContentType: GhlPost["contentType"];
}

interface NormalizedModule {
  title: string;
  sortOrder: number;
  lessons: NormalizedLesson[];
  ghlCategoryId: string;
}

interface NormalizedCourseStats {
  totalModules: number;
  totalLessons: number;
  videoLessons: number;
  textLessons: number;
  quizLessons: number;
  downloadLessons: number;
  videosMirrored: number;
  videosFailed: number;
  videosSkippedNoUrl: number;
}

interface NormalizedCourse {
  ghlProductId: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  instructor: {
    name: string | null;
    headshot: string | null;
    bio: string | null;
  };
  modules: NormalizedModule[];
  stats: NormalizedCourseStats;
  scrapedAt: string;
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const USAGE = `
Usage: npx tsx scripts/ghl-scrape-course.ts \\
  --products <id1,id2,id3> \\
  [--location <locationId>] \\
  [--skip-videos] \\
  [--limit-videos N]

Required env (.env.local):
  GHL_COOKIE              Full cookie header value from a logged-in GHL session
  GHL_TOKEN_ID            token-id header value from a backend.leadconnectorhq request
  BLOB_READ_WRITE_TOKEN   Vercel Blob token (required unless --skip-videos)
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(USAGE);
  process.exit(0);
}

const LOCATION_ID =
  (args.location as string | undefined) ?? "JOdDwlRF2K16cnIYW9Er";
const PRODUCT_IDS = ((args.products as string | undefined) ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SKIP_VIDEOS = !!args["skip-videos"];
const LIMIT_VIDEOS = args["limit-videos"]
  ? parseInt(args["limit-videos"] as string, 10)
  : Infinity;

if (PRODUCT_IDS.length === 0) {
  console.error("Error: --products is required\n");
  console.error(USAGE);
  process.exit(1);
}

const GHL_COOKIE = process.env.GHL_COOKIE;
const GHL_TOKEN_ID = process.env.GHL_TOKEN_ID;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!GHL_COOKIE || !GHL_TOKEN_ID) {
  console.error(
    "Error: GHL_COOKIE and GHL_TOKEN_ID must be set in .env.local\n",
  );
  console.error(USAGE);
  process.exit(1);
}
if (!SKIP_VIDEOS && !BLOB_TOKEN) {
  console.error(
    "Error: BLOB_READ_WRITE_TOKEN is required (or pass --skip-videos)\n",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// GHL fetch helper
// ---------------------------------------------------------------------------

const GHL_BASE = "https://backend.leadconnectorhq.com";

const COMMON_HEADERS: Record<string, string> = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  channel: "APP",
  origin: "https://app.gohighlevel.com",
  referer: "https://app.gohighlevel.com/",
  source: "WEB_USER",
  sourceid: LOCATION_ID,
  version: "2021-07-28",
  cookie: GHL_COOKIE,
  "token-id": GHL_TOKEN_ID,
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
};

async function ghlFetch<T>(pathname: string): Promise<T> {
  const url = `${GHL_BASE}${pathname}`;
  const resp = await fetch(url, { headers: COMMON_HEADERS });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(
      `GHL ${resp.status} ${pathname}: ${body.slice(0, 300)}`,
    );
  }
  return (await resp.json()) as T;
}

async function fetchProduct(productId: string): Promise<GhlProduct> {
  return ghlFetch<GhlProduct>(
    `/membership/locations/${LOCATION_ID}/products/${productId}`,
  );
}

async function fetchCategories(productId: string): Promise<GhlCategory[]> {
  return ghlFetch<GhlCategory[]>(
    `/membership/locations/${LOCATION_ID}/categories` +
      `?product_id=${productId}&posts=true`,
  );
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function mapPostToLesson(
  post: GhlPost,
  sortOrder: number,
  subCategoryPrefix: string | null,
): NormalizedLesson {
  const title = subCategoryPrefix
    ? `${subCategoryPrefix} — ${post.title}`
    : post.title;

  let lessonType: NormalizedLesson["lessonType"];
  let content: NormalizedLessonContent;

  switch (post.contentType) {
    case "video": {
      const videoUrl = post.video?.url ?? "";
      content = {
        videoUrl,
        description: post.description ?? undefined,
        posterUrl: post.posterImage ?? undefined,
        thumbnailUrl: post.posterImage ?? undefined,
      };
      lessonType = "video";
      break;
    }
    case "audio":
    case "assignment": {
      // Course Library has no audio type. Assignments are text-with-HTML in
      // GHL already. Both map cleanly to text lessons whose body holds the
      // rich description. Any attached audio file needs a separate migration
      // pass; for now the description is the whole lesson.
      content = { body: post.description ?? "" };
      lessonType = "text";
      break;
    }
    case "quiz": {
      // Quiz questions live behind a different GHL endpoint that we haven't
      // wired up. Create an empty quiz shell — admin rebuilds in QuizBuilder.
      content = { passingScore: 70, questions: [] };
      lessonType = "quiz";
      break;
    }
    default: {
      content = { body: post.description ?? "" };
      lessonType = "text";
    }
  }

  return {
    title,
    lessonType,
    sortOrder,
    content,
    ghlPostId: post.id,
    ghlContentType: post.contentType,
  };
}

function normalizeCourse(
  product: GhlProduct,
  rawCategories: GhlCategory[],
): NormalizedCourse {
  // Published-only, per user's decision.
  const pubCats = rawCategories.filter((c) => c.visibility === "published");

  const topLevel = pubCats
    .filter((c) => c.parentCategory === null)
    .sort((a, b) => a.sequenceNo - b.sequenceNo);

  const modules: NormalizedModule[] = [];
  let moduleIdx = 0;

  for (const chapter of topLevel) {
    const lessons: NormalizedLesson[] = [];

    // 1) Posts directly under the chapter
    const directPosts = (chapter.posts ?? [])
      .filter((p) => p.visibility === "published")
      .sort((a, b) => a.sequenceNo - b.sequenceNo);
    for (const post of directPosts) {
      lessons.push(mapPostToLesson(post, lessons.length, null));
    }

    // 2) Posts from published sub-categories under this chapter, with the
    //    sub-category title prefixed onto each lesson title.
    const subCats = pubCats
      .filter((c) => c.parentCategory === chapter.id)
      .sort((a, b) => a.sequenceNo - b.sequenceNo);
    for (const sub of subCats) {
      const subPosts = (sub.posts ?? [])
        .filter((p) => p.visibility === "published")
        .sort((a, b) => a.sequenceNo - b.sequenceNo);
      for (const post of subPosts) {
        lessons.push(mapPostToLesson(post, lessons.length, sub.title));
      }
    }

    if (lessons.length === 0) continue; // skip empty chapters

    modules.push({
      title: chapter.title,
      sortOrder: moduleIdx++,
      lessons,
      ghlCategoryId: chapter.id,
    });
  }

  const stats: NormalizedCourseStats = {
    totalModules: modules.length,
    totalLessons: 0,
    videoLessons: 0,
    textLessons: 0,
    quizLessons: 0,
    downloadLessons: 0,
    videosMirrored: 0,
    videosFailed: 0,
    videosSkippedNoUrl: 0,
  };
  for (const m of modules) {
    for (const l of m.lessons) {
      stats.totalLessons++;
      if (l.lessonType === "video") stats.videoLessons++;
      else if (l.lessonType === "text") stats.textLessons++;
      else if (l.lessonType === "quiz") stats.quizLessons++;
      else if (l.lessonType === "download") stats.downloadLessons++;
    }
  }

  return {
    ghlProductId: product.id,
    title: product.title.trim(),
    summary: product.description ?? "",
    coverImageUrl: product.posterImage ?? null,
    instructor: {
      name: product.customizations?.instructorName ?? null,
      headshot: product.customizations?.instructorHeadshot ?? null,
      bio: product.customizations?.instructorBio ?? null,
    },
    modules,
    stats,
    scrapedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Video mirroring
// ---------------------------------------------------------------------------

interface VideoManifestEntry {
  blobUrl: string;
  sourceUrl: string;
  sizeBytes: number;
  mirroredAt: string;
}
type VideoManifest = Record<string, VideoManifestEntry>;

async function loadManifest(filePath: string): Promise<VideoManifest> {
  try {
    const text = await readFile(filePath, "utf8");
    return JSON.parse(text) as VideoManifest;
  } catch {
    return {};
  }
}

async function saveManifest(
  filePath: string,
  manifest: VideoManifest,
): Promise<void> {
  await writeFile(filePath, JSON.stringify(manifest, null, 2));
}

/**
 * GHL video URLs come in two shapes:
 *   - Absolute https://storage.googleapis.com/revex-membership-production/...
 *   - Relative /memberships/{locationId}/videos/cts-*.mp4
 * Resolve the relative case to the known public GCS bucket.
 */
function resolveGhlVideoUrl(rawUrl: string): string {
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  if (rawUrl.startsWith("/")) {
    return `https://storage.googleapis.com/revex-membership-production${rawUrl}`;
  }
  return rawUrl;
}

async function mirrorVideoToBlob(
  ghlUrl: string,
  productId: string,
  ghlPostId: string,
): Promise<{ blobUrl: string; sizeBytes: number }> {
  const absUrl = resolveGhlVideoUrl(ghlUrl);
  const resp = await fetch(absUrl);
  if (!resp.ok || !resp.body) {
    throw new Error(`GCS ${resp.status} ${absUrl}`);
  }
  const sizeBytes = Number(resp.headers.get("content-length") ?? "0");
  const pathname = `course-library/video/ghl-migration/${productId}/${ghlPostId}.mp4`;
  // Store is configured private-only (see memory: feedback_blob_always_private).
  // Matches the existing src/app/api/admin/course-library/upload/route.ts pattern.
  const blob = await put(pathname, resp.body, {
    access: "private",
    addRandomSuffix: true,
    contentType: "video/mp4",
    token: BLOB_TOKEN!,
  });
  return { blobUrl: blob.url, sizeBytes };
}

async function mirrorCourseVideos(
  course: NormalizedCourse,
  manifestPath: string,
): Promise<void> {
  const manifest = await loadManifest(manifestPath);
  let videoIdx = 0;

  for (const mod of course.modules) {
    for (const lesson of mod.lessons) {
      if (lesson.lessonType !== "video") continue;
      const content = lesson.content as { videoUrl: string };
      if (!content.videoUrl) {
        course.stats.videosSkippedNoUrl++;
        console.log(`    [skip-no-url] ${lesson.title}`);
        continue;
      }

      videoIdx++;
      if (videoIdx > LIMIT_VIDEOS) {
        console.log(
          `    [limit] --limit-videos=${LIMIT_VIDEOS} reached, stopping`,
        );
        return;
      }

      const cached = manifest[lesson.ghlPostId];
      if (cached) {
        content.videoUrl = cached.blobUrl;
        course.stats.videosMirrored++;
        console.log(
          `    [cached ${videoIdx}] ${lesson.title} -> already mirrored`,
        );
        continue;
      }

      try {
        process.stdout.write(
          `    [upload ${videoIdx}] ${lesson.title} ... `,
        );
        const { blobUrl, sizeBytes } = await mirrorVideoToBlob(
          content.videoUrl,
          course.ghlProductId,
          lesson.ghlPostId,
        );
        manifest[lesson.ghlPostId] = {
          blobUrl,
          sourceUrl: content.videoUrl,
          sizeBytes,
          mirroredAt: new Date().toISOString(),
        };
        content.videoUrl = blobUrl;
        course.stats.videosMirrored++;
        await saveManifest(manifestPath, manifest);
        console.log(`ok (${(sizeBytes / 1024 / 1024).toFixed(1)}MB)`);
      } catch (err) {
        course.stats.videosFailed++;
        console.log(`FAIL: ${(err as Error).message}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const outDir = path.join(process.cwd(), "scripts", "scraped-ghl");
  await mkdir(outDir, { recursive: true });

  console.log(
    `Scraping ${PRODUCT_IDS.length} product(s) from location ${LOCATION_ID}`,
  );
  console.log(
    `Options: skip-videos=${SKIP_VIDEOS} limit-videos=${LIMIT_VIDEOS}`,
  );

  let anyFailed = false;

  for (const productId of PRODUCT_IDS) {
    console.log(`\n=== ${productId} ===`);
    try {
      const [product, categories] = await Promise.all([
        fetchProduct(productId),
        fetchCategories(productId),
      ]);
      console.log(`  title: ${product.title.trim()}`);
      console.log(
        `  raw categories: ${categories.length} ` +
          `(${categories.filter((c) => c.visibility === "published").length} published)`,
      );

      const course = normalizeCourse(product, categories);
      console.log(
        `  normalized: ${course.stats.totalModules} modules, ` +
          `${course.stats.totalLessons} lessons ` +
          `(video=${course.stats.videoLessons}, text=${course.stats.textLessons}, quiz=${course.stats.quizLessons})`,
      );

      if (!SKIP_VIDEOS) {
        console.log(`  mirroring videos...`);
        const manifestPath = path.join(outDir, `${productId}.videos.json`);
        await mirrorCourseVideos(course, manifestPath);
        console.log(
          `  videos: mirrored=${course.stats.videosMirrored} failed=${course.stats.videosFailed} skipped=${course.stats.videosSkippedNoUrl}`,
        );
      } else {
        console.log(`  (--skip-videos: not mirroring)`);
      }

      const outPath = path.join(outDir, `${productId}.json`);
      await writeFile(outPath, JSON.stringify(course, null, 2));
      console.log(`  wrote ${path.relative(process.cwd(), outPath)}`);
    } catch (err) {
      anyFailed = true;
      console.error(`  FAILED: ${(err as Error).message}`);
    }
  }

  console.log("\nDone.");
  if (anyFailed) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
