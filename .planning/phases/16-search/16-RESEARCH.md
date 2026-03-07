# Phase 16: Search - Research

**Researched:** 2026-01-30
**Domain:** Full-text search, Chinese/CJK text search, debounced UI patterns
**Confidence:** MEDIUM (Chinese search has constraints due to Neon extension limitations)

## Summary

This phase implements search across courses and lessons in a Cantonese/Mandarin learning LMS built on Next.js 15, Neon Postgres, and Drizzle ORM. The search must handle English text, Chinese characters, and Pinyin/Jyutping romanization -- while respecting enrollment-based access control.

The primary challenge is Chinese text search on Neon Postgres. Neon does NOT support PGroonga or zhparser (the standard CJK full-text search extensions). However, Neon DOES support `pg_search` (ParadeDB BM25) with ICU/Jieba tokenizers for Chinese, and also supports `pg_trgm` (though pg_trgm does not work with CJK characters). The recommended approach is a **hybrid strategy**: use `pg_search` with ICU tokenizer for Chinese-aware full-text search if the project is on AWS, otherwise fall back to `ILIKE` pattern matching for Chinese characters (which works but is unindexed). For Pinyin/Jyutping search, store pre-computed romanization columns populated at content creation time.

**Primary recommendation:** Use a two-tier search approach: (1) `ILIKE` pattern matching across title/description fields with relevance ranking via CASE expressions for simplicity and reliability, and (2) a `search_pinyin`/`search_jyutping` text column on courses/lessons populated at write-time to enable romanization lookup. This avoids extension dependencies and works reliably on all Neon plans.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.x | SQL query builder with `sql` template tag for raw queries | Already in project, supports raw SQL for ILIKE/search |
| use-debounce | 10.x | Debounced callback hook for search input | Official Next.js tutorial recommendation; lightweight (2KB) |
| pinyin-pro | 3.x | Convert Chinese characters to Mandarin Pinyin | 28K weekly downloads, actively maintained, comprehensive |
| to-jyutping | 0.x | Convert Chinese characters to Cantonese Jyutping | 99% accuracy, BSD-2 license, from CanCLID project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | (existing) | Search icon for the search bar | Already installed in project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ILIKE search | pg_search (ParadeDB BM25) | Better relevance ranking + Chinese tokenization, but only available on Neon AWS regions and adds extension dependency; ILIKE is simpler and sufficient for small-medium catalogs |
| ILIKE search | PostgreSQL tsvector FTS | Better for English stemming/ranking, but does NOT support Chinese without zhparser/PGroonga (neither available on Neon) |
| Pre-computed pinyin columns | Runtime conversion | Runtime is slower and prevents indexing; pre-computed columns allow ILIKE with potential pg_trgm index for Latin text |
| use-debounce | Custom setTimeout | use-debounce handles edge cases (unmounting, rapid re-calls) that custom implementations miss |

**Installation:**
```bash
npm install use-debounce pinyin-pro to-jyutping
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   └── api/
│       └── search/
│           └── route.ts         # Search API endpoint
├── components/
│   └── search/
│       ├── SearchBar.tsx        # Client component: input + debounce
│       └── SearchResults.tsx    # Results dropdown/panel
├── lib/
│   └── search-utils.ts         # Romanization helpers
└── db/
    └── schema/
        └── courses.ts           # Add searchPinyin, searchJyutping columns
```

### Pattern 1: URL-Based Debounced Search (Next.js Official Pattern)
**What:** Search input updates URL search params after debounce; server component reads params and fetches data.
**When to use:** When search results need to be shareable/bookmarkable.
**Example:**
```typescript
// Source: https://nextjs.org/learn/dashboard-app/adding-search-and-pagination
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useDebouncedCallback } from "use-debounce";
import { useTransition } from "react";

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (term) {
      params.set("q", term);
    } else {
      params.delete("q");
    }
    startTransition(() => {
      router.replace(`/dashboard?${params.toString()}`);
    });
  }, 300);

  return (
    <input
      onChange={(e) => handleSearch(e.target.value)}
      defaultValue={searchParams.get("q") ?? ""}
    />
  );
}
```

