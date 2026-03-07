# Phase 31: Practice Data Model & Exercise CRUD - Research

**Researched:** 2026-02-06
**Domain:** Database schema design (JSONB discriminated unions), form-heavy CRUD UI, exercise type system
**Confidence:** HIGH

## Summary

Phase 31 establishes the entire database foundation for the practice/homework system and builds coach-facing CRUD forms for all 6 exercise types. The core pattern is a `practice_exercises` table with a discriminating `type` enum column and a `definition` JSONB column whose shape varies per exercise type. This is the "discriminated union in Postgres" pattern -- the type column is stored as a native pgEnum for indexing/filtering, while the variable-shape definition is stored as JSONB with TypeScript-level type safety via Drizzle's `.$type<>()` and Zod discriminated union validation.

The project already has 18 pgEnum definitions and 15+ tables following a consistent pattern: `pgTable` with UUID primary keys, `createdAt`/`updatedAt`/`deletedAt` timestamps, cascade foreign keys, Drizzle relations, and exported type inference. The CRUD UI follows a consistent pattern of react-hook-form + Zod validation + Radix Select/Dialog components on dark zinc-800/900 backgrounds. Phase 31 must match these established patterns exactly.

**Primary recommendation:** Build 4 tables (`practice_sets`, `practice_exercises`, `practice_set_assignments`, `practice_attempts`) with 3 new enums in a single schema file (`src/db/schema/practice.ts`). Use Zod v4 discriminated unions for exercise definition validation. Build 6 dedicated exercise form components (one per type) plus a shared `ExerciseForm` wrapper that switches between them based on the `type` select. Use `useFieldArray` from react-hook-form for variable-length options in MCQ, matching pairs, and ordering items.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.1 | Schema definition, queries, relations | Project ORM, JSONB `.$type<>()` for type-safe exercise definitions |
| drizzle-kit | 0.31.8 | Migration generation and push | `npm run db:generate` + `npm run db:push` for schema changes |
| zod | 4.3.6 | Form + API validation | `z.discriminatedUnion("type", [...])` for exercise definition validation |
| react-hook-form | 7.71.1 | Form state management | `useFieldArray` for dynamic option lists in MCQ/matching/ordering |
| @hookform/resolvers | 5.2.2 | Zod-to-RHF bridge | `zodResolver(schema)` pattern used across all existing forms |
| @radix-ui/react-select | 2.2.6 | Exercise type selector | Consistent with existing Select usage in InteractionForm |
| @radix-ui/react-dialog | 1.1.15 | Delete confirmation dialogs | Consistent with existing AlertDialog usage |
| lucide-react | 0.563.0 | Icons for exercise types | Consistent with project icon library |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-alert-dialog | 1.1.15 | Delete exercise confirmation | Edit mode delete action |
| class-variance-authority | 0.7.1 | Conditional styling variants | Exercise type card styling |
| tailwind-merge | 3.4.0 | Class merging via `cn()` | All component styling |

### New Dependencies Needed
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-tabs | latest | Tab switching between exercise types in preview | Exercise preview panel |

**Note:** @dnd-kit/react 0.2.1 is listed in STATE.md as a project decision for Phase 32 (Practice Set Builder), NOT Phase 31. Phase 31 does not need drag-and-drop. Do NOT install @dnd-kit/react in Phase 31.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSONB definition | Separate tables per exercise type | More tables = more joins, harder to add new types; JSONB is more flexible and faster for read-heavy exercise rendering |
| Zod discriminated union | Manual type-checking | Loses compile-time safety and form validation integration |
| useFieldArray | Manual array state | RHF's useFieldArray handles add/remove/reorder with proper key management |

