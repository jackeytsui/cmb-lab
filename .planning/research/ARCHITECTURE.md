# Architecture Patterns: v4.0 Practice & Homework Platform

**Domain:** Practice/homework system integration with existing CantoMando Blueprint LMS
**Researched:** 2026-02-06
**Confidence:** HIGH (based on direct codebase analysis of 18 schema files, 30+ components, all API routes, hooks, and lib utilities)

## Executive Summary

The v4.0 milestone adds practice sets, an exercise builder, enhanced chatbot, pronunciation scoring, and custom fonts to an existing LMS with a mature architecture. The key architectural decision is: **practice exercises are a separate entity from video interactions.** The existing `interactions` table is tightly coupled to video cue points (timestamp-bound, consumed by XState video player machine, tied to linear lesson progression). Practice sets are standalone homework units that can be assigned to any content level or directly to students.

The integration strategy is additive -- new tables, new components, new API routes -- with surgical modifications to existing components (ChatPanel, layout.tsx, lesson-context.ts). Nothing in the existing video interaction pipeline changes.

---

## Current Architecture Summary

```
Next.js 16 App Router (RSC + Client Components)
  |
  +-- src/app/(dashboard)/     -- Pages (student, coach, admin)
  +-- src/app/api/             -- API routes (grade, chat, admin/*)
  +-- src/components/          -- UI by domain (admin/, video/, chat/, voice/, audio/, interactions/)
  +-- src/hooks/               -- Client hooks (useInteractiveVideo, useChatbot, useRealtimeConversation)
  +-- src/lib/                 -- Server utilities (progress.ts, grading.ts, interactions.ts, etc.)
  +-- src/db/schema/           -- 18 Drizzle ORM schema files
  +-- src/machines/            -- XState (videoPlayerMachine)
  +-- src/types/               -- TypeScript type definitions
```

**Existing patterns that inform v4.0 design:**
- Interactions are video-timestamp-bound pause points (`interactions` table with `timestamp` NOT NULL integer)
- Grading flows through n8n webhooks (`N8N_GRADING_WEBHOOK_URL`, `N8N_AUDIO_GRADING_WEBHOOK_URL`)
- AI SDK `useChat` with streaming + tool calls for chatbot (`searchKnowledgeBase` tool)
- OpenAI Realtime WebRTC API for voice conversations (`realtime-utils.ts`)
- Mux Player with cue point system + XState for video state machine
- Clerk auth with role-based access (student/coach/admin via `roleEnum`)
- Linear lesson progression (`unlock.ts` checks `lessonProgress.completedAt`)
- Language preference filtering on interactions (`filterInteractionsByPreference`)
- Prompt management with database-stored templates + `{{variable}}` replacement (`getPrompt`)
- React Hook Form + Zod for form validation (InteractionForm, TextInteraction)
- Framer Motion for animations (InteractionOverlay, FeedbackDisplay, ChatMessage)
- Radix UI primitives for accessible UI (Select, AlertDialog, Sheet, etc.)

---

## Recommended Architecture for v4.0

### High-Level Integration Map

```
EXISTING (modify)                          NEW (create)
-----------------                          -----------
interactions table ----NO CHANGE------>    exercise_type enum (mcq, matching, ordering, fill_blank, free_text, audio)
interactionAttempts ---NO CHANGE------>    practice_sets table
                                           practice_exercises table (JSONB definition)
                                           practice_set_assignments table
                                           practice_attempts table

InteractiveVideoPlayer --NO CHANGE--->     (video cue point system stays as-is)
InteractionOverlay -----NO CHANGE--->      (stays as-is)
TextInteraction --------REUSE-------->     FreeTextRenderer wraps TextInteraction
AudioInteraction -------REUSE-------->     AudioRenderer wraps AudioInteraction
FeedbackDisplay --------REUSE-------->     PracticeFeedback extends FeedbackDisplay

ChatPanel --------ENHANCE----------->      ChatPanel v2 (lesson context, practice mode)
ChatMessage ------ENHANCE----------->      ChatMessage v2 (inline exercise rendering)
ChineseAnnotation ---NO CHANGE----->       (reuse in chat and practice contexts)
useChatbot -----------MODIFY-------->      Add lessonId + practice mode to transport body

/api/grade ---------NO CHANGE-------->     /api/practice/grade (new, delegates to same n8n webhooks)
/api/chat ----------ENHANCE---------->     Add generateExercise tool to streamText
/api/realtime/token -MODIFY---------->     Pass language preference to session config

lesson-context.ts ---MODIFY---------->     Add practice set context to voice tutor instructions
progress.ts ----------NO CHANGE---->       practice-progress.ts (new, parallel pattern)

layout.tsx ----------ADD FONTS------->     next/font/local for custom Chinese fonts
```

