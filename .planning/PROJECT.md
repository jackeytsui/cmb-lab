# CantoMando Blueprint

## What This Is

An interactive Learning Management System (LMS) for teaching Mandarin and Cantonese simultaneously. Students watch video lessons that automatically pause at defined timestamps, requiring them to type Chinese sentences or record audio. AI grades their responses in real-time, and they must pass to continue. A voice-based AI bot provides conversation practice, a Chinese text reader with dictionary lookup supports reading comprehension, and gamification (XP, streaks, celebrations) drives engagement.

## Core Value

The interactive video player that transforms passive watching into active engagement — students can't just watch, they must demonstrate understanding at each checkpoint to progress.

## Current Milestone: v10.0 Mastery & Intelligence

**Goal:** Transform CantoMando from a course delivery platform into a comprehensive mastery engine — SRS flashcards for long-term retention, smart study recommendations, tone-specific training, grammar reference library, AI prompt testing for coaches, placement/HSK assessments, and auto-generated exercises from existing content.

**Target features:**
- SRS flashcard system with SM-2 scheduling, deck organization, and one-click creation from vocab/reader/practice results
- Smart study engine that identifies weak areas and generates personalized daily study plans
- AI prompt testing lab for coaches (A/B comparison, saved test cases, batch testing, promotion to production)
- Tone training module (identification drills, production scoring, minimal pairs, tone sandhi)
- Assessment system (adaptive placement quiz + HSK mock tests levels 1-6)
- Grammar pattern library (browsable, searchable, AI-generated drafts, coach-authored, Canto vs Mando diffs)
- Auto-exercise generation from lesson and reader content (cloze, reorder, matching, fill-blank) with coach approval

## Requirements

### Validated

*Shipped in v1.0 — 44 requirements across 9 phases*

- ✓ Interactive video player with Mux that auto-pauses at defined timestamps
- ✓ Text input interactions where students type Chinese sentences
- ✓ AI grading via n8n webhook with unlimited retries until correct
- ✓ Audio recording interactions with immediate AI feedback
- ✓ Coach review workflow for audio/video submissions (Loom response + email notification)
- ✓ AI voice conversation bot for speaking practice (lesson-aware, real-time)
- ✓ Custom font support for Pinyin (Mandarin) and Jyutping (Cantonese) annotations
- ✓ Student language preference setting (Cantonese only, Mandarin only, or both)
- ✓ Linear lesson progression (must complete lesson N to unlock lesson N+1)
- ✓ Lesson completion = video finished AND all interactions passed
- ✓ Per-course access model with webhook enrollment from external sales
- ✓ Coach manual course assignment (override/supplement webhook)
- ✓ Coach notes system (internal, shared with student, per-submission, general profile)
- ✓ Admin panel for CRUD courses, modules, and lessons
- ✓ Interaction editor for defining pause points with timestamps
- ✓ Student dashboard with progress bars and course grid
- ✓ Coach dashboard with video submission queue and AI conversation history
- ✓ Progress tracking (lesson completion, pending reviews, AI feedback logs)
- ✓ Email notifications when coach sends feedback
- ✓ Dark mode default with cinematic aesthetic
- ✓ Mobile-responsive web design

*Shipped in v1.1 — 26 requirements across 4 phases*

- ✓ AI prompts dashboard with versioning and rollback
- ✓ Bulk video upload with drag-drop and rate-limited queue
- ✓ Batch assign videos to lessons, batch edit metadata
- ✓ Content reordering and moving between modules/courses
- ✓ Knowledge base with categories, entries, PDF upload, and auto-chunking
- ✓ AI chatbot with RAG search, streaming, Chinese annotation rendering

*Shipped in v2.0 — 23 requirements across 7 phases*

- ✓ E2E test suite with Playwright (enrollment, lesson completion, grading, coach review)
- ✓ In-app notification system (bell icon, dropdown panel, preferences)
- ✓ Course and lesson search with Chinese character support and romanization
- ✓ Analytics dashboard (completion rates, drop-off points, at-risk students, difficulty metrics)
- ✓ PDF completion certificates with Chinese font support and verification
- ✓ API rate limiting with Upstash Redis (per-user and per-IP limits)
- ✓ PWA support (manifest, service worker, deferred install prompt)

*Shipped in v3.0 — 16 requirements across 4 phases*

- ✓ GoHighLevel CRM integration with bidirectional tag sync
- ✓ Outbound webhook events for learning milestones with retry logic
- ✓ Tagging system with auto-rules for student management
- ✓ Student management dashboard with bulk operations and CSV export

*Shipped in v3.1 — 29 requirements across 5 phases*

- ✓ All 9 audit bugs fixed (progress tracking, self-fetch pattern, Loom regex, etc.)
- ✓ Systematic error handling with ErrorAlert component across all pages
- ✓ Loading skeletons and error recovery for student, coach, and admin pages
- ✓ Graceful degradation patterns (video plays without interactions on error, etc.)

