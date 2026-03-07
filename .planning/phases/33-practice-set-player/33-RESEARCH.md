# Phase 33: Practice Set Player - Research

**Researched:** 2026-02-07
**Domain:** Student-facing interactive exercise player with client-side and server-side grading
**Confidence:** HIGH

## Summary

Phase 33 builds the student-facing practice set player: a sequential exercise runner that renders all 6 exercise types interactively, grades deterministic exercises instantly on the client, delegates free-text and audio exercises to the existing n8n webhook pipeline, provides per-exercise feedback and a final results summary, supports retries, and persists attempt data for coach review.

The codebase is extremely well-positioned for this phase. The database schema (`practice_sets`, `practice_exercises`, `practice_attempts` tables) is already created in Phase 31. Exercise definitions are stored as typed JSONB. The `ExercisePreview` component (admin read-only) provides the rendering structure to adapt into interactive renderers. The existing `useAudioRecorder` hook handles cross-browser audio recording. The existing `/api/grade` and `/api/grade-audio` routes provide the n8n webhook delegation pattern. `FeedbackDisplay` provides the grading feedback UI pattern. The `@radix-ui/react-progress` Progress component is already installed for the progress bar.

**Primary recommendation:** Build 6 interactive exercise renderer components (adapted from ExercisePreview), a `practice-grading.ts` client-side grading library, a new `/api/practice/grade` route for AI exercises, a `usePracticePlayer` hook for player state management, and compose everything into a `PracticePlayer` client component with `PracticeResults` summary screen.

## Standard Stack

The player requires NO new package installations. Everything needed is already in the project.

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | 19.2.3 | Component rendering | Already installed, useReducer for player state |
| Next.js 16 | 16.1.4 | App Router pages, API routes | Already installed, server component for data loading |
| Drizzle ORM | 0.45.1 | Database queries for practice sets/exercises/attempts | Already installed |
| Framer Motion | 12.29.2 | Animated transitions between exercises, feedback | Already installed, used in FeedbackDisplay, InteractionOverlay |
| @radix-ui/react-progress | 1.1.8 | Progress bar for exercise navigation | Already installed as shadcn Progress component |
| Zod | 4.3.6 | Exercise definition validation | Already installed, schemas exist in types/exercises.ts |
| React Hook Form | 7.71.1 | Free text form validation | Already installed, used in exercise CRUD forms |
| lucide-react | 0.563.0 | Icons (check, x, mic, arrow, etc.) | Already installed |

### Supporting (Already Installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | 4.1.0 | Format attempt duration | Already installed, for elapsed time display |
| nanoid | 5.1.6 | Generate unique IDs for exercise responses | Already installed |
| @dnd-kit/react | 0.2.3 | Drag-and-drop for matching/ordering renderers | Already installed from builder phase |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| useReducer for player state | XState state machine | XState is installed but overkill for a linear stepper; useReducer with a simple state object is the project pattern for non-video state management (see useBuilderState) |
| @dnd-kit for matching/ordering | Click-based selection | DnD is already installed and gives better UX; click-based is simpler but less engaging for a practice exercise |
| Framer Motion for transitions | CSS transitions | Framer Motion already used extensively; consistent animation pattern across the app |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/practice/
│   └── player/
│       ├── PracticePlayer.tsx           # Main player shell (navigation, progress, state)
│       ├── ExerciseRenderer.tsx          # Polymorphic dispatch by exercise type
│       ├── PracticeResults.tsx           # End-of-set summary screen
│       ├── PracticeFeedback.tsx          # Per-exercise feedback panel
│       └── renderers/
│           ├── MultipleChoiceRenderer.tsx
│           ├── FillInBlankRenderer.tsx
│           ├── MatchingRenderer.tsx
│           ├── OrderingRenderer.tsx
│           ├── AudioRecordingRenderer.tsx
│           └── FreeTextRenderer.tsx
├── hooks/
│   └── usePracticePlayer.ts             # Player state management hook
├── lib/
│   └── practice-grading.ts              # Client-side grading for 4 deterministic types
├── app/
│   ├── api/practice/
│   │   ├── [setId]/
│   │   │   ├── route.ts                 # GET practice set + exercises (student-facing)
│   │   │   └── attempts/
│   │   │       └── route.ts             # POST create attempt, GET list attempts
│   │   └── grade/
│   │       └── route.ts                 # POST grade free_text/audio via n8n
│   └── (dashboard)/practice/
│       └── [setId]/
│           └── page.tsx                 # Student practice set player page
```

### Pattern 1: Client-Side Grading for Deterministic Exercises (Confidence: HIGH)

**What:** Grade multiple_choice, fill_in_blank, matching, and ordering exercises entirely on the client. Only free_text and audio_recording need server round-trips.

**When to use:** Always for these 4 types. The correct answers are embedded in the JSONB definition.

**Example:**
```typescript
// src/lib/practice-grading.ts
// Source: Codebase pattern from ARCHITECTURE.md + exercise type definitions in types/exercises.ts

