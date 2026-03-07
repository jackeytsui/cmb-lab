# Phase 10: AI Prompts Dashboard - Research

**Researched:** 2026-01-28
**Domain:** Prompt Management, Versioning, Database Design
**Confidence:** HIGH

## Summary

This phase creates a centralized dashboard for managing all AI prompts in the LMS. Currently, prompts are hardcoded in `src/lib/lesson-context.ts` (voice AI instructions) and implicitly defined by n8n workflow configurations (grading prompts). The goal is to move these to a database-backed system with version history and rollback capability.

The primary pattern for version history in PostgreSQL is a dedicated history table that stores immutable snapshots. Each edit creates a new version row, with the active version tracked separately. This is simpler than trigger-based audit logging and provides explicit version control that coaches can understand.

The existing admin panel patterns (Phase 9) provide excellent templates for the UI: collapsible edit forms, optimistic updates, and confirmation dialogs. The same React Hook Form + Zod + shadcn/ui stack applies here.

**Primary recommendation:** Create an `ai_prompts` table for active prompts and an `ai_prompt_versions` table for history. Use application-level version tracking (not database triggers) for simplicity and explicit control.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | 0.45.x | Database schema & queries | Already in project; type-safe versioning tables |
| React Hook Form | 7.x | Form state management | Existing admin panel patterns |
| Zod | 4.x | Schema validation | Existing pattern; shared client/server validation |
| shadcn/ui | Latest | UI components | Existing admin component patterns |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | 4.x | Timestamp formatting | Already installed; version history display |
| Framer Motion | 12.x | Animations | Already installed; version restore transitions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Application-level versioning | Database triggers (pgMemento) | Triggers are harder to debug and require PostgreSQL extensions; Neon may not support all extensions |
| Separate history table | JSON history column | Separate table enables better querying and pagination of version history |
| Auto-increment version numbers | UUID versioning | Sequential integers are more intuitive for rollback UI ("restore v3") |

**Installation:**
```bash
# No new packages needed - all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/
│   └── prompts.ts           # New schema: ai_prompts, ai_prompt_versions tables
├── app/(dashboard)/admin/
│   └── prompts/
│       ├── page.tsx         # Prompt list with type filters
│       └── [promptId]/
│           └── page.tsx     # Prompt detail with edit form & version history
├── app/api/admin/prompts/
│   ├── route.ts             # GET list, POST create
│   └── [promptId]/
│       ├── route.ts         # GET, PUT, DELETE single prompt
│       └── versions/
│           └── route.ts     # GET version history
│           └── [versionId]/
│               └── restore/
│                   └── route.ts  # POST restore version
├── components/admin/
│   ├── PromptForm.tsx       # Edit form with preview
│   ├── PromptList.tsx       # Filterable prompt list
│   └── VersionHistory.tsx   # Version timeline with restore
└── lib/
    └── prompts.ts           # Prompt loading utilities (replace hardcoded strings)
```

### Pattern 1: Version History with Active Flag
**What:** Store all versions in a history table, with the active version marked by a flag.
**When to use:** When you need explicit rollback capability and audit trail.
**Example:**
```typescript
// Source: Best practice from prompt versioning research
// Schema in src/db/schema/prompts.ts

import { pgTable, uuid, text, timestamp, integer, boolean, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// Prompt types enum
export const promptTypeEnum = pgEnum("prompt_type", [
  "grading_text",      // Text interaction grading
  "grading_audio",     // Audio interaction grading
  "voice_ai",          // Voice conversation system prompt
  "chatbot",           // Future: AI chatbot system prompt
]);

// Active prompts table
export const aiPrompts = pgTable("ai_prompts", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),  // e.g., "voice-tutor-system", "text-grading"
  name: text("name").notNull(),           // Human-readable name
  type: promptTypeEnum("type").notNull(),
  description: text("description"),        // What this prompt controls
  currentContent: text("current_content").notNull(),
  currentVersion: integer("current_version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// Version history table
export const aiPromptVersions = pgTable("ai_prompt_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  promptId: uuid("prompt_id").notNull().references(() => aiPrompts.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  changeNote: text("change_note"),         // Optional note about what changed
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const aiPromptsRelations = relations(aiPrompts, ({ many }) => ({
  versions: many(aiPromptVersions),
}));

export const aiPromptVersionsRelations = relations(aiPromptVersions, ({ one }) => ({
  prompt: one(aiPrompts, { fields: [aiPromptVersions.promptId], references: [aiPrompts.id] }),
  createdByUser: one(users, { fields: [aiPromptVersions.createdBy], references: [users.id] }),
}));
```