**Installation:**
```bash
npx shadcn@latest add tabs
# This installs @radix-ui/react-tabs and creates src/components/ui/tabs.tsx
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/
│   └── practice.ts              # 4 tables, 3 enums, relations, types
├── lib/
│   └── practice.ts              # Exercise CRUD helpers (create, update, delete, list)
├── types/
│   └── exercises.ts             # TypeScript types for exercise definitions (JSONB shapes)
├── components/
│   └── admin/
│       ├── exercises/
│       │   ├── ExerciseForm.tsx           # Wrapper: type selector + delegates to specific form
│       │   ├── MultipleChoiceForm.tsx     # MCQ: useFieldArray for options
│       │   ├── FillInBlankForm.tsx        # Fill-blank: sentence template + blanks
│       │   ├── MatchingPairsForm.tsx      # Matching: useFieldArray for pair rows
│       │   ├── OrderingForm.tsx           # Ordering: useFieldArray for items
│       │   ├── AudioRecordingForm.tsx     # Audio: target phrase + reference text
│       │   ├── FreeTextForm.tsx           # Free text: prompt + rubric
│       │   ├── ExercisePreview.tsx        # Read-only preview of how student sees it
│       │   └── ExerciseList.tsx           # List of exercises in a practice set
│       └── ...existing forms...
├── app/
│   └── api/admin/
│       ├── exercises/
│       │   ├── route.ts                  # GET (list) + POST (create)
│       │   └── [exerciseId]/route.ts     # GET + PUT + DELETE
│       └── practice-sets/
│           ├── route.ts                  # GET (list) + POST (create) — minimal for Phase 31
│           └── [setId]/route.ts          # GET + PUT + DELETE — minimal for Phase 31
│   └── (dashboard)/admin/
│       └── exercises/
│           ├── page.tsx                  # Exercise list page
│           ├── new/page.tsx              # Create exercise page
│           └── [exerciseId]/page.tsx     # Edit exercise page
```

### Pattern 1: JSONB Discriminated Union Schema
**What:** Store exercise-type-specific data in a JSONB column, with a pgEnum `type` column as the discriminator
**When to use:** When you have multiple subtypes with different shapes but want a single table
**Example:**
```typescript
// Source: Drizzle ORM docs - jsonb with .$type<>()
import { pgTable, uuid, text, timestamp, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";

// The discriminator enum
export const exerciseTypeEnum = pgEnum("exercise_type", [
  "multiple_choice",
  "fill_in_blank",
  "matching",
  "ordering",
  "audio_recording",
  "free_text",
]);

// TypeScript union type for the JSONB column
export type ExerciseDefinition =
  | MultipleChoiceDefinition
  | FillInBlankDefinition
  | MatchingDefinition
  | OrderingDefinition
  | AudioRecordingDefinition
  | FreeTextDefinition;

export const practiceExercises = pgTable("practice_exercises", {
  id: uuid("id").defaultRandom().primaryKey(),
  practiceSetId: uuid("practice_set_id")
    .notNull()
    .references(() => practiceSets.id, { onDelete: "cascade" }),
  type: exerciseTypeEnum("type").notNull(),
  language: interactionLanguageEnum("language").notNull(), // reuse existing enum
  definition: jsonb("definition").notNull().$type<ExerciseDefinition>(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
```

### Pattern 2: Zod v4 Discriminated Union for Validation
**What:** Use Zod's `z.discriminatedUnion()` to validate exercise definitions at both the API and form level
**When to use:** For all exercise CRUD operations -- creation, editing, and API request validation
**Example:**
```typescript
// Source: Zod v4 docs - discriminatedUnion
import { z } from "zod";

const multipleChoiceSchema = z.object({
  type: z.literal("multiple_choice"),
  question: z.string().min(5),
  options: z.array(z.object({
    id: z.string(),
    text: z.string().min(1),
  })).min(2).max(6),
  correctOptionId: z.string(),
  explanation: z.string().optional(),
});

const fillInBlankSchema = z.object({
  type: z.literal("fill_in_blank"),
  sentence: z.string().min(5), // Use {{blank}} placeholders
  blanks: z.array(z.object({
    id: z.string(),
    correctAnswer: z.string().min(1),
    acceptableAnswers: z.array(z.string()).optional(),
  })).min(1),
  explanation: z.string().optional(),
});

// ... other exercise schemas ...

export const exerciseDefinitionSchema = z.discriminatedUnion("type", [
  multipleChoiceSchema,
  fillInBlankSchema,
  matchingSchema,
  orderingSchema,
  audioRecordingSchema,
  freeTextSchema,
]);
```

### Pattern 3: Switched Form Component
**What:** A parent ExerciseForm that renders a type selector, then delegates to a type-specific sub-form
**When to use:** When you have multiple form variants that share layout but differ in fields
**Example:**
```typescript
// Source: Project pattern from InteractionForm.tsx + react-hook-form watch()
export function ExerciseForm({ exercise, onSave, onCancel }: ExerciseFormProps) {
  const [exerciseType, setExerciseType] = useState(exercise?.type ?? "multiple_choice");

  return (
    <div className="space-y-5 rounded-lg border border-zinc-700 bg-zinc-800 p-5">
      {/* Type selector (locked in edit mode) */}
      <Select value={exerciseType} onValueChange={setExerciseType} disabled={!!exercise}>
        {/* ...options... */}
      </Select>

      {/* Language selector */}
      <LanguageSelect />

      {/* Delegate to type-specific form */}
      {exerciseType === "multiple_choice" && (
        <MultipleChoiceForm exercise={exercise} onSave={onSave} onCancel={onCancel} />
      )}
      {exerciseType === "fill_in_blank" && (
        <FillInBlankForm exercise={exercise} onSave={onSave} onCancel={onCancel} />
      )}
      {/* ... other types ... */}
    </div>
  );
}
```