*Shipped in v4.0 — 45 requirements across 7 phases*

- ✓ Voice AI language preference fix and Canto-to-Mando pedagogical system prompts
- ✓ Custom Hanzi Pinyin and Cantonese Visual fonts loaded site-wide with auto-switching
- ✓ 6 exercise types (MCQ, fill-blank, matching, ordering, audio recording, free text) with language tagging
- ✓ Visual canvas drag-and-drop practice set builder with undo/redo
- ✓ Practice set assignments to lessons, modules, courses, students, and tags with due dates
- ✓ Practice set player with instant client-side grading and AI grading via n8n
- ✓ iMessage-style chatbot with lesson context, inline exercises, and persistent conversations
- ✓ Azure pronunciation scoring with per-character tone accuracy highlights (green/yellow/red)
- ✓ Coach pronunciation review dashboard and voice AI practice topic suggestions

*Shipped in v5.0 — 37 requirements across 7 phases*

- ✓ Persistent sidebar navigation with collapsible menu and mobile hamburger
- ✓ Student settings page (language preference, notifications, daily goal, profile)
- ✓ 404 page and error boundaries for missing routes
- ✓ Build fix (static generation + Clerk dynamic), missing DB indexes, N+1 query fixes
- ✓ Security headers, .env.example completion, loading state consistency
- ✓ Lesson and practice set completion celebrations with score-based confetti tiers
- ✓ XP point system with daily goals, streak tracking, and activity rings
- ✓ Personal progress dashboard (XP timeline, heatmap, mastery map, badges, weekly summary)
- ✓ Coach practice results page with per-student attempt detail and analytics
- ✓ Activity scoreboard with personal bests and optional cohort rankings

*Shipped in v6.0 — 30 requirements across 6 phases*

- ✓ Dictionary infrastructure: 145K+ CC-CEDICT/CC-Canto entries with language-source flagging
- ✓ Character data: 9.5K characters with radical, decomposition, etymology, and stroke paths
- ✓ Chinese Reader page with text paste, file import (.txt/.pdf), encoding detection
- ✓ Word segmentation (Intl.Segmenter) with annotation modes (pinyin/jyutping/plain)
- ✓ Traditional ↔ Simplified conversion toggle with HK variant support
- ✓ Character popup with tone comparison, radical breakdown, stroke animation, TTS, vocabulary save
- ✓ Azure TTS for Mandarin and Cantonese with Redis caching and speed control
- ✓ Sentence read-aloud and AI-powered sentence translation with tap-to-reveal
- ✓ Saved vocabulary list page with search, TTS playback, and management
- ✓ Lesson-to-Reader integration with pre-loaded lesson content

*Shipped in v7.0 — 14 plans across 6 phases*

- ✓ YouTube video embed with caption extraction and manual SRT/VTT upload fallback
- ✓ Interactive transcript panel with playback sync and tap-to-jump navigation
- ✓ Dictionary popup integration on transcript words (hover/tap)
- ✓ Phonetic annotation modes on transcript text (pinyin/jyutping/plain)
- ✓ Vocabulary highlighting (known vs unknown words)
- ✓ Loop mode for section repeat practice
- ✓ Watch progress tracking and resume capability
- ✓ Coach video assignment system with student dashboard integration

*Shipped in v8.0 — 12 plans across 6 phases*

- ✓ Polished React Flow editor with VideoAsk-style card nodes and 30px handle hit areas
- ✓ Dynamic output handles per VideoNode answer option, labeled True/False on LogicNode
- ✓ Edge deletion UI (× button on hover), double-click-to-edit nodes, position persistence
- ✓ n8n-style Logic Node modal with data preview pane and field/operator/value rule builder
- ✓ In-builder webcam recording (WebM → Mux upload) + existing Mux video library picker
- ✓ Two-way sync: visual edges ↔ DB logic rules, with save spinner + toast feedback
- ✓ Student-facing thread player with video autoplay and button/text/audio/video response collection
- ✓ Response storage in DB (sessions + per-step responses) with session tracking
- ✓ Recursive logic node resolution in submit endpoint (evaluate rules → traverse → find content)
- ✓ Coach response review dashboard with per-thread submission history and inline playback
- ✓ Thread assignment system (assign to students/courses) with student dashboard integration
- ✓ Thread completion tracking and analytics (completion rates, response counts, time tracking)

*Shipped in v9.0 — 43 requirements across 7 phases*

- ✓ Role creation UI with soft-delete, search, and student count display
- ✓ Permission builder with granular course/module/lesson/feature/assignment-type grants
- ✓ Multi-role assignment to students with additive permission stacking
- ✓ Time-limited roles with automatic expiration
- ✓ Student access resolver with React cache() dedup
- ✓ Webhook integration for role-based enrollment with idempotency
- ✓ Migration from courseAccess to Legacy Access roles
- ✓ Student-facing access indicators (MyRolesSection)
- ✓ Role analytics dashboard with expiration warnings