### Component Boundaries

| Component | Type | Responsibility | Communicates With |
|-----------|------|---------------|-------------------|
| **PracticeSetBuilder** | NEW | Coach drag-and-drop canvas for creating homework | /api/practice/*, ExerciseBlockEditor |
| **ExerciseBlockEditor** | NEW, polymorphic | Edit mode for one exercise in builder | PracticeSetBuilder (parent) |
| **PracticePlayer** | NEW | Student-facing practice set runner | /api/practice/grade, practice-progress.ts |
| **ExerciseRenderer** | NEW, polymorphic | Renders one exercise in play mode | PracticePlayer (parent), ChatMessage (inline) |
| **ChatPanel v2** | MODIFIED | Enhanced chatbot with lesson context + practice | /api/chat (enhanced) |
| **ChatMessage v2** | MODIFIED | Renders inline exercise widgets from AI tool calls | ExerciseRenderer, ChineseAnnotation |
| **InteractiveVideoPlayer** | UNCHANGED | Video playback with cue points | Same as today |
| **VoiceTutor components** | MODIFIED | Pronunciation scoring display | /api/realtime/token |

---

## New Database Tables

### Design Decision: Separate from Interactions

The existing `interactions` table has:
- `lessonId` FK (required, NOT NULL)
- `timestamp` integer (required, NOT NULL -- seconds into video)
- `type` enum limited to "text" | "audio"
- Consumed by XState video player via `CuePoint` type
- Tied to `lessonProgress.interactionsCompleted` counter for lesson completion

Practice exercises are fundamentally different:
- Not bound to a video timestamp
- Assignable to lesson, module, course, or directly to students
- 6 exercise types (not just text/audio)
- Different data shapes per type (JSONB)
- Separate completion tracking from lesson progress

**Overloading the interactions table would break:** the CuePoint type system, the video player state machine, the progress calculation, and the InteractionForm UI. Creating separate tables is the clean path.

### 1. practice_sets -- Container for a group of exercises

```typescript
// src/db/schema/practice.ts

export const practiceSetStatusEnum = pgEnum("practice_set_status", ["draft", "published"]);

export const practiceSets = pgTable("practice_sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  language: interactionLanguageEnum("language").notNull(), // reuse existing: cantonese | mandarin | both
  status: practiceSetStatusEnum("status").notNull().default("draft"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
});
```

### 2. practice_exercises -- Individual exercises with JSONB definitions

```typescript
export const exerciseTypeEnum = pgEnum("exercise_type", [
  "mcq", "matching", "ordering", "fill_blank", "free_text", "audio"
]);

export const practiceExercises = pgTable("practice_exercises", {
  id: uuid("id").defaultRandom().primaryKey(),
  practiceSetId: uuid("practice_set_id")
    .notNull()
    .references(() => practiceSets.id, { onDelete: "cascade" }),
  type: exerciseTypeEnum("type").notNull(),
  language: interactionLanguageEnum("language").notNull(),
  prompt: text("prompt").notNull(),
  definition: text("definition").notNull(), // JSON string (validated by Zod in app layer)
  sortOrder: integer("sort_order").notNull(),
  points: integer("points").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});
```

**Why `text` for definition instead of native `jsonb`:** Drizzle ORM's JSONB support requires explicit type casting. Using `text` with `JSON.parse`/`JSON.stringify` in the application layer plus Zod validation is simpler, matches the existing pattern (see `prompts` table `metadata` field, `kbChunks` table `metadata` field), and avoids Drizzle JSONB type inference complexities. If we later need to query inside the JSON at the DB level, we can migrate to native `jsonb`.

**JSONB `definition` schema per exercise type:**

```typescript
// Discriminated union validated by Zod

// MCQ
{ type: "mcq", options: [{ id, text, isCorrect }], allowMultiple: boolean, explanation?: string }

// Matching (connect pairs)
{ type: "matching", pairs: [{ id, left, right }] }

// Ordering (arrange in sequence)
{ type: "ordering", items: [{ id, text, correctPosition }] }

// Fill in the blank
{ type: "fill_blank", template: "I want ___.", blanks: [{ id, acceptedAnswers: string[], position }] }

// Free text (AI-graded -- reuses n8n webhook pipeline)
{ type: "free_text", expectedAnswer, correctThreshold: 80, gradingContext?: string }

// Audio (AI-graded -- reuses n8n webhook pipeline)
{ type: "audio", expectedAnswer, correctThreshold: 80 }
```

### 3. practice_set_assignments -- Polymorphic assignment model

```typescript
export const assignmentTypeEnum = pgEnum("assignment_type", [
  "lesson", "module", "course", "student", "tag"
]);

export const practiceSetAssignments = pgTable("practice_set_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  practiceSetId: uuid("practice_set_id")
    .notNull()
    .references(() => practiceSets.id, { onDelete: "cascade" }),
  assignmentType: assignmentTypeEnum("assignment_type").notNull(),
  targetId: uuid("target_id").notNull(), // lessonId, moduleId, courseId, userId, or tagId
  assignedBy: uuid("assigned_by")
    .notNull()
    .references(() => users.id),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

**Polymorphic FK tradeoff:** `targetId` references different tables depending on `assignmentType`. No database-level FK constraint. Enforced in application layer with Zod validation per assignment type. This is pragmatic for 5 target types -- separate nullable FK columns would create a wide table with 4 nulls per row.

### 4. practice_attempts -- Student attempt records

```typescript
export const practiceAttempts = pgTable("practice_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  practiceSetId: uuid("practice_set_id")
    .notNull()
    .references(() => practiceSets.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  score: integer("score"), // 0-100, calculated on completion
  totalPoints: integer("total_points"),
  earnedPoints: integer("earned_points"),
  answers: text("answers").notNull(), // JSON: [{ exerciseId, answer, isCorrect, score, feedback }]
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### 5. New enums

```sql
CREATE TYPE exercise_type AS ENUM ('mcq', 'matching', 'ordering', 'fill_blank', 'free_text', 'audio');
CREATE TYPE assignment_type AS ENUM ('lesson', 'module', 'course', 'student', 'tag');
CREATE TYPE practice_set_status AS ENUM ('draft', 'published');
```

**NOT modified:** `interaction_type` enum ("text", "audio") stays as-is. Practice exercises are a separate domain.

---

## New Components Architecture

### Practice Builder (Coach-facing)

```
src/components/practice/
  builder/
    PracticeSetBuilder.tsx          -- Main canvas with DnD context provider
    PracticeSetToolbar.tsx          -- Exercise type palette (drag sources)
    ExerciseBlockEditor.tsx         -- Polymorphic editor dispatch by type
    BuilderPreview.tsx              -- Live preview panel (renders as student would see)
    blocks/
      MCQBlockEditor.tsx            -- Add/remove/reorder options, mark correct
      MatchingBlockEditor.tsx       -- Add/remove pairs, left/right columns
      OrderingBlockEditor.tsx       -- Add/remove items, set correct order
      FillBlankBlockEditor.tsx      -- Template with ___ markers, accepted answers
      FreeTextBlockEditor.tsx       -- Prompt + expected answer + threshold
      AudioBlockEditor.tsx          -- Prompt + expected answer (reuse audio pattern)
```

**Drag-and-drop library:** `@dnd-kit/core` + `@dnd-kit/sortable`
- Works with React 19 (verified via npm registry)
- Lightweight, tree-shakeable (~12KB gzipped)
- Keyboard accessible (WCAG 2.1 compliant)
- Supports drag-from-palette (toolbar to canvas) and reorder-within-canvas
- Better maintained than react-beautiful-dnd (deprecated) or react-dnd (heavier)

**State management for builder:** `useReducer` with action pattern, NOT XState.
- Builder state is CRUD on an ordered list of exercises -- much simpler than video player states
- Actions: ADD_EXERCISE, UPDATE_EXERCISE, REMOVE_EXERCISE, REORDER_EXERCISES, SET_METADATA
- Serialize reducer state directly to JSON for API persistence (no transformation needed)
- Undo/redo: optional, implement with state history stack in reducer

### Practice Player (Student-facing)

```
src/components/practice/
  player/
    PracticePlayer.tsx              -- Exercise navigation (prev/next/submit all)
    ExerciseRenderer.tsx            -- Polymorphic renderer dispatch by type
    PracticeResults.tsx             -- Summary screen after completion
    PracticeFeedback.tsx            -- Per-exercise feedback (extends existing FeedbackDisplay)
    renderers/
      MCQRenderer.tsx               -- Radio buttons (single) or checkboxes (multiple)
      MatchingRenderer.tsx          -- Drag-to-connect or dropdown matching
      OrderingRenderer.tsx          -- Drag-to-reorder list (@dnd-kit/sortable)
      FillBlankRenderer.tsx         -- Inline input fields in template text
      FreeTextRenderer.tsx          -- Wraps existing TextInteraction component
      AudioRenderer.tsx             -- Wraps existing AudioInteraction component
```

**Pattern reuse:** `FreeTextRenderer` and `AudioRenderer` import and wrap the existing `TextInteraction` and `AudioInteraction` components from `src/components/interactions/` and `src/components/audio/`. Those components already handle the full grade -> feedback -> retry loop. The practice renderers adapt the interface (map practice exercise props to interaction component props).

### Enhanced Chat Components

```
src/components/chat/
  ChatPanel.tsx         -- MODIFY: Add lessonId context, practice mode toggle
  ChatMessage.tsx       -- MODIFY: Detect tool-result exercise blocks, render inline widgets
  ChatWidget.tsx        -- MODIFY: Accept lessonId from page context
  ChineseAnnotation.tsx -- NO CHANGE
  InlineExercise.tsx    -- NEW: Wrapper that renders MCQ/fill-blank inline in chat bubbles
```

**Inline exercises in chat -- how it works:**

1. Enhanced `/api/chat` route adds a `generateExercise` tool alongside existing `searchKnowledgeBase` tool
2. AI calls `generateExercise({ type: "mcq", topic: "...", language: "cantonese" })` when student asks for practice
3. Tool returns a structured exercise definition (same shape as practice_exercises JSONB)
4. `ChatMessage` detects tool-result parts with type "exercise" and renders `InlineExercise`
5. Student interacts with the widget (selects MCQ option, fills blank, etc.)
6. Answer is sent as next user message for AI to provide follow-up
7. This extends the existing AI SDK `useChat` + `streamText` pattern -- no new streaming infrastructure

---

## Data Flow Diagrams

### Current Flow: Video Interactions (UNCHANGED)

```
Video plays -> Cue point hit -> XState pauses -> InteractionOverlay
  -> Student types/records -> /api/grade or /api/grade-audio -> n8n webhook
  -> GradingResponse returned -> FeedbackDisplay -> completeInteraction()
  -> Resume video -> progress.ts upsertLessonProgress()
```

### New Flow: Standalone Practice Sets

```
Student opens practice set -> PracticePlayer loads exercises from DB
  -> Renders ExerciseRenderer per exercise sequentially
  -> Student answers:
     MCQ/matching/ordering/fill-blank -> Client-side grading (instant, no API)
     free_text -> /api/practice/grade -> n8n webhook (same as /api/grade)
     audio -> /api/practice/grade -> n8n webhook (same as /api/grade-audio)
  -> Score + feedback displayed per exercise
  -> On set completion -> POST /api/practice/[setId]/attempts
  -> PracticeResults summary screen
  -> Coach views results in coach dashboard
```

### New Flow: Enhanced Chatbot

```
Student opens chat -> ChatPanel v2 (with lesson context if on lesson page)
  -> useChatbot sends { lessonId, practiceMode } in transport body
  -> /api/chat receives context -> builds lesson-aware system prompt
  -> AI has tools: searchKnowledgeBase (existing) + generateExercise (new)
  -> AI generates inline exercise when appropriate
  -> ChatMessage v2 renders InlineExercise widget
  -> Student answers in chat -> AI provides follow-up
```

### New Flow: Pronunciation Scoring

```
Student starts voice conversation -> useRealtimeConversation.connect(lessonId)
  -> /api/realtime/token generates ephemeral token (MODIFIED: include language pref)
  -> WebRTC session with OpenAI Realtime API
  -> Student speaks -> AI processes speech
  -> AI returns pronunciation score data via data channel event
  -> Hook extracts: overall score + per-character tone accuracy
  -> UI renders score visualization (new PronunciationScore component)
  -> Conversation continues
```

---

## Integration Points: What Changes in Existing Files

### Database (src/db/schema/)

| File | Change |
|------|--------|
| `index.ts` | Add `export * from "./practice"` |
| **NEW** `practice.ts` | All 4 new tables + 2 new enums |
| All other schema files | NO CHANGE |

### API Routes (src/app/api/)

| Route | Change |
|-------|--------|
| `/api/chat/route.ts` | Add `generateExercise` tool to `streamText` config |
| `/api/realtime/token/route.ts` | Pass `languagePreference` param from request body |
| **NEW** `/api/practice/route.ts` | GET list sets, POST create set |
| **NEW** `/api/practice/[setId]/route.ts` | GET/PUT/DELETE practice set |
| **NEW** `/api/practice/[setId]/exercises/route.ts` | POST add, PUT reorder |
| **NEW** `/api/practice/[setId]/exercises/[exerciseId]/route.ts` | PUT/DELETE |
| **NEW** `/api/practice/[setId]/assignments/route.ts` | GET/POST assignments |
| **NEW** `/api/practice/[setId]/attempts/route.ts` | POST start, GET list |
| **NEW** `/api/practice/[setId]/attempts/[attemptId]/route.ts` | PUT update, GET review |
| **NEW** `/api/practice/grade/route.ts` | POST grade free_text/audio (delegates to n8n) |
| All other API routes | NO CHANGE |

### Components (src/components/)

| Component | Change |
|-----------|--------|
| `chat/ChatPanel.tsx` | Add lessonId prop, practice mode toggle |
| `chat/ChatMessage.tsx` | Add inline exercise detection + rendering |
| `chat/ChatWidget.tsx` | Pass lessonId from page context |
| **NEW** `chat/InlineExercise.tsx` | Inline exercise widget for chat |
| **NEW** `practice/builder/*` | All builder components (~8 files) |
| **NEW** `practice/player/*` | All player components (~8 files) |
| **NEW** `voice/PronunciationScore.tsx` | Score visualization |
| All other components | NO CHANGE |

### Hooks (src/hooks/)

| Hook | Change |
|------|--------|
| `useChatbot.ts` | Add lessonId + practiceMode to transport body |
| `useRealtimeConversation.ts` | Handle pronunciation scoring events |
| **NEW** `usePracticeSet.ts` | Player state (current exercise, answers, score) |
| **NEW** `usePracticeBuilder.ts` | Builder state (exercises, drag, undo) |
| All other hooks | NO CHANGE |

### Lib (src/lib/)

| File | Change |
|------|--------|
| `lesson-context.ts` | Add practice set context to voice tutor instructions |
| `chat-utils.ts` | Add exercise generation utility |
| **NEW** `practice-grading.ts` | Client-side grading for MCQ, matching, ordering, fill-blank |
| **NEW** `practice-progress.ts` | Track practice completion (parallel to progress.ts) |
| **NEW** `exercise-schemas.ts` | Zod discriminated union schemas for JSONB definitions |
| All other lib files | NO CHANGE |

### Pages (src/app/(dashboard)/)

| Page | Change |
|------|--------|
| `lessons/[lessonId]/page.tsx` | Add "Practice Sets" section showing assigned sets |
| `coach/page.tsx` | Add practice set stats to dashboard |
| **NEW** `practice/page.tsx` | Student practice set list |
| **NEW** `practice/[setId]/page.tsx` | Student practice player |
| **NEW** `coach/practice/page.tsx` | Coach practice set list |
| **NEW** `coach/practice/new/page.tsx` | Coach create practice set (builder) |
| **NEW** `coach/practice/[setId]/page.tsx` | Coach edit practice set (builder) |
| **NEW** `coach/practice/[setId]/results/page.tsx` | Coach view student results |
| **NEW** `admin/practice/page.tsx` | Admin manage all practice sets |

### Layout (src/app/layout.tsx)

**Custom font loading:**
```typescript
import localFont from 'next/font/local';

const hanziPinyin = localFont({
  src: '../fonts/HanziPinyin.ttf',
  variable: '--font-hanzi-pinyin',
  display: 'swap',
});

const cantoneseVisual = localFont({
  src: '../fonts/CantoneseVisual.ttf',
  variable: '--font-cantonese-visual',
  display: 'swap',
});

// Apply to body
<body className={`${inter.variable} ${hanziPinyin.variable} ${cantoneseVisual.variable} ...`}>
```

Font switching based on user language preference uses CSS classes that reference the CSS variables. The existing `useLanguagePreference` hook provides the switching signal.

---

## Patterns to Follow

### Pattern 1: Polymorphic Exercise Rendering (Discriminated Union)

**What:** Dispatch to the correct component based on the `type` field. Mirrors the existing pattern where `InteractiveVideoPlayer` dispatches to `TextInteraction` vs `AudioInteraction` based on `activeInteraction.type`.

**When:** Anywhere an exercise needs to be rendered (builder blocks, player renderers, chat inline widgets).

```typescript
type ExerciseDefinition =
  | { type: "mcq"; options: MCQOption[]; allowMultiple: boolean }
  | { type: "matching"; pairs: MatchingPair[] }
  | { type: "ordering"; items: OrderingItem[] }
  | { type: "fill_blank"; template: string; blanks: Blank[] }
  | { type: "free_text"; expectedAnswer: string; correctThreshold: number }
  | { type: "audio"; expectedAnswer: string; correctThreshold: number };

function ExerciseRenderer({ exercise, onAnswer }: Props) {
  switch (exercise.type) {
    case "mcq": return <MCQRenderer {...exercise} onAnswer={onAnswer} />;
    case "matching": return <MatchingRenderer {...exercise} onAnswer={onAnswer} />;
    // ... etc
  }
}
```

### Pattern 2: Client-side Grading for Deterministic Exercises

**What:** Grade MCQ, matching, ordering, and fill-in-blank entirely on the client. Only free_text and audio need server-side AI grading via n8n webhooks.

**Why:** These exercises have objectively correct answers encoded in the JSONB definition. No AI needed. Instant feedback with zero latency. Reduces server load and n8n webhook costs.

```typescript
// src/lib/practice-grading.ts
function gradeMCQ(selectedIds: string[], definition: MCQDefinition): GradingResult {
  const correctIds = definition.options.filter(o => o.isCorrect).map(o => o.id);
  const isCorrect = arraysEqual(selectedIds.sort(), correctIds.sort());
  return { isCorrect, score: isCorrect ? 100 : 0, feedback: "..." };
}

function gradeMatching(pairs: UserPair[], definition: MatchingDefinition): GradingResult { ... }
function gradeOrdering(order: string[], definition: OrderingDefinition): GradingResult { ... }
function gradeFillBlank(answers: string[], definition: FillBlankDefinition): GradingResult { ... }
```

### Pattern 3: Reuse n8n Grading Pipeline for AI Exercises

**What:** Practice exercises of type `free_text` and `audio` flow through the same n8n webhooks as existing video interactions.

**Why:** The n8n webhook pattern is established and working. The prompt management system (`getPrompt` with database-stored templates) supports customization. Creating a parallel direct-to-OpenAI grading path would duplicate logic.

**Implementation:** `/api/practice/grade` delegates to `N8N_GRADING_WEBHOOK_URL` (text) or `N8N_AUDIO_GRADING_WEBHOOK_URL` (audio) with the same `GradingRequest`/`AudioGradingRequest` payload shape from `src/lib/grading.ts`.

### Pattern 4: JSONB + Zod Validation

**What:** Store exercise definitions as JSON text in Postgres. Validate with Zod discriminated unions in application code. Same pattern as existing `kbChunks.metadata` and prompt template variables.

```typescript
// src/lib/exercise-schemas.ts
export const exerciseDefinitionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mcq"),
    options: z.array(z.object({
      id: z.string(),
      text: z.string().min(1),
      isCorrect: z.boolean(),
    })).min(2).max(10),
    allowMultiple: z.boolean().default(false),
    explanation: z.string().optional(),
  }),
  z.object({
    type: z.literal("matching"),
    pairs: z.array(z.object({
      id: z.string(),
      left: z.string().min(1),
      right: z.string().min(1),
    })).min(2).max(10),
  }),
  // ... other types
]);
```

### Pattern 5: Extend Chat with Tool Calls (Existing Pattern)

**What:** Add `generateExercise` tool to the chat API alongside existing `searchKnowledgeBase`. Follows the exact same AI SDK `streamText` tool pattern.

```typescript
// In /api/chat/route.ts
tools: {
  searchKnowledgeBase: { /* existing */ },
  generateExercise: {
    description: "Generate a practice exercise for the student based on the current lesson topic",
    inputSchema: z.object({
      type: z.enum(["mcq", "fill_blank"]),
      topic: z.string(),
      language: z.enum(["cantonese", "mandarin", "both"]),
      difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
    }),
    execute: async ({ type, topic, language, difficulty }) => {
      // AI generates exercise definition
      return generateExerciseFromTopic(type, topic, language, difficulty);
    },
  },
},
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Overloading the Interactions Table

