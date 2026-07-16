# VideoAsk → CantoMando content migration toolkit

Move **creator/question videos + their transcript text** out of VideoAsk and into a
CantoMando course, **replacing** that course's existing content.

> ⚠️ **This is a destructive migration against a live LMS.** The "replace" is
> irreversible except by restoring the backup this toolkit produces. Read the
> whole runbook once before running anything. Every step is dry-run / gated by
> default.

## Why it's a pipeline, not one MCP call

- CantoMando does **not** store video files. It references **Mux** playback IDs.
  So VideoAsk videos must be re-hosted on Mux first.
- The course importer (`POST /api/admin/courses/[courseId]/import`) is
  **append-only** — it never deletes existing modules. "Replace" therefore = back
  up → archive existing → import new.
- The VideoAsk MCP is **read-only** (and lives on your Mac), so it only supplies
  the source data; it never writes to VideoAsk and never touches CantoMando.

Flow:

```
VideoAsk MCP (read)  ->  videoask-manifest.json
                         │
        step 1  ────────▶│  create Mux assets from each videoUrl  (fills muxPlaybackId)
        step 2  ────────▶│  build import-payload.json  (CantoMando import shape)
        step 3  ────────▶│  backup target course  (backups/course-<id>-<ts>.json)
        step 4  ────────▶│  archive existing modules/lessons  (DESTRUCTIVE, gated)
        step 5  ────────▶│  POST import (dryRun:true, then dryRun:false)
```

## Prerequisites (all on your Mac)

- The `videoask` MCP registered and healthy (see the setup you already did).
- `.env` in the repo root with `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `DATABASE_URL`.
  These already exist for the app — the scripts read the same `.env` via `dotenv`.
- An **admin** session/cookie for the running CantoMando app (the import endpoint
  requires the `admin` role).
- The **target course UUID** you intend to replace. Get it from the admin UI or:
  `SELECT id, title FROM courses WHERE deleted_at IS NULL;`

## Step 0 — Read VideoAsk and produce the manifest

Using your **local** Claude/Codex session (where the `videoask` MCP is loaded),
enumerate the forms and their creator/question videos, and write a
`videoask-manifest.json` next to these scripts following
[`manifest.example.json`](./manifest.example.json).

Map VideoAsk → manifest like this:

| Manifest field        | Source (from the read-only MCP)                                   |
| --------------------- | ----------------------------------------------------------------- |
| `modules[].title`     | The VideoAsk **form** title (one form → one module)               |
| `lessons[].title`     | The **question**/step title                                       |
| `lessons[].videoUrl`  | The question video's downloadable/transcoded media URL            |
| `lessons[].text`      | The question's transcript / caption / text                        |
| `lessons[].durationSeconds` | Optional; leave `null` — step 1 fills it from Mux           |
| `targetCourseId`      | The CantoMando course UUID you're replacing                       |

> The exact MCP tool/field names depend on your VideoAsk MCP build. Start with
> `list_forms` (limit 5) to confirm the shape, then expand. If you paste one real
> `list_forms` result + one form's detail back to me, I'll finalize an adapter so
> this step is scripted instead of manual.

Only **creator/question** videos are in scope here — not respondent answer videos.

## Step 1 — Ingest videos into Mux

```bash
node scripts/videoask-import/1-upload-to-mux.mjs ./videoask-manifest.json
```

Creates a Mux asset from each `videoUrl` (Mux pulls the file server-side), waits
for it to be `ready`, and writes `muxPlaybackId` / `muxAssetId` /
`durationSeconds` back into the manifest. Idempotent — re-run to resume.

## Step 2 — Build the CantoMando import payload

```bash
node scripts/videoask-import/2-build-import-json.mjs ./videoask-manifest.json ./import-payload.json
```

Pure transform into the importer's exact JSON shape. Fails if any video is still
missing its `muxPlaybackId`.

## Step 3 — Back up the target course (required)

```bash
node scripts/videoask-import/3-backup-course.mjs --course <COURSE_ID>
# -> backups/course-<COURSE_ID>-<timestamp>.json
```

Read-only snapshot of the course's current modules/lessons/attachments. **Step 4
refuses to run without a fresh, matching backup.**

## Step 4 — Archive existing content (DESTRUCTIVE, gated)

Dry-run first (no `--confirm` → nothing changes):

```bash
node scripts/videoask-import/4-archive-course-content.mjs \
  --course <COURSE_ID> --backup ./backups/course-<COURSE_ID>-<timestamp>.json
```

Then execute:

```bash
node scripts/videoask-import/4-archive-course-content.mjs \
  --course <COURSE_ID> --backup ./backups/course-<COURSE_ID>-<timestamp>.json --confirm
```

Soft-deletes (sets `deleted_at`) every current module/lesson of that course.
Guards: backup must match this course, counts must match live data, backup must
be < 24h old.

## Step 5 — Import the new content

Dry-run (the endpoint defaults to `dryRun: true`):

```bash
curl -s -X POST "$APP_URL/api/admin/courses/<COURSE_ID>/import" \
  -H "Content-Type: application/json" \
  -H "Cookie: <your admin session cookie>" \
  --data @<(jq -n --slurpfile p ./import-payload.json '{dryRun:true, payload:$p[0]}')
```

Review the returned `summary` counts. Then run for real with `dryRun:false`.
(You can also paste `import-payload.json` into the admin **Course Content
Importer** UI if it exposes a dry-run toggle.)

## Recovery

If something looks wrong after step 4/5, restore from the step-3 backup: re-create
the modules/lessons from the JSON, or clear `deleted_at` on the archived rows for
that course to bring the old content back (do this before creating conflicting new
content). Ask if you want a `restore-course.mjs` helper — it wasn't built yet
because the safest path is to verify the dry-runs before ever archiving.

## What this toolkit deliberately does NOT do

- It does not write to VideoAsk (read-only source).
- It does not hard-delete anything (soft-delete only).
- It does not embed any credentials — everything comes from your local `.env`.
- It does not migrate respondent answer videos (out of scope per the plan).