### Active

- [x] SRS flashcard system with FSRS scheduling and deck organization
- [x] One-click flashcard creation from Reader and saved vocabulary
- [x] Smart study engine with weak-area identification and daily study plans
- [x] AI prompt testing lab (test, compare, batch test, run summary)
- [x] Tone training (identification, production scoring, tone tracking)
- [x] Assessment and placement framework with HSK estimate
- [x] Grammar pattern library (coach-authored + AI draft generation + bookmarks)
- [x] Auto-generated exercise pipeline with draft integration

### Out of Scope

- Native mobile app — web-first with PWA, native app deferred
- Real-time chat between students and coaches — async Loom workflow sufficient
- Payment processing — handled externally, webhook syncs access
- OAuth login options — email/password via Clerk sufficient
- Offline lesson viewing — PWA provides install, not full offline video cache
- Handwriting recognition — typing/paste input only
- OCR camera input — import via file upload only, not camera capture

## Context

**Target Users:** Paid students learning Mandarin and Cantonese simultaneously, coming from external sales funnels (Zapier webhook creates their accounts).

**Current Pain Point:** Students using Kajabi must pause videos manually, switch to a notes app to type sentences, then switch back. No integrated feedback loop. No way to verify they actually practiced.

**Teaching Method:** The course teaches students to leverage Cantonese knowledge to learn Mandarin. The AI bot understands this pedagogical approach and helps students see connections between the two languages.

**Content Team:** Small team of 2-3 instructors/coaches who create content and review student submissions.

**Shipped:** v1.0 through v7.0 (55 phases, 204 plans). Full interactive video LMS with practice platform, gamification, progress dashboard, CRM integration, Chinese text reader with dictionary, and YouTube listening lab.

**Tech Stack:** Next.js 16, Neon Postgres, Drizzle ORM, Clerk, Tailwind CSS 4 + shadcn/ui, Mux, n8n webhooks, Azure Speech Services, OpenAI (GPT-4o-mini, Realtime API), Upstash Redis.

## Constraints

- **Tech Stack**: Next.js (App Router), Neon Postgres, Drizzle ORM, Clerk, Tailwind + shadcn/ui, Mux, n8n webhooks — non-negotiable
- **Video Hosting**: Mux only — using Mux Player React for interactive playback control
- **AI Grading**: Must go through n8n webhook (not direct API calls) — allows workflow flexibility
- **Auth**: Clerk — manages paid student access, synced from external sales
- **Mobile**: Web must be responsive, but no native app
- **Fonts**: Must support custom local font files with annotation rendering

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Unlimited retries on interactions | Forces mastery, can't skip through | ✓ Good |
| AI + Coach hybrid for audio grading | Immediate feedback keeps momentum, coach adds depth | ✓ Good |
| Linear progression unlock | Ensures students don't skip foundational lessons | ✓ Good |
| Loom for coach video responses | Simple, coaches already use it, no video recording UI needed | ✓ Good |
| Per-student language preference | Simpler than per-lesson toggle, affects all interactions | ✓ Good |
| Voice-to-voice AI bot | Real speaking practice, not just typing — core to language learning | ✓ Good |
| Custom fonts for phonetic display | Font files render pinyin/jyutping automatically — no ruby HTML needed | ✓ Good |
| Visual canvas homework builder | Coaches need intuitive drag-and-drop, not form-based creation | ✓ Good |
| Standalone practice sets | Homework shouldn't be locked inside video timestamps only | ✓ Good |
| Premium engagement over gamification | XP/streaks for personal motivation, not public leaderboards | ✓ Good |
| Activity rings over flame streaks | Apple Watch-style rings feel premium for adult audience | ✓ Good |
| CC-CEDICT + CC-Canto combined dictionary | Open-source, instant lookup for both languages | ✓ Good |
| Azure TTS for reader audio | Already configured for pronunciation scoring, reuse for read-aloud | ✓ Good |
| Single shared Floating UI popup | Performance: one popup instance vs per-character instances | ✓ Good |
| Intl.Segmenter for word segmentation | Zero dependencies, built-in browser API | ✓ Good |
| opencc-js with HK variant | Correct T/S conversion for Cantonese context | ✓ Good |
| Content-shaped loading skeletons | Better UX than generic spinners for dictionary/popup content | ✓ Good |
| VideoAsk-style flow builder | Visual card-based editor more intuitive than form-based step editing | — Pending |
| Dual logic systems (legacy + n8n-style) | Gradual migration from simple button routing to field-based rule engine | — Pending |
| Webcam recording in builder | Coaches record directly in flow editor, not separate upload workflow | — Pending |

---
*Last updated: 2026-02-16 after v10.0 milestone completion*