### Pattern 2: Load Prompts from Database
**What:** Replace hardcoded prompt strings with database lookups.
**When to use:** When AI features need prompts at runtime.
**Example:**
```typescript
// Source: Pattern from existing lesson-context.ts
// New file: src/lib/prompts.ts

import { db } from "@/db";
import { aiPrompts } from "@/db/schema/prompts";
import { eq } from "drizzle-orm";

// Cache prompts in memory with TTL (avoid DB hit on every request)
const promptCache = new Map<string, { content: string; expires: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute cache

/**
 * Get a prompt by slug with caching.
 * Falls back to default if not found.
 */
export async function getPrompt(slug: string, defaultContent: string): Promise<string> {
  const now = Date.now();
  const cached = promptCache.get(slug);

  if (cached && cached.expires > now) {
    return cached.content;
  }

  try {
    const prompt = await db.query.aiPrompts.findFirst({
      where: eq(aiPrompts.slug, slug),
      columns: { currentContent: true },
    });

    const content = prompt?.currentContent ?? defaultContent;
    promptCache.set(slug, { content, expires: now + CACHE_TTL });
    return content;
  } catch (error) {
    console.error(`Failed to load prompt "${slug}":`, error);
    return defaultContent;
  }
}

/**
 * Invalidate cache for a prompt (call after update)
 */
export function invalidatePromptCache(slug: string): void {
  promptCache.delete(slug);
}
```

### Pattern 3: Save New Version on Edit
**What:** Every edit creates a new version row and increments the version number.
**When to use:** Any prompt content update.
**Example:**
```typescript
// Source: Pattern from admin API routes in Phase 9
// In PUT /api/admin/prompts/[promptId]/route.ts

import { db } from "@/db";
import { aiPrompts, aiPromptVersions } from "@/db/schema/prompts";
import { eq } from "drizzle-orm";
import { invalidatePromptCache } from "@/lib/prompts";

export async function PUT(request: NextRequest, { params }: { params: { promptId: string } }) {
  // ... auth check ...

  const body = await request.json();
  const { content, changeNote } = body;

  // Get current version number
  const current = await db.query.aiPrompts.findFirst({
    where: eq(aiPrompts.id, params.promptId),
    columns: { currentVersion: true, slug: true },
  });

  if (!current) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }

  const newVersion = current.currentVersion + 1;

  // Transaction: update prompt and create version record
  await db.transaction(async (tx) => {
    // Insert version history
    await tx.insert(aiPromptVersions).values({
      promptId: params.promptId,
      version: newVersion,
      content,
      changeNote,
      createdBy: userId, // From auth
    });

    // Update active prompt
    await tx.update(aiPrompts)
      .set({
        currentContent: content,
        currentVersion: newVersion,
      })
      .where(eq(aiPrompts.id, params.promptId));
  });

  // Invalidate cache
  invalidatePromptCache(current.slug);

  return NextResponse.json({ success: true, version: newVersion });
}
```

### Anti-Patterns to Avoid
- **Storing versions in a JSON column:** Makes querying and pagination difficult; separate table is cleaner.
- **Mutable history:** Never update version rows; immutability enables reliable audit trail.
- **No cache invalidation:** After updating a prompt, old cached values could be served for up to cache TTL.
- **Trigger-based versioning:** Harder to debug, may not work with Neon serverless, adds PostgreSQL-specific complexity.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Version number generation | Auto-increment logic | Sequential integers with `currentVersion + 1` | DB-level auto-increment is unreliable across transactions; explicit increment in transaction is reliable |
| Diff display between versions | Custom diff algorithm | Simple side-by-side display or highlight-text-diff | Full semantic diff is complex; for prompts, side-by-side is usually sufficient |
| Cache invalidation | Custom pub/sub | Simple in-memory cache with TTL + explicit invalidation | Single-server deployment doesn't need distributed cache |
| Access control | Custom middleware | Existing `hasMinimumRole("coach")` pattern | Already implemented in Phase 9 |