**What:** Adding MCQ/matching/ordering to the `interaction_type` enum and storing practice exercises in the `interactions` table.

**Why bad:**
- `interactions.timestamp` is NOT NULL integer (video seconds) -- practice exercises have no timestamp
- `interactions.lessonId` is NOT NULL FK -- practice sets can be assigned to modules, courses, or students directly
- `interactionAttempts` stores flat `response` text -- MCQ answers, matching pairs, ordering sequences need JSONB
- `lessonProgress.interactionsCompleted` counter would conflate video interactions with practice exercises
- The `CuePoint` and `InteractionCuePoint` TypeScript types assume video timestamps
- The XState `videoPlayerMachine` consumes cue points based on interaction data

**Instead:** Separate `practice_exercises` table with its own `exercise_type` enum and `practice_attempts` table.

### Anti-Pattern 2: Separate Grading Service for Practice

**What:** Building a new direct-to-OpenAI grading endpoint for practice free_text/audio exercises instead of using the n8n webhook pipeline.

**Why bad:** Duplicates grading logic, prompt management, error handling, rate limiting, and submission capture. When prompts need updating, there are two systems to change. Loses n8n workflow flexibility.

**Instead:** Reuse the same n8n webhook endpoints. `/api/practice/grade` produces the same `GradingRequest` payload shape and calls the same webhook URLs.