interface GradeResult {
  isCorrect: boolean;
  score: number; // 0-100
  feedback: string;
  explanation?: string;
}

// MCQ: Check if selected option ID matches correctOptionId
function gradeMultipleChoice(
  selectedOptionId: string,
  definition: MultipleChoiceDefinition
): GradeResult {
  const isCorrect = selectedOptionId === definition.correctOptionId;
  const correctOption = definition.options.find(o => o.id === definition.correctOptionId);
  return {
    isCorrect,
    score: isCorrect ? 100 : 0,
    feedback: isCorrect
      ? "Correct!"
      : `The correct answer was: ${correctOption?.text}`,
    explanation: definition.explanation,
  };
}

// Fill-in-blank: Check each blank against correctAnswer + acceptableAnswers
function gradeFillInBlank(
  answers: string[],
  definition: FillInBlankDefinition
): GradeResult {
  let correct = 0;
  for (let i = 0; i < definition.blanks.length; i++) {
    const blank = definition.blanks[i];
    const answer = answers[i]?.trim().toLowerCase();
    const acceptable = [blank.correctAnswer, ...(blank.acceptableAnswers || [])];
    if (acceptable.some(a => a.trim().toLowerCase() === answer)) correct++;
  }
  const score = Math.round((correct / definition.blanks.length) * 100);
  return {
    isCorrect: score === 100,
    score,
    feedback: score === 100 ? "All blanks correct!" : `${correct}/${definition.blanks.length} blanks correct`,
    explanation: definition.explanation,
  };
}

// Matching: Check if all pairs are matched correctly
function gradeMatching(
  userPairs: { leftId: string; rightId: string }[],
  definition: MatchingDefinition
): GradeResult {
  let correct = 0;
  for (const userPair of userPairs) {
    const defPair = definition.pairs.find(p => p.id === userPair.leftId);
    if (defPair && defPair.id === userPair.rightId) correct++;
  }
  // Alternative: match by pair ID correlation
  const score = Math.round((correct / definition.pairs.length) * 100);
  return { isCorrect: score === 100, score, feedback: "...", explanation: definition.explanation };
}

// Ordering: Check if items are in correctPosition order
function gradeOrdering(
  orderedItemIds: string[],
  definition: OrderingDefinition
): GradeResult {
  let correct = 0;
  for (let i = 0; i < orderedItemIds.length; i++) {
    const item = definition.items.find(it => it.id === orderedItemIds[i]);
    if (item && item.correctPosition === i) correct++;
  }
  const score = Math.round((correct / definition.items.length) * 100);
  return { isCorrect: score === 100, score, feedback: "...", explanation: definition.explanation };
}
```

### Pattern 2: Player State Machine with useReducer (Confidence: HIGH)

**What:** Manage the player's navigation, responses, grading results, and timing state with `useReducer`. Mirrors the `useBuilderState` pattern already in the codebase.

**When to use:** The player hook manages: current exercise index, per-exercise responses, per-exercise grading results, start/end timestamps, and retry state.

**Example:**
```typescript
// src/hooks/usePracticePlayer.ts
interface PlayerState {
  exercises: PracticeExercise[];
  currentIndex: number;
  responses: Record<string, unknown>;        // exerciseId -> student response data
  results: Record<string, GradeResult>;       // exerciseId -> grading result
  status: "in_progress" | "completed";
  startedAt: Date;
  completedAt: Date | null;
}