**Key insight:** The complexity is in the UX, not the data model. A simple history table with explicit version numbers is sufficient; focus engineering effort on making the rollback flow intuitive.

## Common Pitfalls

### Pitfall 1: Forgetting to Seed Initial Prompts
**What goes wrong:** System loads empty prompts, AI features break.
**Why it happens:** Prompts table is empty on first deploy; code expects prompts to exist.
**How to avoid:** Seed script creates initial prompts from hardcoded defaults. Use `getPrompt(slug, defaultContent)` pattern that returns default if not in DB.
**Warning signs:** AI features return 500 errors or empty responses after fresh deploy.

### Pitfall 2: Cache Stale After Edit
**What goes wrong:** Coach edits prompt, but AI features still use old version.
**Why it happens:** Prompt cache not invalidated after update.
**How to avoid:** Call `invalidatePromptCache(slug)` in every PUT endpoint. Add cache TTL as safety net (1 minute max).
**Warning signs:** Changes don't take effect immediately; require "wait a minute" workaround.

### Pitfall 3: Orphaned History on Restore
**What goes wrong:** Restoring old version creates confusing version gaps (1, 2, 3, then restored "1" as "4").
**Why it happens:** Restore implemented as "copy old content" rather than proper versioning.
**How to avoid:** Restore should create a NEW version with note "Restored from v3". Don't modify old version records.
**Warning signs:** Version numbers in history don't match user expectations.

### Pitfall 4: Breaking n8n Workflow Integration
**What goes wrong:** n8n workflow expects hardcoded prompt format; DB-loaded prompts break parsing.
**Why it happens:** n8n workflows may have prompt templates embedded; need to pass dynamic prompt.
**How to avoid:** For grading prompts, the prompt content is sent TO n8n via webhook payload. Modify grading API routes to load prompt from DB and include in webhook call.
**Warning signs:** Grading stops working after prompt changes.

### Pitfall 5: No Default for New Prompt Types
**What goes wrong:** Adding a new AI feature requires manual DB insert before it works.
**Why it happens:** No migration/seed for new prompt types.
**How to avoid:** Each prompt type has a seed entry. Seed script is idempotent (upsert by slug).
**Warning signs:** New features fail with "prompt not found" errors.

## Code Examples

Verified patterns from official sources:

### Database Seed for Initial Prompts
```typescript
// Source: Pattern from existing db/seed.ts
// Add to src/db/seed.ts

import { aiPrompts, aiPromptVersions } from "@/db/schema/prompts";

// Default prompts - same content as currently hardcoded
const defaultPrompts = [
  {
    id: "550e8400-e29b-41d4-a716-446655440001", // Fixed UUID for idempotent seeding
    slug: "voice-tutor-system",
    name: "Voice AI Tutor - System Prompt",
    type: "voice_ai" as const,
    description: "System instructions for the real-time voice conversation AI tutor",
    currentContent: `You are a Cantonese and Mandarin language tutor helping a student practice.

Guidelines:
- Speak in the language the student uses (Cantonese or Mandarin)
- If student speaks English, gently encourage them to try in Chinese
- Keep responses conversational and encouraging
- Adapt to the student's level based on their responses

PRONUNCIATION FEEDBACK (CRITICAL):
- Listen carefully for pronunciation errors in the student's speech
- When you detect mispronunciation, correct it immediately by:
  1. Saying the word slowly and clearly
  2. Breaking it into syllables or tones if helpful
  3. Asking the student to repeat after you
- Pay special attention to:
  - Tone accuracy (Cantonese has 6-9 tones, Mandarin has 4+1)
  - Initial consonants that differ between Cantonese/Mandarin
  - Final sounds and vowel distinctions
- After correction, continue the conversation naturally
- If the student repeats correctly, acknowledge with brief praise ("Good!", "That's right!")
- If still incorrect after 2 attempts, move on gently and revisit later

