# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** The interactive video player that transforms passive watching into active engagement -- students can't just watch, they must demonstrate understanding at each checkpoint to progress.
**Current focus:** v10.0 Mastery & Intelligence

## Current Position

Phase: 75 - LTO Student Access & Mandarin Accelerator
Plan: 04 complete (parallel execution with 02, 03)
Status: Phase 75 in progress (plans 01, 04 of 4 complete)
Last activity: 2026-03-24 -- completed 75-04 curated passages (admin CRUD + student reader integration)

## Milestone Summary

- v10.0 phases completed: 69, 70, 71, 72, 73, 74
- v10.0 plans completed: 6/6
- v10.0 requirements marked done: 48/48

## Decisions

| # | Decision | Rationale | Outcome |
|---|----------|-----------|---------|
| 1 | 6 phases for v10.0 (69-74) | Requirements clustered by dependency boundaries | ✓ Completed |
| 2 | FSRS-based in-house scheduler | Zero-new-package policy and controllable scheduling behavior | ✓ Completed |
| 3 | Grammar authoring uses existing TipTap component | Reuses existing editor and avoids UI fragmentation | ✓ Completed |
| 4 | Prompt Lab and auto-exercise generation share AI webhook-first pattern | Single integration model with local fallback | ✓ Completed |
| 5 | Study recommendations are heuristic (non-ML) | Small cohort, high interpretability, low ops overhead | ✓ Completed |
| 6 | LTO gating via existing tag-feature override system | No new infra needed, reuses feature:enable:* pattern | ✓ Completed |
| 7 | Seed tag as system type | Consistent with GHL auto-created tags | ✓ Completed |
| 8 | hideImport prop on ReaderClient (Option B) | Cleaner than CSS selector targeting for state-controlled ImportDialog | ✓ Completed |
| 9 | Div-based admin table layout | No shadcn Table component in project | ✓ Completed |

## Pending Todos

- Configure Azure Speech credentials (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION) for production tone scoring
- Configure grammar and exercise generation n8n webhooks:
  - N8N_GRAMMAR_GEN_WEBHOOK_URL
  - N8N_EXERCISE_GEN_WEBHOOK_URL
- Update service worker network-only route patterns for new paths:
  - /dashboard/srs
  - /dashboard/grammar
  - /dashboard/tone
  - /dashboard/assessments
- Bump service worker cache name during deployment

## Blockers/Concerns

- Build completes in current environment, but Redis env placeholders trigger non-fatal warnings during build-time route evaluation
- AI generation endpoints run fallback logic if webhook envs are missing
- Assessment quality calibration still needs real student attempt data

## Session Continuity

Last session: 2026-03-24
Stopped at: Completed 75-04-PLAN.md (curated passages)
Resume with: Merge parallel worktrees for 75-02, 75-03, 75-04