type PlayerAction =
  | { type: "SUBMIT_ANSWER"; exerciseId: string; response: unknown; result: GradeResult }
  | { type: "NEXT_EXERCISE" }
  | { type: "PREV_EXERCISE" }
  | { type: "JUMP_TO"; index: number }
  | { type: "COMPLETE" }
  | { type: "RETRY_EXERCISE"; exerciseId: string }
  | { type: "RETRY_ALL" };
```

### Pattern 3: Polymorphic Exercise Renderer (Confidence: HIGH)

**What:** A switch/dispatch component that renders the correct interactive renderer based on exercise type. Adapted from the existing `ExercisePreview` pattern but with interactivity (inputs, selections, drag-and-drop).

**When to use:** In the PracticePlayer for each exercise.

**Example:**
```typescript
// src/components/practice/player/ExerciseRenderer.tsx
function ExerciseRenderer({ exercise, onSubmit, disabled }: Props) {
  const def = exercise.definition as ExerciseDefinition;
  switch (def.type) {
    case "multiple_choice":
      return <MultipleChoiceRenderer definition={def} language={exercise.language} onSubmit={onSubmit} disabled={disabled} />;
    case "fill_in_blank":
      return <FillInBlankRenderer definition={def} language={exercise.language} onSubmit={onSubmit} disabled={disabled} />;
    // ... etc
  }
}
```

### Pattern 4: Reuse n8n Grading Pipeline (Confidence: HIGH)

**What:** Create a new `/api/practice/grade` route that delegates to the same n8n webhook URLs as `/api/grade` and `/api/grade-audio`. Uses the same `GradingResponse`/`AudioGradingResponse` types.

**When to use:** For free_text and audio_recording exercises only. The route needs to handle both text and audio grading, switching based on the exercise type.

**Key differences from existing `/api/grade`:**
- Does NOT require an `interactionId` (practice exercises are not video interactions)
- May accept a `practiceExerciseId` instead
- Same n8n webhook URLs and payload shapes
- Does NOT capture to `submissions` table (captures to `practice_attempts.results` instead)

### Pattern 5: Attempt Persistence (Confidence: HIGH)

**What:** Store each practice set attempt in the `practice_attempts` table. The `results` JSONB column stores per-exercise results keyed by exercise ID.

**Schema (already exists):**
```typescript
// From src/db/schema/practice.ts
practiceAttempts = pgTable("practice_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  practiceSetId: uuid("practice_set_id").notNull().references(() => practiceSets.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  score: integer("score"),                    // 0-100 overall
  totalExercises: integer("total_exercises").notNull(),
  correctCount: integer("correct_count").notNull().default(0),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  results: jsonb("results").$type<Record<string, { score: number; isCorrect: boolean; response: string }>>(),
});
```

### Anti-Patterns to Avoid

- **Server-grading deterministic exercises:** MCQ, matching, ordering, fill-blank have correct answers in the JSONB definition. Sending these to the server wastes time and adds latency for no benefit.
- **Self-fetching API routes from server components:** This project has a documented bug pattern (progress.ts:152) where server components call their own API routes and don't forward auth cookies. Always query DB directly in server components.
- **Storing responses in localStorage:** All attempt data must be in Postgres for coach review. Use the `practice_attempts` table.
- **Custom progress bar implementation:** Use the existing `<Progress>` shadcn component from `@radix-ui/react-progress`.
- **Building matching/ordering without DnD:** @dnd-kit is already installed. Use it for the interactive matching and ordering renderers for consistency with the builder.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress bar | Custom div with width transitions | `<Progress>` from `src/components/ui/progress.tsx` | Already installed, accessible, themed |
| Audio recording | Custom MediaRecorder code | `useAudioRecorder` from `src/hooks/useAudioRecorder.ts` | Cross-browser, error handling, cleanup, 60s max |
| Grading feedback display | Custom feedback card | Adapt `FeedbackDisplay` from `src/components/interactions/FeedbackDisplay.tsx` | Already styled, animated, handles correct/incorrect |
| Drag-and-drop for matching/ordering | Custom pointer event handlers | @dnd-kit/react (already installed) | Complex touch support, accessibility, animation |
| Shuffle algorithm | Math.random() | Deterministic seeded PRNG from `ExercisePreview.tsx` shuffleArray | Prevents re-render flicker, consistent display |
| Chinese text phonetics | Manual ruby annotations | `<PhoneticText>` from `src/components/phonetic/PhoneticText.tsx` | Automatic font switching based on user language preference |
| Animation transitions | CSS or manual state | Framer Motion `AnimatePresence` + `motion.div` | Already used in 15+ components throughout codebase |
| Time formatting | Manual string building | `date-fns` (already installed) | `formatDuration`, `differenceInSeconds` |
| Auth checking | Manual Clerk calls | `getCurrentUser()` from `src/lib/auth.ts` | Existing pattern that maps Clerk ID to internal user ID |

**Key insight:** The admin ExercisePreview component renders all 6 exercise types in read-only mode with the exact UI students will see. Each renderer in Phase 33 starts as a copy of the corresponding ExercisePreview sub-renderer but adds interactivity (onClick handlers, input fields, drag-and-drop targets, audio recording controls, submit buttons).

## Common Pitfalls

### Pitfall 1: Matching Renderer Needs Bidirectional State Tracking
**What goes wrong:** Matching exercises require tracking which left item is connected to which right item. Naive implementations only track one direction, leading to duplicate matches or orphaned items.
**Why it happens:** The definition stores `pairs[].left` and `pairs[].right` but the student sees shuffled columns. The renderer must track the full mapping.
**How to avoid:** Use a `Map<leftId, rightId>` state. When a student connects left[i] to right[j], remove any existing mapping for left[i] AND any existing mapping where the value is right[j]. Display visual connections (lines or color-coding).
**Warning signs:** Student can match the same right item to multiple left items, or unmatch doesn't clear properly.

### Pitfall 2: Audio Grading Has Different Payload Shape
**What goes wrong:** The existing `/api/grade` accepts JSON with `interactionId`. The `/api/grade-audio` accepts FormData with an audio File. Practice exercises don't have an `interactionId`.
**Why it happens:** Practice exercises exist in a different table. The n8n webhook doesn't actually require `interactionId` -- it's used for logging/lookup in the LMS, not by n8n.
**How to avoid:** Create a dedicated `/api/practice/grade` route that accepts both text and audio grading, using `practiceExerciseId` instead of `interactionId`. Preserve the same webhook URL delegation pattern.
**Warning signs:** 400 errors from missing `interactionId` field when grading practice exercises.

### Pitfall 3: Race Condition on Rapid Exercise Navigation
**What goes wrong:** If a student submits an answer and immediately clicks "Next", the grading result may arrive after they've already moved to the next exercise, overwriting the wrong exercise's feedback.
**Why it happens:** Client-side grading is synchronous (instant), but AI grading is async (1-3 seconds for n8n webhook).
**How to avoid:** Disable the "Next" button while AI grading is in progress. Only enable navigation after the grading response arrives. For client-side graded exercises, this is instant and not an issue.
**Warning signs:** Feedback appears on the wrong exercise, or results summary has missing entries.

### Pitfall 4: Ordering Renderer Must Distinguish Display Order from Correct Order
**What goes wrong:** The ordering exercise definition has `items[].correctPosition` which is the correct position (0-indexed). The renderer must shuffle items for display but track the student's reordered positions separately.
**Why it happens:** Confusion between the shuffled display array indices and the `correctPosition` field used for grading.
**How to avoid:** Shuffle items on mount (use the deterministic shuffle from ExercisePreview). Track the student's current ordering as an array of item IDs. On submit, compare each item ID's position in the student array against its `correctPosition`.
**Warning signs:** Grading always returns 100% because the array wasn't shuffled, or always 0% because indices are compared against wrong values.

### Pitfall 5: Fill-in-Blank Must Handle Case-Insensitive Comparison
**What goes wrong:** Student types "hello" but correctAnswer is "Hello" -- marked wrong.
**Why it happens:** Strict string comparison without normalization.
**How to avoid:** Normalize both student answer and acceptable answers with `.trim().toLowerCase()` before comparison. For Chinese characters, also handle full-width vs half-width punctuation differences.
**Warning signs:** Students report correct answers being marked wrong.

### Pitfall 6: Attempt Score Calculation Timing
**What goes wrong:** The attempt record is created with `score: null` at the start, but the score must be calculated AFTER all exercises are graded (some may be async AI-graded).
**Why it happens:** Mixed sync/async grading within the same practice set.
**How to avoid:** Create the attempt record at start with `score: null, completedAt: null`. Update it with the final score only when ALL exercises have been graded and the student reaches the results screen. Calculate: `score = Math.round((correctCount / totalExercises) * 100)`.
**Warning signs:** Attempt records stuck with null scores, or scores that don't include AI-graded exercises.

## Code Examples

### Example 1: Student-Facing Practice Set Page (Server Component)
```typescript
// src/app/(dashboard)/practice/[setId]/page.tsx
// Source: Follows builder page pattern from src/app/(dashboard)/admin/practice-sets/[setId]/builder/page.tsx