### Anti-Pattern 3: Custom Drag-and-Drop Implementation

**What:** Building DnD from scratch using HTML5 Drag API or pointer events.

**Why bad:** DnD is deceptively complex (keyboard accessibility, touch support, scroll during drag, nested drop targets, auto-scroll, visual feedback). Custom implementations miss edge cases and accessibility requirements.

**Instead:** Use `@dnd-kit/core` + `@dnd-kit/sortable`. Consistent with the project's approach of using well-maintained libraries (framer-motion, radix-ui, react-hook-form, xstate).

### Anti-Pattern 4: XState for Practice Player

**What:** Creating an XState machine for the practice set player state.

**Why bad:** XState is appropriate for the video player because it has complex state transitions with side effects (idle -> playing -> pausedForInteraction -> playing, with volume fading, cue point detection, etc.). The practice player is a simple linear sequence: answer exercise 1 -> answer exercise 2 -> ... -> show results. `useReducer` handles this cleanly.

**Instead:** `useReducer` with state shape `{ currentIndex, answers: Map<exerciseId, answer>, score }`.

### Anti-Pattern 5: Modifying Progress Tracking for Practice

**What:** Adding practice set completion to the existing `lessonProgress` table and `checkLessonCompletion` function.

**Why bad:** Lesson completion is currently: video watched 95% + all interactions passed = lesson complete. Adding practice sets to this formula would make lesson completion dependent on homework, which may not be desired (practice sets are supplementary).