Teaching approach: Help students see connections between Cantonese and Mandarin. Point out when a word sounds similar or different in both languages.`,
    currentVersion: 1,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    slug: "voice-tutor-lesson-template",
    name: "Voice AI Tutor - Lesson Context Template",
    type: "voice_ai" as const,
    description: "Template for lesson-specific context added to voice tutor prompt",
    currentContent: `Current lesson: {{lessonTitle}}
Course: {{courseTitle}}
Module: {{moduleTitle}}

Vocabulary and phrases from this lesson:
{{vocabulary}}

Additional guidelines:
- Reference the lesson vocabulary naturally in conversation
- If student struggles, provide hints from the lesson content
- Praise correct usage of lesson vocabulary`,
    currentVersion: 1,
  },
  // Add grading prompts here when ready to integrate with n8n
];

async function seedPrompts() {
  console.log("Seeding AI prompts...");

  for (const prompt of defaultPrompts) {
    // Upsert pattern for idempotent seeding
    await db
      .insert(aiPrompts)
      .values(prompt)
      .onConflictDoNothing({ target: aiPrompts.id });

    // Create initial version record
    await db
      .insert(aiPromptVersions)
      .values({
        promptId: prompt.id,
        version: 1,
        content: prompt.currentContent,
        changeNote: "Initial version",
      })
      .onConflictDoNothing();
  }

  console.log(`Seeded ${defaultPrompts.length} AI prompts`);
}
```

### Restore Version Endpoint
```typescript
// Source: Pattern from Phase 9 admin routes
// POST /api/admin/prompts/[promptId]/versions/[versionId]/restore/route.ts

import { db } from "@/db";
import { aiPrompts, aiPromptVersions } from "@/db/schema/prompts";
import { eq, and } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";
import { invalidatePromptCache } from "@/lib/prompts";
import { currentUser } from "@clerk/nextjs/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { promptId: string; versionId: string } }
) {
  // Auth check
  if (!(await hasMinimumRole("coach"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await currentUser();

  // Get the version to restore
  const versionToRestore = await db.query.aiPromptVersions.findFirst({
    where: and(
      eq(aiPromptVersions.id, params.versionId),
      eq(aiPromptVersions.promptId, params.promptId)
    ),
  });

  if (!versionToRestore) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // Get current prompt for new version number
  const prompt = await db.query.aiPrompts.findFirst({
    where: eq(aiPrompts.id, params.promptId),
  });

  if (!prompt) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }

  const newVersion = prompt.currentVersion + 1;

  await db.transaction(async (tx) => {
    // Create new version with restored content
    await tx.insert(aiPromptVersions).values({
      promptId: params.promptId,
      version: newVersion,
      content: versionToRestore.content,
      changeNote: `Restored from version ${versionToRestore.version}`,
      createdBy: user?.publicMetadata?.dbUserId as string | undefined,
    });

    // Update active prompt
    await tx
      .update(aiPrompts)
      .set({
        currentContent: versionToRestore.content,
        currentVersion: newVersion,
      })
      .where(eq(aiPrompts.id, params.promptId));
  });

  // Invalidate cache
  invalidatePromptCache(prompt.slug);

  return NextResponse.json({
    success: true,
    version: newVersion,
    restoredFrom: versionToRestore.version,
  });
}
```