import { redirect, notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { practiceSets, practiceExercises, users } from "@/db/schema";
import { eq, and, isNull, asc } from "drizzle-orm";
import { PracticePlayerClient } from "./PracticePlayerClient";

export default async function PracticePlayerPage({ params }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const { setId } = await params;

  // Direct DB query (no self-fetch anti-pattern)
  const practiceSet = await db.query.practiceSets.findFirst({
    where: and(
      eq(practiceSets.id, setId),
      eq(practiceSets.status, "published"),
      isNull(practiceSets.deletedAt)
    ),
  });
  if (!practiceSet) notFound();

  const exercises = await db
    .select()
    .from(practiceExercises)
    .where(and(
      eq(practiceExercises.practiceSetId, setId),
      isNull(practiceExercises.deletedAt)
    ))
    .orderBy(asc(practiceExercises.sortOrder));

  // Get internal user ID for attempt creation
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });

  return (
    <PracticePlayerClient
      practiceSet={practiceSet}
      exercises={exercises}
      userId={dbUser?.id ?? ""}
    />
  );
}
```

### Example 2: Multiple Choice Interactive Renderer
```typescript
// src/components/practice/player/renderers/MultipleChoiceRenderer.tsx
// Source: Adapted from ExercisePreview MultipleChoicePreview