**Instead:** Separate `practice_attempts` table and `practice-progress.ts` utility. Practice completion is tracked independently. If the project later wants to gate lesson progression on practice completion, that can be added as an optional configuration per practice set assignment.

---

## Suggested Build Order

The build order follows dependency chains and provides value incrementally.

### Phase 1: Foundation -- Fonts + Voice Fix (no dependencies)
**Rationale:** Quick wins, no dependencies on other features. Fonts affect all UI and should be loaded before building new components. Voice fix is isolated bug fix.
- Custom font loading in `layout.tsx` via `next/font/local`
- Voice AI language preference bug fix in `lesson-context.ts`
- Font switching CSS based on `useLanguagePreference`

### Phase 2: Practice Data Model + Admin CRUD (foundation for everything else)
**Rationale:** Database tables and Zod schemas are required before builder or player can be built. Admin CRUD provides basic management while builder is developed.
- `src/db/schema/practice.ts` with all 4 tables + enums
- Drizzle migration
- `src/lib/exercise-schemas.ts` (Zod discriminated unions)
- API routes: `/api/practice/*` (CRUD)
- Basic admin practice set list page (table view, not builder yet)

### Phase 3: Exercise Renderers + Student Practice Player (builds on Phase 2)
**Rationale:** Renderers are needed by both the student player AND the builder preview. Build them standalone first.
- Polymorphic `ExerciseRenderer` with all 6 type renderers
- `src/lib/practice-grading.ts` (client-side grading for 4 deterministic types)
- `/api/practice/grade` route (server-side grading for free_text/audio via n8n)
- `PracticePlayer` component with exercise navigation
- `PracticeResults` summary screen
- Student `/practice` and `/practice/[setId]` pages
- `src/lib/practice-progress.ts` + `src/hooks/usePracticeSet.ts`