### Pattern 4: useFieldArray for Dynamic Options
**What:** React Hook Form's useFieldArray for managing variable-length lists of options/pairs/items
**When to use:** MCQ options (2-6), matching pairs (2-10), ordering items (2-10)
**Example:**
```typescript
// Source: react-hook-form docs - useFieldArray
import { useForm, useFieldArray } from "react-hook-form";

function MultipleChoiceForm() {
  const { register, control, handleSubmit } = useForm({
    defaultValues: {
      question: "",
      options: [{ id: nanoid(), text: "" }, { id: nanoid(), text: "" }],
      correctOptionId: "",
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "options" });

  return (
    <form>
      {fields.map((field, index) => (
        <div key={field.id}>
          <Input {...register(`options.${index}.text`)} />
          <button type="button" onClick={() => remove(index)}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => append({ id: nanoid(), text: "" })}>
        Add Option
      </button>
    </form>
  );
}
```

### Anti-Patterns to Avoid
- **Separate tables per exercise type:** Creates N join queries and makes adding new types a schema migration. JSONB with a type discriminator is the standard pattern for quiz/exercise systems.
- **Storing exercise definitions as stringified JSON:** Use Drizzle's JSONB type with `.$type<>()` -- this gives type inference and avoids manual JSON.parse/stringify.
- **Single monolithic form for all exercise types:** Each type has fundamentally different fields; a switch pattern with dedicated sub-forms is much cleaner than conditional rendering within one giant form.
- **Client-side-only validation:** Always validate at BOTH the form level (Zod + react-hook-form) AND the API level (Zod). Never trust client data.
- **Installing @dnd-kit in Phase 31:** Drag-and-drop is Phase 32 (Practice Set Builder). Phase 31 is forms-only CRUD. Do not install it prematurely.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Variable-length form arrays | Manual useState arrays | `useFieldArray` from react-hook-form | Handles add/remove/reorder with stable keys, integrates with validation |
| Union type validation | Manual if/switch on type | `z.discriminatedUnion()` from Zod v4 | Compile-time type narrowing, auto error messages, works with zodResolver |
| Unique IDs for options | Math.random() | `nanoid()` (already installed) | Collision-resistant, URL-safe, 21 chars |
| Exercise type icons | Custom SVGs | `lucide-react` icons (already installed) | Consistent with project, wide icon set |
| Tabbed preview UI | Custom tab state | shadcn/ui Tabs component | Accessible, keyboard-navigable, consistent styling |
| Form error display | Custom error rendering | Existing `ErrorAlert` component | Project-wide consistency |

**Key insight:** The exercise CRUD is fundamentally a forms problem with a database backing. Every piece of this is solved by existing project patterns (RHF + Zod + Drizzle + Radix UI). The only novel aspect is the JSONB discriminated union pattern for the definition column.

## Common Pitfalls

### Pitfall 1: Zod v4 + react-hook-form Type Incompatibilities
**What goes wrong:** `zodResolver(schema)` may produce TypeScript errors with Zod v4 due to changed type exports.
**Why it happens:** The project already uses `as any` or `as never` casts on the zodResolver in existing forms (InteractionForm uses `as any`, CourseForm uses `as never`).
**How to avoid:** Follow the existing project pattern: define an explicit `type FormData = { ... }` separate from the Zod schema, and cast the resolver: `resolver: zodResolver(schema) as any`. This is documented in the existing InteractionForm.tsx and CourseForm.tsx.
**Warning signs:** TypeScript errors like "Type 'ZodResolver' is not assignable to type 'Resolver'"

### Pitfall 2: JSONB Validation at Database Level
**What goes wrong:** PostgreSQL does not validate JSONB structure -- it accepts any valid JSON. A malformed exercise definition will be silently stored.
**Why it happens:** Unlike typed columns, JSONB is structurally opaque to the database.
**How to avoid:** Always run Zod validation at the API layer before inserting. The `exerciseDefinitionSchema.parse(body.definition)` must happen in every POST/PUT handler. Never insert raw request body JSONB.
**Warning signs:** Exercises that load but crash the preview/player because of missing fields.