"use client";
import { useState } from "react";
import { PhoneticText } from "@/components/phonetic/PhoneticText";
import type { MultipleChoiceDefinition } from "@/types/exercises";

interface Props {
  definition: MultipleChoiceDefinition;
  language: "cantonese" | "mandarin" | "both";
  onSubmit: (response: { selectedOptionId: string }) => void;
  disabled?: boolean;
}

export function MultipleChoiceRenderer({ definition, language, onSubmit, disabled }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const forceLanguage = language === "cantonese" ? "cantonese" : language === "mandarin" ? "mandarin" : undefined;

  return (
    <div className="space-y-4">
      <p className="text-lg font-medium text-zinc-100">
        <PhoneticText forceLanguage={forceLanguage}>{definition.question}</PhoneticText>
      </p>
      <div className="space-y-2">
        {definition.options.map((option) => (
          <button
            key={option.id}
            disabled={disabled}
            onClick={() => setSelected(option.id)}
            className={`w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left transition
              ${selected === option.id
                ? "bg-blue-600/30 border-2 border-blue-500 text-white"
                : "bg-zinc-800 border-2 border-transparent text-zinc-300 hover:bg-zinc-700"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <div className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center
              ${selected === option.id ? "border-blue-500 bg-blue-500" : "border-zinc-500"}`}>
              {selected === option.id && <div className="h-2 w-2 rounded-full bg-white" />}
            </div>
            <span><PhoneticText forceLanguage={forceLanguage}>{option.text}</PhoneticText></span>
          </button>
        ))}
      </div>
      <button
        onClick={() => selected && onSubmit({ selectedOptionId: selected })}
        disabled={!selected || disabled}
        className="mt-4 rounded-lg bg-blue-600 px-6 py-2 text-white font-medium disabled:opacity-50"
      >
        Submit Answer
      </button>
    </div>
  );
}
```

### Example 3: Practice Attempt API Route
```typescript
// src/app/api/practice/[setId]/attempts/route.ts
// Source: Follows existing practice API pattern

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { practiceAttempts, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

// POST: Create or update an attempt
export async function POST(request: NextRequest, { params }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { setId } = await params;
  const body = await request.json();
  const { totalExercises, correctCount, score, results, completedAt } = body;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [attempt] = await db
    .insert(practiceAttempts)
    .values({
      practiceSetId: setId,
      userId: dbUser.id,
      totalExercises,
      correctCount,
      score,
      results,
      completedAt: completedAt ? new Date(completedAt) : null,
    })
    .returning();

  return NextResponse.json({ attempt }, { status: 201 });
}
```

### Example 4: Client-Side Grading Usage in Player
```typescript
// Inside PracticePlayer.tsx or usePracticePlayer.ts

async function handleSubmit(exerciseId: string, response: unknown) {
  const exercise = exercises.find(e => e.id === exerciseId);
  const def = exercise.definition as ExerciseDefinition;

  let result: GradeResult;

  // Deterministic exercises: grade client-side (instant)
  if (def.type === "multiple_choice") {
    result = gradeMultipleChoice(response.selectedOptionId, def);
  } else if (def.type === "fill_in_blank") {
    result = gradeFillInBlank(response.answers, def);
  } else if (def.type === "matching") {
    result = gradeMatching(response.pairs, def);
  } else if (def.type === "ordering") {
    result = gradeOrdering(response.orderedIds, def);
  }
  // AI-graded exercises: call server
  else if (def.type === "free_text") {
    const res = await fetch("/api/practice/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exerciseId,
        type: "free_text",
        studentResponse: response.text,
        definition: def,
      }),
    });
    result = await res.json();
  }
  else if (def.type === "audio_recording") {
    const formData = new FormData();
    formData.append("audio", response.audioBlob);
    formData.append("exerciseId", exerciseId);
    formData.append("type", "audio_recording");
    formData.append("targetPhrase", def.targetPhrase);
    formData.append("language", exercise.language);

    const res = await fetch("/api/practice/grade", {
      method: "POST",
      body: formData,
    });
    result = await res.json();
  }

  dispatch({ type: "SUBMIT_ANSWER", exerciseId, response, result });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Server-grade all exercises | Client-grade deterministic, server-grade AI | Pattern from ARCHITECTURE.md | Zero latency for 4 of 6 types |