### Pattern 2: API Route Search (Recommended for this project)
**What:** Client component calls API route with debounced fetch; results displayed in dropdown overlay.
**When to use:** When search is a global overlay/popover (not a page navigation), which is the case for a header search bar.
**Example:**
```typescript
// Client component with API fetch
"use client";
import { useState, useCallback } from "react";
import { useDebouncedCallback } from "use-debounce";

export function SearchBar() {
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = useDebouncedCallback(async (term: string) => {
    if (!term || term.length < 2) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      setResults(data.results);
    } finally {
      setIsLoading(false);
    }
  }, 300);

  return (/* input + dropdown */);
}
```

### Pattern 3: ILIKE Search with Relevance Ranking
**What:** Use SQL ILIKE with CASE-based relevance scoring to weight title matches above description matches.
**When to use:** When content volume is small-to-medium (hundreds, not millions of records) and Chinese text must be searchable.
**Example:**
```typescript
// Source: Codebase pattern from /api/knowledge/search/route.ts
import { sql, ilike, and, eq, or, isNull } from "drizzle-orm";

const pattern = `%${sanitizedQuery}%`;

const results = await db
  .select({
    id: courses.id,
    title: courses.title,
    description: courses.description,
    type: sql<string>`'course'`,
    relevance: sql<number>`
      CASE
        WHEN ${ilike(courses.title, pattern)} THEN 3
        WHEN ${ilike(courses.searchPinyin, pattern)} THEN 2
        WHEN ${ilike(courses.description, pattern)} THEN 1
        ELSE 0
      END
    `,
  })
  .from(courses)
  .innerJoin(courseAccess, eq(courseAccess.courseId, courses.id))
  .innerJoin(users, eq(courseAccess.userId, users.id))
  .where(
    and(
      eq(users.clerkId, clerkId),
      isNull(courses.deletedAt),
      or(
        ilike(courses.title, pattern),
        ilike(courses.description, pattern),
        ilike(courses.searchPinyin, pattern),
        ilike(courses.searchJyutping, pattern),
      )
    )
  )
  .orderBy(sql`relevance DESC`);
```

### Pattern 4: Pre-computed Romanization Columns
**What:** Add `search_pinyin` and `search_jyutping` text columns to courses, modules, and lessons. Populate at content creation/update time using `pinyin-pro` and `to-jyutping` libraries.
**When to use:** Always -- this is required for SRCH-05 (Pinyin/Jyutping search).
**Example:**
```typescript
import { pinyin } from "pinyin-pro";
import ToJyutping from "to-jyutping";

function generateSearchFields(title: string, description?: string) {
  const text = [title, description].filter(Boolean).join(" ");

  // Extract Chinese characters only for romanization
  const chineseChars = text.replace(/[^\u4e00-\u9fff]/g, "");

  if (!chineseChars) return { searchPinyin: null, searchJyutping: null };

  const pinyinText = pinyin(chineseChars, { toneType: "none", type: "array" }).join(" ");
  const jyutpingText = ToJyutping.getJyutpingText(chineseChars) ?? "";

  return {
    searchPinyin: pinyinText.toLowerCase(),
    searchJyutping: jyutpingText.toLowerCase().replace(/[0-9]/g, ""), // strip tones for easier matching
  };
}
```

