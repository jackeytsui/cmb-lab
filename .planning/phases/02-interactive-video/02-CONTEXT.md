# Phase 2: Interactive Video - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Video auto-pauses at defined timestamps with overlay container for interactions. The video player transforms from passive viewing into an interactive experience where the system controls playback flow, pausing at predetermined points to wait for student engagement. This includes subtitle rendering with Chinese/Pinyin/Jyutping annotations and a full overlay system for interaction delivery.

</domain>

<decisions>
## Implementation Decisions

### Pause Behavior and Timing
- **Pause transition**: Video and audio fade out over 0.5-1 second before pausing (smooth, not abrupt)
- **Seeking past interactions**: Students can seek forward, but skipped interactions are marked incomplete (affects progress tracking)
- **Buffering strategy**: Preload interaction data and overlay assets a few seconds before cue point to prevent lag
- **Replay control**: Rewind button visible (10-15 second jump back) for students to rewatch segments

### Subtitle and Annotation Display
- **Romanization toggle**: Students can show/hide Pinyin/Jyutping annotations with a button
- **Toggle default**: Remember user preference (first time shows on, then persists their choice across sessions)
- **Subtitle position**: Overlaid on video bottom (traditional subtitle placement)
- **Timing sync**: Claude's discretion on whether to include manual offset adjustment

### Overlay Composition and States
- **Overlay animation**: Fade in smoothly over 300-500ms when video pauses
- **Overlay content**: Full sidebar layout - interaction prompt on left, vocabulary/notes/hints sidebar on right
- **Mobile behavior**: Collapsible sidebar - resources drawer/accordion on mobile screens
- **Post-completion**: Overlay fades out immediately after student completes interaction, video resumes

### Student Controls and Navigation
- **Playback speed**: Standard speed options available (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x)
- **Paused state controls**: All player controls remain visible during interaction (seek, volume, settings)
- **Cue point indicators**: Show all interaction cue points as markers on the progress bar
- **Exit behavior**: Students can exit lesson anytime - progress is saved, returns to same spot next time

### Claude's Discretion
- Exact fade timing for pause transitions
- Subtitle timing sync adjustment feature (include if technically simple)
- Specific spacing, typography, and styling for overlay layout
- Loading state design for interaction preloading
- Exact rewind jump-back duration (10-15 seconds suggested)

</decisions>

<specifics>
## Specific Ideas

- "The overlay should feel like the video is pausing for you, not that you're interrupting the video"
- Resource sidebar should provide helpful reference without overwhelming the interaction prompt
- Progress bar cue indicators help students mentally prepare for upcoming interactions

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 02-interactive-video*
*Context gathered: 2026-01-26*