| localStorage for responses | DB persistence via practice_attempts JSONB | Phase 31 schema | Coach can review all attempts |
| Static quiz pages | Sequential player with animated transitions | Modern UX pattern | More engaging practice experience |
| Text-only feedback | Rich feedback with corrections + hints + explanation | Existing FeedbackDisplay pattern | Better learning outcomes |

**Deprecated/outdated:**
- No deprecated patterns apply. This is greenfield within the established codebase.

## Key Codebase Artifacts to Reuse/Reference

### Existing Components
| Component | Path | How to Reuse |
|-----------|------|-------------|
| ExercisePreview | `src/components/admin/exercises/ExercisePreview.tsx` | Base rendering logic for all 6 types; add interactivity |
| FeedbackDisplay | `src/components/interactions/FeedbackDisplay.tsx` | Adapt for practice feedback (same GradingFeedback type) |
| PhoneticText | `src/components/phonetic/PhoneticText.tsx` | Wrap Chinese text in renderers |
| Progress | `src/components/ui/progress.tsx` | Exercise progress bar |
| ErrorAlert | `src/components/ui/error-alert.tsx` | Error states in player |

### Existing Hooks
| Hook | Path | How to Reuse |
|------|------|-------------|
| useAudioRecorder | `src/hooks/useAudioRecorder.ts` | Audio exercise recording |
| useLanguagePreference | `src/hooks/useLanguagePreference.ts` | Filter exercises by language, set font |
| useBuilderState | `src/hooks/useBuilderState.ts` | Pattern reference for useReducer state management |