### Anti-Patterns to Avoid
- **Using PostgreSQL tsvector for Chinese text:** The built-in `to_tsvector('simple', ...)` treats entire CJK strings as single tokens. Without zhparser/PGroonga (unavailable on Neon), this produces unusable results for Chinese.
- **Client-side search:** Never load all courses/lessons to the client for filtering. Always search server-side.
- **Searching without enrollment filter:** SRCH-07 requires access control. Every search query MUST join through `course_access` to filter by the current user's enrolled courses.
- **Undebounced search:** Firing a query on every keystroke will overload the server. Always debounce (300ms is standard).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Input debouncing | Custom setTimeout with cleanup | `use-debounce` (useDebouncedCallback) | Handles unmount, rapid re-invocation, leading/trailing edge correctly |
| Chinese to Pinyin | Custom lookup tables | `pinyin-pro` | 400K+ character dictionary with heteronym support, actively maintained |
| Chinese to Jyutping | Custom Cantonese dictionary | `to-jyutping` | 99% accuracy from CanCLID linguistic research project |
| SQL injection prevention | Manual escaping | Drizzle `sql` template + `ilike()` | Drizzle parameterizes queries automatically |

**Key insight:** Chinese romanization is a solved but complex problem (heteronyms, tone sandhi, simplified/traditional variants). Libraries like `pinyin-pro` and `to-jyutping` encode linguistic research that would take months to replicate.

## Common Pitfalls

### Pitfall 1: PostgreSQL FTS Does Not Tokenize Chinese
**What goes wrong:** Using `to_tsvector('english', '...')` or even `to_tsvector('simple', '...')` with Chinese text produces a single token for the entire string, making individual character or word search impossible.
**Why it happens:** PostgreSQL's built-in text search parser splits on whitespace/punctuation. Chinese has no spaces between words.
**How to avoid:** Use `ILIKE` for Chinese text matching (works character-by-character). For better performance at scale, consider `pg_search` with ICU tokenizer (Neon AWS only).
**Warning signs:** Search returns zero results for Chinese queries that should match.

### Pitfall 2: pg_trgm Does Not Index CJK Characters
**What goes wrong:** Creating a `GIN(column gin_trgm_ops)` index and expecting it to speed up `ILIKE '%中文%'` queries on Chinese text.
**Why it happens:** pg_trgm extracts trigrams from alphanumeric characters only. CJK characters are ignored during trigram extraction.
**How to avoid:** Do NOT rely on pg_trgm for Chinese text indexing. It works for Pinyin/Jyutping (Latin alphabet) but not for Chinese characters. For Chinese ILIKE, accept sequential scan on small datasets or use pg_search.
**Warning signs:** EXPLAIN shows sequential scan even after creating trigram index.

### Pitfall 3: Pinyin/Jyutping Runtime Conversion is Expensive
**What goes wrong:** Converting Chinese text to romanization on every search request adds latency.
**Why it happens:** Dictionary lookup for each character, heteronym resolution, etc.
**How to avoid:** Pre-compute romanization columns at content creation/update time. Store them as indexed text columns.
**Warning signs:** Search response time > 500ms.

### Pitfall 4: Missing Access Control in Search Results
**What goes wrong:** Students see courses they aren't enrolled in through search.
**Why it happens:** Search query forgets to join through `course_access` table.
**How to avoid:** ALWAYS filter through `courseAccess` joined to `users` where `users.clerkId = currentClerkId`. This is security-critical.
**Warning signs:** Search shows all published courses regardless of enrollment.

### Pitfall 5: Search Bar Blocks Header Rendering
**What goes wrong:** Search bar is a client component that requires `useSearchParams`, causing the entire header to become a client component or triggering Suspense boundaries.
**Why it happens:** `useSearchParams()` must be wrapped in a Suspense boundary in Next.js App Router.
**How to avoid:** Keep the SearchBar as an isolated client component. Import it into the AppHeader (which is already `"use client"`). Use state-based approach (not URL params) for the overlay/dropdown pattern.
**Warning signs:** Build warnings about missing Suspense boundaries.

### Pitfall 6: ILIKE SQL Injection via Wildcards
**What goes wrong:** User input containing `%` or `_` characters is interpreted as SQL wildcards.
**Why it happens:** ILIKE uses `%` and `_` as pattern characters.
**How to avoid:** Sanitize search input by escaping `%` to `\%` and `_` to `\_` before interpolation. The existing knowledge search route already does this (`sanitizeQuery` function).
**Warning signs:** Searching for literal `%` or `_` returns unexpected results.

