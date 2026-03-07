---
phase: 30-foundation-and-fonts
plan: 01
subsystem: ui
tags: [tailwind-css-4, next-font, css-variables, phonetic-fonts, chinese-text]

# Dependency graph
requires: []
provides:
  - "Tailwind font utility classes font-hanzi-pinyin and font-cantonese-visual"
  - "PhoneticText wrapper component for scoped phonetic font application"
  - "CSS variable infrastructure for custom font loading (--font-hp-src, --font-cv-src)"
affects: [30-02, 31, 32, 33, 34]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source-variable pattern: @theme references --font-hp-src/--font-cv-src set on html element, avoiding circular CSS variable references"
    - "PhoneticText wrapper for scoped font application (never apply annotation fonts globally)"

key-files:
  created:
    - src/components/phonetic/PhoneticText.tsx
  modified:
    - src/app/globals.css
    - src/app/layout.tsx

key-decisions:
  - "Sans-serif fallback for --font-hp-src and --font-cv-src until custom font files are provided"
  - "Source-variable pattern (--font-hp-src/--font-cv-src) to avoid circular @theme references"
  - "Fixed --font-sans from var(--font-geist-sans) to var(--font-inter) to match actual Inter font"
  - "'Both' language preference defaults to Mandarin pinyin font (font-hanzi-pinyin)"

patterns-established:
  - "PhoneticText wrapper: all Chinese text needing phonetic annotations must be wrapped in <PhoneticText>"
  - "Font source variables on <html> element style attribute for custom font CSS variable injection"

# Metrics
duration: 9min
completed: 2026-02-06
---

# Phase 30 Plan 01: Font Infrastructure Summary

**Tailwind CSS 4 phonetic font variables (hanzi-pinyin, cantonese-visual) with PhoneticText wrapper using useLanguagePreference hook for auto-switching**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-06T13:35:03Z
- **Completed:** 2026-02-06T13:44:03Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Registered two phonetic font CSS variables in Tailwind @theme (font-hanzi-pinyin, font-cantonese-visual) with source-variable pattern to avoid circular references
- Fixed existing --font-sans mismatch from Geist to Inter
- Created PhoneticText client component that auto-switches between phonetic fonts based on user language preference
- Infrastructure ready for drop-in font files -- only need to add localFont() calls when .woff2/.ttf files arrive

## Task Commits

Each task was committed atomically:

1. **Task 1: Register phonetic font CSS variables in layout.tsx and globals.css** - `1542975` (feat)
2. **Task 2: Create PhoneticText wrapper component** - `c02a7a6` (feat)

## Files Created/Modified
- `src/app/globals.css` - Added --font-hanzi-pinyin and --font-cantonese-visual to @theme inline block; fixed --font-sans from Geist to Inter
- `src/app/layout.tsx` - Added --font-hp-src and --font-cv-src CSS custom properties on html element with sans-serif fallback
- `src/components/phonetic/PhoneticText.tsx` - Client component that applies font-hanzi-pinyin (mandarin/both) or font-cantonese-visual (cantonese) based on useLanguagePreference hook

## Decisions Made
- **Source-variable pattern:** Used distinct variable names (--font-hp-src, --font-cv-src) on the html element, referenced by @theme variables (--font-hanzi-pinyin, --font-cantonese-visual). This avoids the circular `--font-hanzi-pinyin: var(--font-hanzi-pinyin)` problem in Tailwind CSS 4.
- **Sans-serif fallback:** Since font files are not yet provided, source variables default to `sans-serif`. When files arrive, add localFont() calls that set --font-hp-src and --font-cv-src to actual font families.
- **"Both" defaults to Mandarin:** When language preference is "both", PhoneticText applies font-hanzi-pinyin (pinyin annotations). Can be enhanced later with a toggle.
- **Kept --font-mono unchanged:** The existing --font-mono: var(--font-geist-mono) is used by 7+ components; changing it would break them.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npm run build` fails due to missing Clerk publishableKey environment variable (pre-existing issue, not caused by this plan's changes). Used `npx tsc --noEmit` for type-checking verification instead, which passed cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Font infrastructure complete and ready for use by PhoneticText component
- When custom font files (.woff2/.ttf) are provided, add localFont() calls in layout.tsx to set --font-hp-src and --font-cv-src
- PhoneticText component ready to wrap Chinese text in any future component

## Self-Check: PASSED

---
*Phase: 30-foundation-and-fonts*
*Completed: 2026-02-06*