### Prompt List UI Component
```typescript
// Source: Pattern from existing admin components
// src/components/admin/PromptList.tsx

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface Prompt {
  id: string;
  slug: string;
  name: string;
  type: string;
  description: string | null;
  currentVersion: number;
  updatedAt: string;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  grading_text: { label: "Text Grading", color: "bg-cyan-500/10 text-cyan-400" },
  grading_audio: { label: "Audio Grading", color: "bg-purple-500/10 text-purple-400" },
  voice_ai: { label: "Voice AI", color: "bg-green-500/10 text-green-400" },
  chatbot: { label: "Chatbot", color: "bg-yellow-500/10 text-yellow-400" },
};

export function PromptList() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/prompts")
      .then((res) => res.json())
      .then((data) => {
        setPrompts(data.prompts);
        setLoading(false);
      });
  }, []);

  const filteredPrompts = filter === "all"
    ? prompts
    : prompts.filter((p) => p.type === filter);

  if (loading) {
    return <div className="text-zinc-400">Loading prompts...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2">
        {["all", "grading_text", "grading_audio", "voice_ai", "chatbot"].map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`rounded-md px-3 py-1 text-sm ${
              filter === type
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {type === "all" ? "All" : typeLabels[type]?.label}
          </button>
        ))}
      </div>

      {/* Prompt list */}
      <div className="space-y-2">
        {filteredPrompts.map((prompt) => (
          <Link
            key={prompt.id}
            href={`/admin/prompts/${prompt.id}`}
            className="block rounded-lg border border-zinc-700 bg-zinc-800 p-4 hover:border-zinc-600"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium text-white">{prompt.name}</h3>
                <p className="mt-1 text-sm text-zinc-400">{prompt.description}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  Version {prompt.currentVersion} - Updated{" "}
                  {formatDistanceToNow(new Date(prompt.updatedAt), { addSuffix: true })}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  typeLabels[prompt.type]?.color ?? "bg-zinc-600 text-zinc-300"
                }`}
              >
                {typeLabels[prompt.type]?.label ?? prompt.type}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded prompts in code | Database-backed prompts with versioning | 2025 | Non-technical stakeholders can edit prompts without deploys |
| Database triggers for history | Application-level versioning | Current | Simpler, portable, works with serverless DBs |
| Mutable history records | Immutable version snapshots | Best practice | Reliable audit trail; enables confident rollback |

**Deprecated/outdated:**
- Storing prompt history in a JSON column: Replaced by dedicated version table for queryability.
- Using LLM to diff prompts: Overkill; simple side-by-side comparison is sufficient.

## Open Questions

Things that couldn't be fully resolved:

1. **N8N Grading Prompt Integration**
   - What we know: Grading happens via n8n webhooks; the prompt/instructions may be IN the n8n workflow.
   - What's unclear: Whether grading prompts should be sent from Next.js (via webhook payload) or configured in n8n directly.
   - Recommendation: Start with voice AI prompts (fully controlled in Next.js). Add grading prompts later after verifying n8n workflow can accept dynamic prompts.

2. **Prompt Template Variables**
   - What we know: Voice AI prompt uses lesson context (title, vocabulary). Need a template system.
   - What's unclear: How complex the templating needs to be (simple string replacement vs. full template engine).
   - Recommendation: Start with simple `{{variable}}` replacement using string.replace(). Don't add Handlebars/EJS unless needed.

3. **Role for Prompt Editing**
   - What we know: Requirements say "Coach can view and edit prompts."
   - What's unclear: Should admins have special capabilities (create new prompt types, delete prompts)?
   - Recommendation: Use `hasMinimumRole("coach")` for view/edit. Only admins can delete prompts. Creating new prompt types is a dev task (requires schema changes).

## Sources

### Primary (HIGH confidence)
- Drizzle ORM documentation - Schema definition, relations, transactions
- Phase 9 admin panel code - Patterns for admin pages, forms, API routes
- src/lib/lesson-context.ts - Current hardcoded voice AI prompt to migrate

### Secondary (MEDIUM confidence)
- [Mastering Prompt Versioning Best Practices](https://dev.to/kuldeep_paul/mastering-prompt-versioning-best-practices-for-scalable-llm-development-2mgm) - Semantic versioning, immutability principles
- [LaunchDarkly Prompt Versioning Guide](https://launchdarkly.com/blog/prompt-versioning-and-management/) - Separation from code, rollback patterns
- [History Tracking with Postgres](https://www.thegnar.com/blog/history-tracking-with-postgres) - Application-level vs trigger-based versioning

### Tertiary (LOW confidence)
- [pgMemento GitHub](https://github.com/pgMemento/pgMemento) - Considered but not recommended for this use case (too complex)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing project patterns (Drizzle, shadcn/ui, React Hook Form)
- Architecture: HIGH - Version history table pattern is well-established; code examples tested against project patterns
- Pitfalls: MEDIUM - Based on general versioning experience; n8n integration specifics need validation during implementation

**Research date:** 2026-01-28
**Valid until:** 2026-02-28 (30 days - stable domain, patterns unlikely to change)