## Code Examples

### Search API Route
```typescript
// Source: Based on existing /api/knowledge/search/route.ts pattern
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { courses, modules, lessons, courseAccess, users } from "@/db/schema";
import { and, eq, ilike, isNull, or, gt, sql } from "drizzle-orm";

function sanitizeQuery(query: string): string {
  return query.trim().replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function GET(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q");
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  const sanitized = sanitizeQuery(q);
  const pattern = `%${sanitized}%`;

  // Search courses the user has access to
  const courseResults = await db
    .select({
      id: courses.id,
      title: courses.title,
      description: courses.description,
      type: sql<string>`'course'`,
      relevance: sql<number>`
        CASE
          WHEN ${courses.title} ILIKE ${pattern} THEN 10
          WHEN ${courses.searchPinyin} ILIKE ${pattern} THEN 5
          WHEN ${courses.searchJyutping} ILIKE ${pattern} THEN 5
          WHEN ${courses.description} ILIKE ${pattern} THEN 2
          ELSE 0
        END
      `,
    })
    .from(courses)
    .innerJoin(courseAccess, eq(courseAccess.courseId, courses.id))
    .innerJoin(users, eq(courseAccess.userId, users.id))
    .where(
      and(
        eq(users.clerkId, clerkId),
        isNull(courses.deletedAt),
        or(
          isNull(courseAccess.expiresAt),
          gt(courseAccess.expiresAt, new Date())
        ),
        or(
          ilike(courses.title, pattern),
          ilike(courses.description, pattern),
          ilike(courses.searchPinyin, pattern),
          ilike(courses.searchJyutping, pattern),
        )
      )
    );

  // Search lessons within enrolled courses (similar query with lessons join)
  // ... combine and sort by relevance

  return NextResponse.json({ results: courseResults });
}
```

### Drizzle Schema Addition (search columns)
```typescript
// Add to courses.ts schema
export const courses = pgTable("courses", {
  // ... existing columns ...
  searchPinyin: text("search_pinyin"),     // Pre-computed pinyin for title+description
  searchJyutping: text("search_jyutping"), // Pre-computed jyutping for title+description
});

// Same for lessons table
export const lessons = pgTable("lessons", {
  // ... existing columns ...
  searchPinyin: text("search_pinyin"),
  searchJyutping: text("search_jyutping"),
});
```