### Phase 4: Drag-and-Drop Practice Builder (builds on Phases 2 + 3)
**Rationale:** Requires data model (Phase 2) and exercise renderers (Phase 3 for live preview). Most complex new UI component.
- Install `@dnd-kit/core` + `@dnd-kit/sortable`
- `PracticeSetBuilder` canvas with drag-from-palette and reorder
- All 6 `ExerciseBlockEditor` components
- `BuilderPreview` panel (reuses Phase 3 renderers)
- Coach `/coach/practice/*` pages
- `src/hooks/usePracticeBuilder.ts`

### Phase 5: Practice Set Assignments (builds on Phases 2 + 3)
**Rationale:** Requires practice sets to exist and the student player to be built.
- Assignment API routes
- Coach assignment UI (assign to lesson, module, course, student, tag)
- Student dashboard integration (show assigned practice sets)
- Lesson page integration (`/lessons/[lessonId]` shows related practice sets)
- Due date display and filtering

### Phase 6: Enhanced Chatbot (builds on Phase 3 renderers)
**Rationale:** Leverages exercise renderers from Phase 3 for inline chat widgets. Otherwise independent.
- Add `generateExercise` tool to `/api/chat/route.ts`
- Lesson-context-aware system prompt (pass lessonId from ChatWidget)
- `InlineExercise` component for chat messages
- Modify `ChatMessage` to detect and render exercise tool results
- Practice mode toggle in `ChatPanel`