### Pitfall 3: Reusing vs Creating Language Enum
**What goes wrong:** Creating a new `practice_language` pgEnum when `interaction_language` already exists with identical values.
**Why it happens:** Copy-paste from the interactions schema without checking for existing enums.
**How to avoid:** Reuse the existing `interactionLanguageEnum` from `src/db/schema/interactions.ts`. Import it in the practice schema. PostgreSQL pgEnum names must be globally unique, so creating a duplicate with the same values would either fail or create confusion.
**Warning signs:** Migration errors about duplicate enum types, or mismatched enum references.

### Pitfall 4: Fill-in-the-Blank Placeholder Parsing
**What goes wrong:** The `{{blank}}` placeholder system for fill-in-blank exercises becomes inconsistent between the creation form and the rendering preview.
**Why it happens:** No shared parsing utility -- one component uses regex, another uses split().
**How to avoid:** Create a single `parseBlankSentence(template: string): { segments: (string | BlankSlot)[] }` utility in `src/lib/practice.ts` and use it in both the form preview and the student-facing renderer (Phase 33).
**Warning signs:** Blanks appear in wrong positions, or the preview doesn't match the player.

### Pitfall 5: Options/Pairs without Stable IDs
**What goes wrong:** Using array index as the identifier for MCQ options or matching pairs causes correctness bugs when items are reordered or deleted.
**Why it happens:** Array indices shift when items are removed.
**How to avoid:** Generate a stable `id` (via `nanoid()`) for each option/pair/item at creation time. Store the `correctOptionId` as a reference to this stable ID, not an index. `useFieldArray` already provides stable `field.id` keys for React rendering.
**Warning signs:** "Correct answer" points to wrong option after deleting an earlier option.

### Pitfall 6: Forgetting deletedAt Soft Delete
**What goes wrong:** Hard-deleting exercises instead of soft-deleting with `deletedAt`.
**Why it happens:** Not following the existing pattern (courses, modules, lessons, interactions all use `deletedAt`).
**How to avoid:** Add `deletedAt: timestamp("deleted_at")` to practice tables. DELETE endpoints should `SET deletedAt = now()`. All queries must filter `WHERE deletedAt IS NULL`.
**Warning signs:** Deleted exercises disappear from analytics/history, breaking attempt records that reference them.

## Code Examples

Verified patterns from the existing codebase and official sources:

### Exercise Definition TypeScript Types
```typescript
// src/types/exercises.ts
// These types define the shape of the JSONB `definition` column per exercise type

export interface MultipleChoiceDefinition {
  type: "multiple_choice";
  question: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation?: string;
}

export interface FillInBlankDefinition {
  type: "fill_in_blank";
  sentence: string; // "I {{blank}} to the store {{blank}}."
  blanks: {
    id: string;
    correctAnswer: string;
    acceptableAnswers?: string[];
  }[];
  explanation?: string;
}

export interface MatchingDefinition {
  type: "matching";
  pairs: {
    id: string;
    left: string;  // e.g., Chinese character
    right: string; // e.g., English meaning
  }[];
  explanation?: string;
}

export interface OrderingDefinition {
  type: "ordering";
  items: {
    id: string;
    text: string;
    correctPosition: number; // 0-indexed
  }[];
  explanation?: string;
}

export interface AudioRecordingDefinition {
  type: "audio_recording";
  targetPhrase: string;       // What the student should say
  referenceText?: string;     // Context / translation
  explanation?: string;
}

export interface FreeTextDefinition {
  type: "free_text";
  prompt: string;             // The question/instruction
  sampleAnswer?: string;      // For AI grading context
  rubric?: string;            // Grading criteria for AI
  minLength?: number;
  maxLength?: number;
  explanation?: string;
}

export type ExerciseDefinition =
  | MultipleChoiceDefinition
  | FillInBlankDefinition
  | MatchingDefinition
  | OrderingDefinition
  | AudioRecordingDefinition
  | FreeTextDefinition;
```