### Debounced Search Client Component
```typescript
// Source: Next.js official tutorial + use-debounce docs
"use client";
import { useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Search, Loader2 } from "lucide-react";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const search = useDebouncedCallback(async (term: string) => {
    if (term.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      setResults(data.results);
      setIsOpen(true);
    } finally {
      setIsLoading(false);
    }
  }, 300);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
        {isLoading ? (
          <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
        ) : (
          <Search className="w-4 h-4 text-zinc-400" />
        )}
        <input
          type="text"
          placeholder="Search courses and lessons..."
          className="bg-transparent text-white placeholder-zinc-500 outline-none w-64"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
          }}
        />
      </div>
      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-zinc-800 rounded-lg shadow-lg z-50">
          {/* Results list */}
        </div>
      )}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pg_trgm + ILIKE for all text | pg_search (BM25) for advanced search | 2024 (ParadeDB on Neon) | Better relevance ranking, fuzzy matching |
| External search (Algolia/Typesense) | pg_search or native FTS | 2024-2025 | Eliminates external dependency for Postgres-based apps |
| Custom debounce hooks | use-debounce library | Stable since 2020 | Handles edge cases, widely adopted |
| React.lazy + Suspense for loading | useTransition for non-blocking updates | React 19 (2024) | isPending state without Suspense wrapper |

**Deprecated/outdated:**
- `useCallback` + `setTimeout` for debounce: Works but misses edge cases (cleanup on unmount, leading edge). Use `use-debounce` instead.
- tsvector with 'simple' config for CJK: Does not tokenize Chinese text properly. Not a viable approach.

## Open Questions

1. **pg_search availability on the Neon project**
   - What we know: pg_search is only available on Neon AWS regions. It provides ICU tokenizer which handles CJK well.
   - What's unclear: Whether this project's Neon instance is on AWS and whether pg_search is accessible.
   - Recommendation: Design the search to work with ILIKE (universally available). If pg_search is available, it can be added as an enhancement later.

2. **Scale of content catalog**
   - What we know: Current seed data has one course, one module, one lesson. This is a Cantonese/Mandarin LMS.
   - What's unclear: How many courses/lessons will exist in production.
   - Recommendation: ILIKE without indexes is fine for hundreds of records. If catalog grows to thousands+, add pg_trgm indexes for Latin columns (pinyin/jyutping) and evaluate pg_search for Chinese.

3. **Module-level search**
   - What we know: Requirements mention courses and lessons. Modules also have titles and descriptions.
   - What's unclear: Whether module titles should be searchable or only courses and lessons.
   - Recommendation: Include modules in search results -- they provide navigational context and have the same schema pattern.

4. **Pinyin/Jyutping tone handling**
   - What we know: Pinyin uses tone numbers (1-4) or diacritics. Jyutping uses tone numbers (1-6). Users may search with or without tones.
   - What's unclear: Whether users expect tone-sensitive search.
   - Recommendation: Strip tones from stored romanization columns. Store `"nei hou"` not `"nei5 hou2"`. This allows simpler substring matching.

## Sources

### Primary (HIGH confidence)
- Context7 `/drizzle-team/drizzle-orm-docs` - Full-text search with generated columns, customType for tsvector, GIN index creation
- [Neon Docs: Full Text Search with tsvector](https://neon.com/guides/full-text-search) - tsvector creation, GIN indexes, ts_rank, websearch_to_tsquery
- [Neon Docs: Supported Extensions](https://neon.com/docs/extensions/pg-extensions) - Confirmed pg_trgm, unaccent, pg_search available; PGroonga, zhparser NOT available
- [Next.js Official Tutorial: Adding Search](https://nextjs.org/learn/dashboard-app/adding-search-and-pagination) - Debounced search with URL params pattern

### Secondary (MEDIUM confidence)
- [Neon Docs: pg_search extension](https://neon.com/docs/extensions/pg_search) - ParadeDB BM25 with ICU/Jieba tokenizers for CJK
- [ParadeDB Blog: Tokenization Pipelines](https://www.paradedb.com/blog/when-tokenization-becomes-token) - ICU tokenizer for CJK
- [npm: pinyin-pro](https://www.npmjs.com/package/pinyin-pro) - 28K weekly downloads, comprehensive Pinyin conversion
- [npm: to-jyutping](https://www.npmjs.com/package/to-jyutping) - 99% accuracy Cantonese Jyutping conversion
- [npm: use-debounce](https://www.npmjs.com/package/use-debounce) - Stable debounce hook library
- [pg_cjk_parser GitHub](https://github.com/huangjimmy/pg_cjk_parser) - CJK 2-gram parser for PostgreSQL FTS (not available on Neon)

### Tertiary (LOW confidence)
- [Neon Community: PGroonga support request](https://community.neon.tech/t/support-for-pgroonga-extension/1331) - Confirmed PGroonga incompatible with Neon architecture
- [ParadeDB v0.21.0 Release](https://github.com/paradedb/paradedb/releases/tag/v0.21.0) - Jieba simplified/traditional Chinese support

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries verified via npm, Context7, and official docs
- Architecture: MEDIUM - ILIKE pattern is proven in codebase (knowledge search), but Chinese-specific indexing has constraints on Neon
- Pitfalls: HIGH - Verified through official Postgres docs and Neon extension compatibility lists

**Research date:** 2026-01-30
**Valid until:** 2026-03-01 (30 days -- stable domain, Neon extension support may change)
