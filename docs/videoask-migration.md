# VideoAsk → CMB Lab Migration

Plan and runbook for moving our VideoAsk content into the CMB Lab
video-threads system. Built in four stages: understand both infrastructures,
define scope, define setup, then confirm with a small-batch test before the
full run.

Tooling:

- `scripts/migrate-videoask.ts` — two-phase CLI (export → import)
- `src/lib/videoask-migration.ts` — pure transform (VideoAsk form → thread/steps)
- `src/lib/__tests__/videoask-migration.test.ts` — fixture-based tests of the transform

---

## 1. Infrastructure

### VideoAsk (source)

VideoAsk is a hosted SaaS (by Typeform); we access our data via its REST API.

| Aspect | Detail |
|---|---|
| Base URL | `https://api.videoask.com` |
| Auth | `Authorization: Bearer <token>`. Quick token: app.videoask.com → Account → API (valid ~2 h). Long-lived: Organization Settings → Developer Apps (OAuth). |
| List forms | `GET /forms?limit=50&offset=0` (paginated) |
| Form detail | `GET /forms/{form_id}` — includes `questions[]` |
| Question fields | `question_id`, `type` (`standard`, `multiple_choice`, `thank_you`, …), `overlay_text`/`title`/`label`, `media_url` (CDN mp4), `thumbnail`, `allowed_answer_media_types` (`video`/`audio`/`text`), `options[]` with per-option logic-jump targets, question-level default jump |
| Responses | `GET /forms/{form_id}/conversations` (**capped at ~100 responses per form via API**) and `GET /forms/{form_id}/contacts/{contact_id}?include_answers=true` |

Field shapes were verified against a full export of our account
(2026-07-26, 439 forms / 4,336 questions): question `type` is `standard` or
`poll`, choices live in `poll_options[]` (`content` = label), and all
branching lives in `logic_actions[]` — `op: "always"` for default jumps,
`op: "is"` (question + option vars) for option-conditional jumps, with
targets of type `question`, `goodbye` (end screen), or `url` (external
link, 8 occurrences account-wide). `canvas_metadata.positions` preserves
the builder layout. The raw export is kept on disk so the import can be
tuned and re-run without re-exporting.

### CMB Lab (destination)

The v8.0 "Interactive Video Threads" system was built VideoAsk-style, so the
data models line up nearly 1:1:

| VideoAsk | CMB Lab |
|---|---|
| Form | `video_threads` row |
| Question | `video_thread_steps` row (`sortOrder` = question order) |
| Question video (`media_url`) | Mux asset (URL ingest) + `video_uploads` row → `step.uploadId`; `step.videoUrl` keeps the CDN URL as fallback |
| `overlay_text` / `title` | `step.promptText` |
| `options[]` | `step.responseOptions.options[]` (`{label, value}`), `responseType = multiple_choice` |
| `allowed_answer_media_types` | `step.responseType` (+ `allowedResponseTypes` when several) |
| Per-option logic jump | `step.logic` entry `{condition: optionValue, nextStepId}` |
| Question default jump | `step.fallbackStepId` |
| `thank_you` question | `step.isEndScreen = true` |
| Respondent conversations | `video_thread_sessions` / `video_thread_responses` — **not migrated** (see scope) |

Player traversal (in `/api/video-threads/[threadId]/respond`) resolves next
step as: `logic` match → `fallbackStepId` → next `sortOrder`. Migrated data
uses exactly those three mechanisms, so threads play back without any player
changes. Steps also get builder canvas positions (left-to-right by order) so
they render sensibly in the React Flow editor.

---

## 2. Scope

**In scope (migrated):**

- All VideoAsk forms we own: structure, titles, prompt text
- Every question video, re-hosted on Mux (ingested directly from the
  VideoAsk CDN URL — no local downloads)
- Multiple-choice/button options and their branching logic
- Answer-type configuration (video / audio / text responses)
- End screens

**Out of scope (v1):**

- **Historical respondent answers** — the API caps retrieval at ~100
  responses per form, student identities would need email→user matching, and
  coaches review new submissions going forward. The respondent count is noted
  in the dry-run output so we know what we're leaving behind. Can be a
  phase 2 if wanted.
- VideoAsk contacts (student CRM data lives in GHL; active-student CSV
  import already exists via `import_contacts.py`)
- VideoAsk-side analytics, notification settings, appearance/branding
- Calendar/payment/file-upload question types (we don't use them; the
  transform maps any unknown type to a button step and the dry-run makes
  them visible for manual review)

**Post-migration assignment:** migrated threads land unassigned. Coaches
assign them to students/courses from `/admin/video-threads` as usual
(`thread_assignments`), replacing VideoAsk share links.

---

## 3. Setup

### Environment (`.env.local`)

