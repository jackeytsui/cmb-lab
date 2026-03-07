# Phase 30: Foundation & Fonts - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Load custom Hanzi Pinyin and Cantonese Visual fonts site-wide via next/font/local. Fix voice AI tutor to pass user's language preference. Update AI system prompts with Canto-to-Mando pedagogical awareness. Font files will be provided by user — build the loading infrastructure with placeholder/fallback until files arrive.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- Font loading strategy (next/font/local with preload: false, display: swap)
- Font application scope (site-wide via CSS variables on body/html)
- Font switching mechanism (CSS class or variable swap based on language preference)
- "Both" language preference handling for fonts (show both annotations or primary only)
- Voice AI fix approach (pass languagePreference to buildLessonInstructions)
- Canto-to-Mando pedagogy prompt tone and depth
- Fallback behavior before font files are provided (standard sans-serif, no annotations)

</decisions>

<specifics>
## Specific Ideas

- Custom font files render phonetics automatically above hanzi characters — just set font-family, no ruby HTML needed for bulk display
- User will provide .ttf/.otf files for both Hanzi Pinyin (Mandarin) and Cantonese Visual fonts
- Font switching should respect the existing language preference setting (Cantonese/Mandarin/Both)

</specifics>

<deferred>
## Deferred Ideas

None — user skipped discussion, proceeding directly to planning.

</deferred>

---

*Phase: 30-foundation-and-fonts*
*Context gathered: 2026-02-06*
