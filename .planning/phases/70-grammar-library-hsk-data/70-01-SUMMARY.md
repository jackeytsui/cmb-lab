---
phase: 70-grammar-library-hsk-data
plan: 01
status: completed
completed: 2026-02-16
---

# Phase 70 Summary

Implemented grammar system:
- Added schema (`src/db/schema/grammar.ts`): patterns + bookmarks
- Added grammar APIs:
  - `GET/POST /api/grammar/patterns`
  - `POST/DELETE /api/grammar/patterns/[patternId]/bookmark`
  - `POST /api/grammar/generate-draft` (n8n webhook + fallback)
- Added student grammar pages:
  - `/dashboard/grammar`
  - `/dashboard/grammar/[patternId]`
- Added admin grammar builder `/admin/grammar` using shared `RichTextEditor` (TipTap)
- Includes HSK filter, keyword search, examples/translations/mistakes, Cantonese-vs-Mandarin section, and bookmarks.