```env
VIDEOASK_API_TOKEN=...   # app.videoask.com → Account → API (2h) or Developer App token
DATABASE_URL=...         # Neon Postgres (import phase)
MUX_TOKEN_ID=...         # Mux (import phase, unless --skip-videos)
MUX_TOKEN_SECRET=...
```

### Phases

```bash
# Phase 1 — export raw VideoAsk data to .migration/videoask/ (gitignored)
npx tsx scripts/migrate-videoask.ts export

# Phase 2 — import into the LMS
npx tsx scripts/migrate-videoask.ts import --dry-run              # preview only
npx tsx scripts/migrate-videoask.ts import --limit 1 \
    --creator-email coach@thecmblueprint.com                      # small batch
npx tsx scripts/migrate-videoask.ts import \
    --creator-email coach@thecmblueprint.com                      # full run
```

Useful flags: `--forms id1,id2` (specific forms), `--limit N`,
`--skip-videos` (structure only), `--replace` (re-import a migrated form),
`--wait-minutes N` (Mux encode wait, default 10).

### Safety properties

- **Two-phase**: raw JSON export is kept locally; import can be re-run and
  tuned without touching VideoAsk again (matters because quick tokens expire
  in ~2 h).
- **Idempotent**: each migrated thread carries a `[videoask:<form_id>]`
  marker in its description; re-runs skip marked forms. Mux assets are keyed
  by `video_uploads.mux_upload_id = videoask:<question_id>`, so a re-run
  (or `--replace`) reuses existing assets instead of re-ingesting.
- **Resumable**: if Mux is still encoding when the wait times out, steps
  keep the VideoAsk CDN URL as `videoUrl` fallback; re-running import later
  attaches the finished assets.
- **Dry-run first**: `--dry-run` prints every thread, step, response type,
  and branch with no writes.

---

## 4. Small-batch test & confirmation

### Validated (done)

- **Full account export completed 2026-07-26**: 439 forms / 4,336 questions
  saved to `.migration/videoask/` (local, gitignored). All media is on
  `media.videoask.com` except one Vimeo player URL (ingest for that one is
  skipped with a warning; the step keeps the URL fallback).
- **Dry-run over the entire real export**: 432 threads would be created,
  7 empty forms skipped, 0 unresolved logic targets, 0 cross-question
  conditions, 8 external-URL jumps flagged for manual follow-up (links to
  YouTube/Spotify/booking pages — not representable in the thread player).
- `npx vitest run src/lib/__tests__/videoask-migration.test.ts` — 15 tests
  covering poll→multiple-choice mapping, `logic_actions` translation
  (always/is/goodbye/url), synthetic end screens, canvas position scaling,
  unresolved-target safety, and the idempotency marker.
- Full project typecheck and lint pass with the new script and transform.

### Live small-batch runbook (needs VideoAsk + DB + Mux credentials)

1. `export --limit 1` (or `--forms <id>` for a specific, representative form
   — ideally one with branching).
2. Inspect `.migration/videoask/forms/<id>.json`: confirm the logic-jump
   field names match what the transform reads (see §1). If not, extend
   `extractOptionTarget`/`extractDefaultTarget` in
   `src/lib/videoask-migration.ts` (add a test case) and continue — the
   export doesn't need to be redone.
3. `import --dry-run` — review step order, types, branches.
4. `import --limit 1 --creator-email <coach email>`.
5. Verify in the app:
   - `/admin/video-threads` → thread appears with step count
   - Builder view → steps laid out, edges match VideoAsk logic
   - Videos play (Mux playback IDs attached)
   - `/dashboard/threads/<id>` as a test student → walk each branch,
     confirm responses save and the thread completes
6. Re-run `import` — confirm the form is skipped (idempotency).
7. Sign-off, then run the full import and spot-check ~10% of threads.

### Final result (migration executed 2026-07-26)

Full import completed with `--storage blob`:

- **432 threads** created (431 + small-batch test), **4,767 steps**
- **4,335 / 4,335** VideoAsk-hosted videos mirrored into the private Vercel
  Blob store (~2.2 GB) — zero mirror failures
- 4,310 steps carry branching/default-jump wiring; 431 synthetic end screens
- 7 empty forms skipped (no questions)
- 1 known-dead video: "FORM FOR ASKING PEOPLE FOR VIDOE" step
  `a9a88379-1f1b-4d81-bea2-0ba7ea8621e5` pointed at a Vimeo link that 404s
  at the source (already broken inside VideoAsk; internal recruiting form)
- Mux is not used by any migrated content (the earlier Mux test thread was
  re-imported onto Blob)

### Rollback

Delete the migrated thread(s) in `/admin/video-threads` (steps, sessions,
and assignments cascade). Mux assets can be removed from the Mux dashboard
if needed; `video_uploads` rows identify them via the
`videoask:<question_id>` upload key and the `videoask-migration` tag.
VideoAsk itself is never written to, so the source stays intact until we
decide to sunset it.
