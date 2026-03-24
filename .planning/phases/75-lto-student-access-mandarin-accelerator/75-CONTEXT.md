# Phase 75: LTO Student Access & Mandarin Accelerator - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver three bonus "Mandarin Accelerator" features for LTO (Long-Term Offer) students, gated by a CRM tag. The three features are:

1. **Chinese Typing Unlock Kit** — Duolingo-style typing exercises (20 Mandarin + 20 Cantonese sentences) with exact-match auto-checking
2. **Conversation Confidence Starter Scripts** — 10 scenario-based dialogue scripts with pre-recorded audio and self-checking speaking practice
3. **Comprehensive AI Reader** — 5 prewritten Mandarin passages preloaded into the existing Reader (full Reader features, students just can't create their own content)

Plus the access gating infrastructure: tag-based feature override using the existing RBAC/tag system.

</domain>

<decisions>
## Implementation Decisions

### Access Gating
- **D-01:** LTO students are identified by a `LTO_student` CRM tag, NOT a separate role. Students keep their standard Student role; the tag triggers a tag-feature override that enables the `mandarin_accelerator` feature key.
- **D-02:** Tag is managed via both GHL CRM sync (auto on purchase) and manual coach tagging in admin panel.
- **D-03:** Mandarin Accelerator sidebar section is completely hidden for non-LTO students (no locked/teaser state).
- **D-04:** When tag is removed, access is revoked but all progress data is preserved in DB. Re-adding tag restores access with progress intact.

### Typing Unlock Kit
- **D-05:** Dedicated typing drill UI (new component), not reusing existing practice set exercise types. Duolingo-ish feel with character-by-character feedback.
- **D-06:** Exact match checking — student must type the exact expected Chinese sentence. Green if correct, red + show correct answer if wrong.
- **D-07:** Two separate sections: Mandarin (20 sentences) and Cantonese (20 sentences). Student picks which to practice.
- **D-08:** Each prompt shows English translation + romanisation (pinyin for Mandarin, jyutping for Cantonese). Student types Chinese characters.
- **D-09:** Retry until correct — unlimited retries, must get it right to advance. Consistent with existing mastery philosophy.
- **D-10:** Demo video (Sheldon's explanation + demonstration) embedded at top of the Typing Kit page. Watchable or skippable.
- **D-11:** Content managed via coach admin panel with bulk upload option (CSV/JSON) for loading all sentences at once.
- **D-12:** Progress tracked per student — completion count per section (e.g., "12/20 Mandarin") with progress bar. Resume where left off.

### Conversation Scripts
- **D-13:** 10 scenarios presented as a card grid. Each card labeled by scenario (Family Dinner, Restaurant, Phone Call, etc.). Tap to enter practice flow.
- **D-14:** Two-column layout per script: Speaker role on one side, Responder role on the other. Chinese characters + romanisation + English translation per line.
- **D-15:** Student practices both roles (all lines get self-checked).
- **D-16:** Both Cantonese and Mandarin shown inline per dialogue line — Canto first (more familiar), then Mando. Student practices both before moving to next line.
- **D-17:** Pre-recorded audio by Janelle (uploaded files, not Azure TTS). Audio clip plays after student attempts to speak aloud.
- **D-18:** Self-checking: student marks each line as "good" or "not good" (honor system, no recording/AI scoring).
- **D-19:** Self-check ratings tracked with progress per script. Student can see which lines they rated "not good" and revisit.
- **D-20:** Content managed via coach admin panel + bulk upload. Each scenario has metadata (title, description, roles) and ordered dialogue lines with audio files.

### Reader Passages
- **D-21:** Curated passages list page showing 5 passages by title. Student taps one to open in the existing Reader.
- **D-22:** Full Reader experience — dictionary popup, TTS, annotations, vocab save, all features work. The ONLY restriction is LTO students cannot paste/import/create their own passages. Passages are preloaded for them.
- **D-23:** Content managed via coach admin panel + bulk upload (consistent with other features).
- **D-24:** Simple read status tracking — "Read" / "Unread" badge per passage on the list page.

### Claude's Discretion
- DB schema design for typing sentences, conversation scripts, and curated passages
- Admin panel layout and form design for content management
- Bulk upload file format (CSV vs JSON) and validation approach
- Progress tracking table schema
- Sidebar section icon and ordering

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Access Control
- `src/lib/permissions.ts` — Feature key constants, PermissionSet interface, resolvePermissions()
- `src/lib/tag-feature-access.ts` — Tag-based feature overrides (the mechanism for LTO_student tag)
- `src/components/auth/FeatureGate.tsx` — Client-side feature gating component with locked fallback
- `src/lib/student-role.ts` — Default student role and feature assignment pattern

### Navigation
- `src/components/layout/AppSidebar.tsx` — Sidebar with feature-gated sections
- `src/app/(dashboard)/layout.tsx` — Dashboard layout with enabledFeatures resolution

### Reader (for passages feature)
- `src/app/(dashboard)/dashboard/reader/ReaderClient.tsx` — Existing Reader client component

### Self-Checking Speaking Practice SOP
- Loom reference: `https://loom.com/share/116fe473c59e4606ab9dae2aff1a5a06` — Demonstrates the two-column dialogue layout, audio playback after attempt, and good/not-good self-check flow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FeatureGate` component — Already handles feature-based UI gating with lock fallback
- Tag-feature override system — `getUserFeatureTagOverrides()` and `hasFeatureWithTagOverrides()` can map `LTO_student` tag to `mandarin_accelerator` feature key
- `resolvePermissions()` — Cached permission resolution already supports feature keys
- AppSidebar — Feature-gated sidebar sections pattern already established
- Reader — Full Reader with popup, TTS, annotations, segmentation exists and can be reused in read-only mode
- Azure TTS pipeline — Available if needed for fallback, but scripts use pre-recorded audio
- Existing admin patterns — CRUD admin panels exist for courses, grammar, exercises

### Established Patterns
- Feature keys defined in `FEATURE_KEYS` array in `src/lib/permissions.ts`
- Tag-feature overrides resolve at layout level via `applyFeatureTagOverrides()`
- Admin content management follows: list page + create/edit forms + DB schema with Drizzle
- Progress tracking pattern: per-student records with completion status

### Integration Points
- Add `mandarin_accelerator` to `FEATURE_KEYS` array
- Add tag-feature mapping for `LTO_student` tag -> `mandarin_accelerator`
- Add Mandarin Accelerator section to AppSidebar (gated by feature)
- New routes under `src/app/(dashboard)/dashboard/accelerator/` (typing, scripts, reader)
- New admin routes for content management
- New DB tables for typing sentences, conversation scripts, curated passages, and progress tracking

</code_context>

<specifics>
## Specific Ideas

- Typing Kit should feel "duolingo-ish" — clean, one-sentence-at-a-time, instant visual feedback (green/red)
- Conversation Scripts follow a specific SOP: two-column layout with roles, audio after attempt, self-check rating (see Loom reference)
- Canto comes first in scripts (more familiar to students), then Mando for the same line — inline display, not separate tabs
- Content is created by Janelle (sentences, scripts, passages) and Sheldon (demo video) — Jackey builds the CMB Lab interface
- All three features share a consistent content management pattern: admin panel + bulk upload

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 75-lto-student-access-mandarin-accelerator*
*Context gathered: 2026-03-24*