### Existing Libraries
| Library | Path | How to Reuse |
|---------|------|-------------|
| practice.ts | `src/lib/practice.ts` | DB query helpers (getPracticeSet, listExercises) |
| grading.ts | `src/lib/grading.ts` | GradingResponse/AudioGradingResponse types |
| auth.ts | `src/lib/auth.ts` | getCurrentUser, hasMinimumRole |
| parseBlankSentence | `src/lib/practice.ts` | Parse fill-in-blank templates |

### Existing Schema
| Table | Path | Purpose |
|-------|------|---------|
| practice_attempts | `src/db/schema/practice.ts` | Store attempt data with JSONB results |
| practice_sets | `src/db/schema/practice.ts` | Load published practice sets |
| practice_exercises | `src/db/schema/practice.ts` | Load exercises for a set |

### Existing API Patterns
| Route | Path | Pattern to Follow |
|-------|------|-------------------|
| /api/grade | `src/app/api/grade/route.ts` | n8n webhook delegation, mock fallback, rate limiting |
| /api/grade-audio | `src/app/api/grade-audio/route.ts` | FormData handling, audio webhook delegation |
| /api/admin/practice-sets/[setId] | `src/app/api/admin/practice-sets/[setId]/route.ts` | Practice set loading with exercises |

## Open Questions

1. **Matching Renderer UX: DnD lines or color-coded selection?**
   - What we know: @dnd-kit is available. The builder uses DnD for reordering.
   - What's unclear: Should matching use drag-to-connect (complex), click-to-pair (simpler), or dropdown selection (simplest)?
   - Recommendation: Use click-to-pair (select left, then click right to match). DnD lines between columns is complex and fragile on mobile. The preview already shows two columns. Click-to-pair is the cleanest UX for a language learning context. Save DnD for ordering exercises which are simpler (single column reorder).

2. **Retry Granularity: Per-exercise or full set only?**
   - What we know: PLAY-06 says "retry the full practice set OR individual failed exercises".
   - What's unclear: Does retrying an individual exercise create a new attempt record or update the existing one?
   - Recommendation: Retrying individual exercises updates the current attempt's results JSONB for that exercise. Retrying the full set creates a new attempt record. Both are tracked for coach review.

3. **Student Access Control: How does a student access a practice set before assignments exist?**
   - What we know: Phase 34 adds assignments. Phase 33 builds the player.
   - What's unclear: Without assignments, how does a student find and navigate to a practice set?
   - Recommendation: For Phase 33, allow any authenticated student to play any published practice set by direct URL (`/practice/[setId]`). Phase 34 will add the assignment dashboard and access control. The player page should check `status === "published"` but not check assignments (that's Phase 34).

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of `src/db/schema/practice.ts` -- practice_attempts table schema
- Direct codebase analysis of `src/types/exercises.ts` -- all 6 exercise definition types
- Direct codebase analysis of `src/components/admin/exercises/ExercisePreview.tsx` -- rendering patterns for all 6 types
- Direct codebase analysis of `src/app/api/grade/route.ts` and `src/app/api/grade-audio/route.ts` -- n8n webhook delegation pattern
- Direct codebase analysis of `src/hooks/useAudioRecorder.ts` -- audio recording hook
- Direct codebase analysis of `src/hooks/useBuilderState.ts` -- useReducer state management pattern
- Direct codebase analysis of `src/components/interactions/FeedbackDisplay.tsx` -- feedback UI pattern
- `.planning/research/ARCHITECTURE.md` -- v4.0 architecture decisions and patterns

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` -- accumulated project decisions informing patterns
- `.planning/ROADMAP.md` -- Phase 33 requirements and success criteria
- `.planning/REQUIREMENTS.md` -- PLAY-01 through PLAY-07 detailed specifications

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new packages, everything verified in codebase
- Architecture: HIGH -- patterns directly derived from existing codebase patterns and ARCHITECTURE.md
- Pitfalls: HIGH -- identified from direct analysis of exercise type definitions and grading patterns
- Code examples: HIGH -- adapted from actual codebase files, not hypothetical

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (stable codebase, no external dependency changes expected)
