# VideoAsk → Vocal Hack migration

Migrate your VideoAsk "Video Asks" (forms) into CMB Lab as **Vocal Hack**
lessons — one by one, in order. Each VideoAsk becomes one Vocal Hack lesson;
each video step in the VideoAsk becomes one sentence (the coach demonstration
video the student imitates). Any welcome/instruction/thank-you steps become the
lesson's instructions.

The flow is deliberately two-stage — **scrape → review → import** — the same
pattern as the GHL course migration (`scripts/ghl-scrape-course.ts`). Stage 1
never touches CMB Lab; stage 2 writes into a **draft** course you can review
before publishing.

```
VideoAsk  ──(1) migrate──▶  scripts/scraped-videoask/*.json  ──(2) import──▶  CMB Lab
          scrape + mirror        (review / fill Chinese)          draft Vocal Hack lessons
```

---

## What maps to what

| VideoAsk              | CMB Lab (Vocal Hack)                                   |
| --------------------- | ------------------------------------------------------ |
| A form ("Video Ask")  | One `vocal_hack` lesson                                 |
| A video step          | One sentence (`videoUrl` = the coach video)            |
| The step's caption    | The sentence's `chinese` (if it contains 中文)          |
| Text / welcome steps  | The lesson `description` (instructions)                |
| —                     | `pinyin` — auto-generated from `chinese` at import      |
| —                     | `english` — left blank; auto-fills in the lesson editor |

**Chinese text.** If the coach typed the sentence into a step's title/caption,
it's pulled automatically. If the sentence is only spoken on camera, that
sentence is flagged `"needsChinese": true` and left blank for you to fill in
during review. Either way the video is captured.

---

## Prerequisites

Put these in `.env.local` (never commit them):

| Variable | Needed for | Notes |
| --- | --- | --- |
| `VIDEOASK_API_KEY` **or** `VIDEOASK_CLIENT_ID` + `VIDEOASK_CLIENT_SECRET` + `VIDEOASK_REFRESH_TOKEN` | Stage 1 (API mode) | Same credentials the VideoAsk MCP uses. Ask Sheldon through a secure channel. |
| `BLOB_READ_WRITE_TOKEN` | Stage 1 (mirroring videos) | Vercel Blob token; videos are stored **private**. Skip with `--skip-videos`. |
| `DATABASE_URL` | Stage 2 (import) | Same Neon URL the app uses. |

> The scripts run locally (not in the deployed app) because mirroring many large
> videos would exceed serverless timeouts, and the credentials are per-operator.

---

## Stage 1 — scrape, mirror videos, normalize

List your forms to find their ids:

```bash
npm run videoask:list
# 6f1c…  Vocal Hack — Greetings
# 9a2d…  Vocal Hack — Tones
```

Migrate specific forms (in the order you pass them):

```bash
npm run videoask:migrate -- --forms 6f1c…,9a2d…
# or everything:
npm run videoask:migrate -- --all
```

This writes one JSON file per form into `scripts/scraped-videoask/`, mirrors
each step video into private Vercel Blob, and prints a summary. Useful flags:

| Flag | Effect |
| --- | --- |
| `--skip-videos` | Map only, don't mirror (fast dry run). |
| `--limit-videos N` | Stop after mirroring N videos (testing). |
| `--out <dir>` | Change the output directory. |
| `--from-json <dir>` | Use MCP exports instead of the API (see below). |

### Alternative: pull through the VideoAsk MCP instead of the API

If you'd rather use the read-only VideoAsk MCP from Claude Code / Codex (e.g.
you don't want the API credentials on your laptop), call `get_form` for each
form and save each result as a `.json` file in an input folder, then:

```bash
npm run videoask:migrate -- --from-json ./videoask-input --skip-videos
```

Each file should be the object `get_form` returns (it has a `form` and
`questions`/`raw_questions`). Video mirroring still needs `BLOB_READ_WRITE_TOKEN`
unless you pass `--skip-videos`.

---

## Review

Open the files in `scripts/scraped-videoask/`. Each is a ready-to-import Vocal
Hack lesson. Fix anything flagged:

- `"needsChinese": true` → type the Chinese sentence into that sentence's
  `chinese` field.
- `"needsVideo": true` → the step had no downloadable video; check `shareUrl`.

`index.json` lists every lesson and whether it still needs review. Lessons with
`"needsReview": true` are **skipped by default** at import so you never publish
half-blank sentences.

---

## Stage 2 — import into CMB Lab

Preview first (no database writes, no credentials needed):

```bash
npm run videoask:import -- --dry-run
```

Then import for real. By default this **creates a new draft course** with a
"Vocal Hacks" module and inserts the lessons in order:

```bash
npm run videoask:import
```

pinyin is generated from each sentence's Chinese using the same
jieba + tone-sandhi pipeline as the lesson editor (你好 → `nǐ hǎo`). English is
left blank and auto-fills when you open the lesson in the editor.

Useful flags:

| Flag | Effect |
| --- | --- |
| `--course <id>` | Import into an existing course instead of a new one. |
| `--module <id>` | Import into an existing module. |
| `--course-title <s>` / `--module-title <s>` | Names for the created course/module. |
| `--canto` | Import as `vocal_hack_canto` (jyutping instead of pinyin). |
| `--allow-incomplete` | Import lessons still flagged `needsReview`. |
| `--dry-run` | Print the plan; write nothing. |

After importing, review at `/admin/course-library/<courseId>`. The course stays
a **draft** until you publish it, so nothing is student-visible until you're
ready. Coach videos are stored private and streamed through the same
authenticated proxy as native Vocal Hack lessons.

---

## Re-running is safe-ish

- **Stage 1** caches mirrored videos in `<formId>.videos.json`, so re-running
  won't re-upload videos it already mirrored.
- **Stage 2** inserts lessons; running it twice against the same module creates
  duplicates. Import into a fresh draft course (the default) or delete the
  previous import first.

---

## Files

| File | Role |
| --- | --- |
| `src/lib/videoask-mapping.ts` | Pure form → Vocal Hack normalization (unit-tested). |
| `src/lib/__tests__/videoask-mapping.test.ts` | Mapping tests. |
| `scripts/videoask-client.ts` | Read-only VideoAsk REST client (ports `videoask_client.py`). |
| `scripts/videoask-migrate.ts` | Stage 1: scrape + mirror + normalize. |
| `scripts/videoask-import.ts` | Stage 2: import normalized JSON → Course Library. |