### Phase 7: Pronunciation Scoring (builds on Phase 1 voice fix)
**Rationale:** Most complex integration (WebRTC + scoring visualization). Depends on Phase 1 voice fix. Can be built independently from practice sets.
- Pronunciation scoring data extraction from Realtime API events
- `PronunciationScore` visualization component (overall + per-character)
- Conversation history review page
- Suggested practice topics per lesson based on conversation analysis
- Canto-to-Mando pedagogical awareness in system prompts

---

## Scalability Considerations

| Concern | At 100 students | At 1K students | At 10K students |
|---------|----------------|----------------|-----------------|
| Practice attempts storage | JSONB answers fine | Fine | Consider separate answers table for analytics |
| Exercise grading load | Client-side for 4/6 types | Same | Same (no server for deterministic) |
| AI grading (free_text/audio) | n8n webhook fine | May need queue | Queue + rate limiting essential |
| Practice set definitions | Direct DB reads | Cache in RSC | Edge caching |
| Builder state | Client-side reducer | Same | Same (single user editing) |
| Chat exercise generation | Inline in stream | Fine | Fine (per-user, not bulk) |
| Font files | next/font/local with swap | Same | Same (browser cached) |

---

## Sources

- Direct codebase analysis: `src/db/schema/*.ts` (18 files), `src/components/**/*.tsx` (30+ files), `src/app/api/**/*.ts` (all routes), `src/lib/*.ts`, `src/hooks/*.ts`
- Existing established patterns: interaction types (text/audio dispatch), grading pipeline (n8n webhooks), chat tools (AI SDK streamText), progress tracking (upsertLessonProgress), prompt management (getPrompt with templates)
- @dnd-kit: React drag-and-drop library for practice builder
- next/font/local: Next.js custom font loading API for Chinese annotation fonts
- AI SDK tool pattern: Extending `streamText` tools config for chat exercise generation