### Database Schema Pattern
```typescript
// src/db/schema/practice.ts -- follows existing project patterns exactly
import {
  pgTable, uuid, text, timestamp, integer, jsonb, pgEnum, boolean, unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { interactionLanguageEnum } from "./interactions";
import type { ExerciseDefinition } from "@/types/exercises";

// --- Enums ---
export const exerciseTypeEnum = pgEnum("exercise_type", [
  "multiple_choice", "fill_in_blank", "matching",
  "ordering", "audio_recording", "free_text",
]);

export const practiceSetStatusEnum = pgEnum("practice_set_status", [
  "draft", "published", "archived",
]);

// --- Tables ---
export const practiceSets = pgTable("practice_sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: practiceSetStatusEnum("status").notNull().default("draft"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
});

export const practiceExercises = pgTable("practice_exercises", {
  id: uuid("id").defaultRandom().primaryKey(),
  practiceSetId: uuid("practice_set_id")
    .notNull()
    .references(() => practiceSets.id, { onDelete: "cascade" }),
  type: exerciseTypeEnum("type").notNull(),
  language: interactionLanguageEnum("language").notNull(),
  definition: jsonb("definition").notNull().$type<ExerciseDefinition>(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
});
```

### API Route Pattern (matches existing /api/admin/interactions)
```typescript
// src/app/api/admin/exercises/route.ts
import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { practiceExercises } from "@/db/schema";
import { exerciseDefinitionSchema } from "@/types/exercises"; // Zod schema

export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  // Validate exercise definition with Zod discriminated union
  const result = exerciseDefinitionSchema.safeParse(body.definition);
  if (!result.success) {
    return NextResponse.json(
      { message: result.error.issues[0]?.message || "Invalid exercise definition" },
      { status: 400 }
    );
  }

  const [exercise] = await db.insert(practiceExercises).values({
    practiceSetId: body.practiceSetId,
    type: result.data.type, // Type matches the discriminator
    language: body.language,
    definition: result.data,
    sortOrder: body.sortOrder ?? 0,
  }).returning();

  return NextResponse.json({ exercise }, { status: 201 });
}
```

### Form Pattern (matches existing InteractionForm.tsx)
```typescript
// Abbreviated example showing the key pattern
"use client";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { nanoid } from "nanoid";

type MCQFormData = {
  question: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation?: string;
};

export function MultipleChoiceForm({ exercise, onSave, onCancel }) {
  const { register, control, handleSubmit, watch, setValue, formState: { errors } } =
    useForm<MCQFormData>({
      resolver: zodResolver(multipleChoiceFormSchema) as any,
      defaultValues: {
        question: exercise?.definition?.question ?? "",
        options: exercise?.definition?.options ?? [
          { id: nanoid(), text: "" },
          { id: nanoid(), text: "" },
        ],
        correctOptionId: exercise?.definition?.correctOptionId ?? "",
      },
    });

  const { fields, append, remove } = useFieldArray({ control, name: "options" });

  // ... form JSX with fields.map, append, remove ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate table per exercise type (quiz_mcq, quiz_fill_blank, etc.) | Single table with JSONB definition column + type discriminator | Standard PostgreSQL JSONB pattern | Simpler schema, no joins, easy to add new types |
| @dnd-kit/core + @dnd-kit/sortable (legacy) | @dnd-kit/react 0.2.1 (new rewrite) | 2025 rewrite | New API: DragDropProvider replaces DndContext, useSortable from @dnd-kit/react/sortable |
| Zod v3 `z.discriminatedUnion` required explicit discriminator key | Zod v4 can auto-detect discriminator (but explicit is still preferred) | Zod 4.0 (installed: 4.3.6) | Composable nested discriminated unions possible |
| Manual form array state | react-hook-form `useFieldArray` | RHF v7+ | Stable IDs, built-in append/remove/move, validation integration |

**Deprecated/outdated:**
- @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities: Replaced by @dnd-kit/react + @dnd-kit/helpers (but NOT needed in Phase 31)
- Zod v3 API: Project uses Zod v4 (4.3.6) -- use v4 syntax only

## Key Design Decisions for Planning

### 1. practice_exercises Belong to practice_sets
Per STATE.md decision: 4 tables including `practice_exercises` with a `practice_set_id` foreign key. This means exercises are always created within the context of a practice set. The Phase 31 flow is:
1. Coach creates a practice set (title, description, draft status)
2. Coach adds exercises to the practice set
3. Each exercise has a type, language tag, and type-specific definition

### 2. Language Enum Reuse
Reuse the existing `interactionLanguageEnum` ("cantonese", "mandarin", "both") from `src/db/schema/interactions.ts`. Do NOT create a new enum.

### 3. Coach vs Admin Access Level
Exercise CRUD should use `hasMinimumRole("coach")` (not "admin"). This follows the pattern used by knowledge base, tags, submissions, and student management APIs. Coaches are the primary content creators.

### 4. Standalone Exercise CRUD Pages vs Embedded in Builder
Phase 31 creates standalone exercise management pages under `/admin/exercises/`. Phase 32 (Practice Set Builder) will later provide the visual canvas. Phase 31 provides the simpler form-based CRUD that works as a foundation and can also serve as a fallback/advanced editing mode.

### 5. Exercise Preview Component
The preview shows a read-only rendering of how the student will see the exercise. This is a separate component (`ExercisePreview`) that takes an `ExerciseDefinition` and renders it. It will be reused in Phase 32 (builder preview) and Phase 33 (player). Chinese text in previews should use `<PhoneticText>` for phonetic annotation rendering.

### 6. Assignment Tables are Schema-Only in Phase 31
Per STATE.md: `practice_set_assignments` and `practice_attempts` tables should be created in the schema for Phase 31 (so the migration is complete), but the UI for assignments (Phase 34) and the player (Phase 33) are later phases. Phase 31 only builds UI for exercise CRUD.

## Open Questions

Things that couldn't be fully resolved:

1. **@dnd-kit/react 0.2.x Stability**
   - What we know: Version 0.2.1 was published recently. The API has changed significantly from the legacy @dnd-kit/core. The docs are at next.dndkit.com.
   - What's unclear: Whether 0.2.x is stable enough for production, or if breaking changes are expected before 1.0.
   - Recommendation: Phase 31 does NOT need drag-and-drop. Defer @dnd-kit/react evaluation to Phase 32 research. If it proves too unstable, framer-motion (already installed at 12.29.2) has basic drag capabilities as a fallback.

2. **Fill-in-Blank Placeholder Syntax**
   - What we know: Common patterns are `{{blank}}`, `___`, or `{1}` numbered placeholders.
   - What's unclear: Whether blanks should be numbered (to support different correct answers per blank) or sequential.
   - Recommendation: Use `{{blank}}` placeholder syntax. Each blank maps by position (0-indexed) to the `blanks` array in the definition. This is simpler than numbered placeholders and sufficient for language learning sentences.

3. **Audio Exercise in Phase 31 Scope**
   - What we know: EXER-05 says "create audio recording questions where students read a target phrase aloud." The creation form needs: target phrase, optional reference text, language tag.
   - What's unclear: Whether the coach should be able to record a reference audio in Phase 31, or if that's Phase 36 (Pronunciation Scoring) territory.
   - Recommendation: Phase 31 form collects text fields only (target phrase + reference text). Audio recording and pronunciation scoring are Phase 36. The form should leave room for a future "reference audio" field.

## Sources

### Primary (HIGH confidence)
- Drizzle ORM docs (`/llmstxt/orm_drizzle_team_llms_txt`) - JSONB column type, `.$type<>()` for type inference
- Zod v4 docs (`/colinhacks/zod/v4.0.1`) - `z.discriminatedUnion()` with literals, nested unions, composability
- react-hook-form docs (`/react-hook-form/documentation`) - `useFieldArray`, `watch()`, `setValue()` patterns
- Existing codebase: `src/db/schema/interactions.ts`, `src/db/schema/courses.ts`, `src/db/schema/tags.ts` - established table patterns
- Existing codebase: `src/components/admin/InteractionForm.tsx`, `src/components/admin/CourseForm.tsx` - established form patterns
- Existing codebase: `src/app/api/admin/interactions/route.ts` - established API route pattern
- Existing codebase: `src/lib/auth.ts` - `hasMinimumRole("coach")` for access control

### Secondary (MEDIUM confidence)
- @dnd-kit/react docs (https://next.dndkit.com/react) - New API structure, DragDropProvider, useSortable
- @dnd-kit migration guide (https://next.dndkit.com/react/guides/migration) - Legacy to new API differences
- shadcn/ui Tabs (https://ui.shadcn.com/docs/components/radix/tabs) - Tab component installation

### Tertiary (LOW confidence)
- Discriminated union PostgreSQL patterns (https://weiyen.net/articles/modelling-discriminated-unions-in-postgres/) - General pattern validation
- @dnd-kit/react npm status - Version 0.2.1 stability unclear for production use

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed except Tabs; patterns verified from existing codebase
- Architecture: HIGH - JSONB discriminated union is a well-established pattern; project conventions clear from 15+ existing tables
- Pitfalls: HIGH - All pitfalls derived from actual codebase patterns (Zod v4 cast, JSONB validation, enum reuse)

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days - stable domain, all libraries pinned)
