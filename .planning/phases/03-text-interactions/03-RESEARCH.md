# Phase 3: Text Interactions - Research

**Researched:** 2026-01-26
**Domain:** Chinese Text Input with IME, Form Handling, n8n Webhook AI Grading, Language Preference Filtering
**Confidence:** HIGH

## Summary

Phase 3 implements the core text interaction system where students type Chinese sentences when the video pauses at defined cue points. This research covers four primary domains:

1. **Chinese IME Input Handling**: React's `onChange` event fires prematurely during IME composition (before user selects a character), causing issues with controlled inputs. The solution is tracking `compositionstart` and `compositionend` events to delay form updates until composition is complete.

2. **Form Handling with shadcn/ui + React Hook Form + Zod**: The established stack for type-safe forms in the existing project. React Hook Form with Zod resolver provides validation, while shadcn/ui Form components handle accessible UI with error states.

3. **n8n Webhook for AI Grading**: The phase must call an n8n webhook endpoint (not Server Actions) since n8n is an external service. The webhook receives the student's input, runs AI grading logic in n8n, and returns structured feedback. API Routes are required for this external integration.

4. **Language Preference Filtering**: User's `languagePreference` (stored in DB as enum) determines which interactions display. Filter interactions before rendering based on whether they require Cantonese, Mandarin, or both.

**Primary recommendation:** Use React Hook Form with a custom IME-aware input wrapper, Zod for validation, an API Route (not Server Action) to call n8n webhook, and filter interactions by language preference from user context.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-hook-form` | ^7.54.x | Form state management | De facto React form library, works with shadcn/ui |
| `@hookform/resolvers` | ^3.9.x | Schema validation bridge | Connects Zod to React Hook Form |
| `zod` | ^3.24.x | Schema validation | Type-safe validation, integrates with TypeScript |
| shadcn/ui Form | built-in | Form components | Already in project, accessible, styled |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `useActionState` | React 19 built-in | Async action state management | Tracking submission/loading state |
| `useOptimistic` | React 19 built-in | Optimistic UI updates | Showing immediate feedback before n8n response |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React Hook Form | TanStack Form | TanStack Form newer but RHF has better shadcn/ui integration already |
| API Route for n8n | Server Action | Server Actions cannot be called by external services; n8n needs API Routes |
| Zod | Valibot | Valibot smaller but Zod more established, better docs |

**Installation:**
```bash
npm install react-hook-form @hookform/resolvers zod
```

Note: React 19 (already installed) includes `useOptimistic` and `useActionState` built-in.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   └── interactions/
│       ├── TextInteraction.tsx       # Main text input interaction component
│       ├── TextInputField.tsx        # IME-aware input wrapper
│       ├── FeedbackDisplay.tsx       # AI grading feedback display
│       └── InteractionSchema.ts      # Zod schemas for validation
├── app/
│   └── api/
│       └── grade/
│           └── route.ts              # API Route to call n8n webhook
├── hooks/
│   └── useLanguagePreference.ts      # Hook to get user's language preference
└── lib/
    └── grading.ts                    # Types for grading request/response
```

### Pattern 1: IME-Aware Controlled Input
**What:** Custom input component that tracks IME composition state
**When to use:** Any text input accepting Chinese/Japanese/Korean characters
**Example:**
```typescript
// Source: React composition events pattern + MDN documentation
"use client";

import { useState, useRef, useCallback, forwardRef } from "react";
import { Input } from "@/components/ui/input";

interface IMEInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onValueChange?: (value: string) => void;
}

export const IMEInput = forwardRef<HTMLInputElement, IMEInputProps>(
  ({ onValueChange, onChange, ...props }, ref) => {
    const isComposingRef = useRef(false);
    const [internalValue, setInternalValue] = useState(
      (props.value as string) || ""
    );

    const handleCompositionStart = useCallback(() => {
      isComposingRef.current = true;
    }, []);

    const handleCompositionEnd = useCallback(
      (e: React.CompositionEvent<HTMLInputElement>) => {
        isComposingRef.current = false;
        // Fire the final value after composition ends
        const value = e.currentTarget.value;
        setInternalValue(value);
        onValueChange?.(value);
      },
      [onValueChange]
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setInternalValue(value);
        onChange?.(e);

        // Only fire value change if not in IME composition
        if (!isComposingRef.current) {
          onValueChange?.(value);
        }
      },
      [onChange, onValueChange]
    );

    return (
      <Input
        ref={ref}
        {...props}
        value={internalValue}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
    );
  }
);
IMEInput.displayName = "IMEInput";
```

### Pattern 2: Text Interaction Form with React Hook Form
**What:** Complete form component for text interaction submission
**When to use:** When video pauses for text input interaction
**Example:**
```typescript
// Source: shadcn/ui forms + React Hook Form docs
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { IMEInput } from "./TextInputField";

const textInteractionSchema = z.object({
  response: z.string().min(1, "Please enter your response"),
});

type TextInteractionFormValues = z.infer<typeof textInteractionSchema>;

interface TextInteractionProps {
  interactionId: string;
  prompt: string;
  expectedAnswer?: string; // For AI grading context
  onComplete: () => void;
}

export function TextInteraction({
  interactionId,
  prompt,
  expectedAnswer,
  onComplete,
}: TextInteractionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<GradingFeedback | null>(null);

  const form = useForm<TextInteractionFormValues>({
    resolver: zodResolver(textInteractionSchema),
    defaultValues: { response: "" },
  });

  async function onSubmit(values: TextInteractionFormValues) {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interactionId,
          studentResponse: values.response,
          expectedAnswer,
        }),
      });
      const result: GradingFeedback = await response.json();
      setFeedback(result);

      if (result.isCorrect) {
        // Delay to show success feedback before continuing
        setTimeout(onComplete, 1500);
      }
    } catch (error) {
      console.error("Grading error:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-xl text-white">{prompt}</div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="response"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Your answer</FormLabel>
                <FormControl>
                  <IMEInput
                    placeholder="Type your response in Chinese..."
                    className="text-lg"
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {feedback && <FeedbackDisplay feedback={feedback} />}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Checking..." : "Submit"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
```

### Pattern 3: API Route for n8n Webhook
**What:** Next.js API Route that forwards to n8n webhook and returns grading result
**When to use:** Required for all AI grading requests (external service cannot call Server Actions)
**Example:**
```typescript
// Source: Next.js API Routes docs + n8n webhook patterns
// app/api/grade/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

interface GradingRequest {
  interactionId: string;
  studentResponse: string;
  expectedAnswer?: string;
}

interface GradingResponse {
  isCorrect: boolean;
  score: number; // 0-100
  feedback: string;
  corrections?: string[];
  hints?: string[];
}

export async function POST(request: NextRequest) {
  // Verify user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: GradingRequest = await request.json();

    // Call n8n webhook
    const n8nResponse = await fetch(process.env.N8N_GRADING_WEBHOOK_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Optional: Add auth header if n8n webhook requires it
        ...(process.env.N8N_WEBHOOK_AUTH_HEADER && {
          Authorization: process.env.N8N_WEBHOOK_AUTH_HEADER,
        }),
      },
      body: JSON.stringify({
        userId,
        ...body,
      }),
    });

    if (!n8nResponse.ok) {
      throw new Error(`n8n webhook failed: ${n8nResponse.status}`);
    }

    const gradingResult: GradingResponse = await n8nResponse.json();
    return NextResponse.json(gradingResult);
  } catch (error) {
    console.error("Grading API error:", error);
    return NextResponse.json(
      { error: "Failed to grade response" },
      { status: 500 }
    );
  }
}
```

### Pattern 4: Language Preference Filtering
**What:** Filter interactions based on user's language preference
**When to use:** When loading interactions for a lesson
**Example:**
```typescript
// Source: Database schema + filtering logic
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { eq } from "drizzle-orm";

type LanguagePreference = "cantonese" | "mandarin" | "both";

interface Interaction {
  id: string;
  timestamp: number;
  type: "text" | "audio";
  language: "cantonese" | "mandarin" | "both"; // Which language this tests
  prompt: string;
  expectedAnswer?: string;
}

/**
 * Filter interactions based on user's language preference.
 * - "both": Show all interactions
 * - "cantonese": Show cantonese-only and both
 * - "mandarin": Show mandarin-only and both
 */
export function filterInteractionsByPreference(
  interactions: Interaction[],
  preference: LanguagePreference
): Interaction[] {
  if (preference === "both") {
    return interactions;
  }

  return interactions.filter(
    (i) => i.language === preference || i.language === "both"
  );
}

// Hook to use in components
export function useLanguagePreference() {
  // This would be loaded from user context or server component
  // Returns the user's languagePreference from the database
}
```

### Pattern 5: Grading Feedback Display
**What:** Component to display AI grading results with success/error states
**When to use:** After submitting text interaction
**Example:**
```typescript
// Source: UI patterns + accessibility guidelines
import { CheckCircle, XCircle, Lightbulb } from "lucide-react";
import { motion } from "framer-motion";

interface GradingFeedback {
  isCorrect: boolean;
  score: number;
  feedback: string;
  corrections?: string[];
  hints?: string[];
}

export function FeedbackDisplay({ feedback }: { feedback: GradingFeedback }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-lg ${
        feedback.isCorrect
          ? "bg-green-500/20 border border-green-500/50"
          : "bg-red-500/20 border border-red-500/50"
      }`}
    >
      <div className="flex items-start gap-3">
        {feedback.isCorrect ? (
          <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
        ) : (
          <XCircle className="h-6 w-6 text-red-500 shrink-0" />
        )}
        <div className="space-y-2">
          <p className="text-white">{feedback.feedback}</p>

          {feedback.corrections && feedback.corrections.length > 0 && (
            <div className="text-sm text-zinc-300">
              <p className="font-medium">Corrections:</p>
              <ul className="list-disc list-inside">
                {feedback.corrections.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {!feedback.isCorrect && feedback.hints && feedback.hints.length > 0 && (
            <div className="flex items-start gap-2 text-sm text-yellow-400">
              <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{feedback.hints[0]}</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
```

### Pattern 6: Unlimited Retry State Machine Extension
**What:** Extend XState machine to track retry attempts and completion
**When to use:** To enforce unlimited retries until correct
**Example:**
```typescript
// Source: XState patterns + existing videoPlayerMachine
// Add to video types
export interface InteractionAttempt {
  interactionId: string;
  attemptNumber: number;
  response: string;
  isCorrect: boolean;
  timestamp: Date;
}

// Track in context
interface VideoContext {
  // ... existing fields
  interactionAttempts: InteractionAttempt[];
}

// The existing pausedForInteraction state already enforces this:
// - Can ONLY exit via INTERACTION_COMPLETE event
// - Cannot PLAY or SEEK while in this state
// - Guard prevents re-triggering completed cue points
```

### Anti-Patterns to Avoid
- **Using Server Actions for n8n calls**: Server Actions are for internal Next.js mutations, not external webhook calls. n8n cannot call Server Actions.
- **Ignoring IME composition events**: onChange fires during composition, causing partial characters and poor UX for Chinese input.
- **Storing language preference only in localStorage**: Must sync with database for server-side filtering and data consistency.
- **Allowing video to continue on incorrect answer**: State machine must stay in `pausedForInteraction` until `INTERACTION_COMPLETE`.
- **Fetching user preference on every render**: Load once from server component or context, pass down as prop.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form state management | Manual useState per field | React Hook Form | Handles dirty/touched/errors, integrates with validation |
| Schema validation | Manual if/else checks | Zod | Type inference, composable schemas, clear error messages |
| IME composition tracking | Nothing (ignore issue) | Composition event listeners | Chinese input is core requirement, must work correctly |
| Accessible form errors | Manual aria attributes | shadcn/ui FormMessage | Built-in accessibility, consistent styling |
| Loading/submission state | Manual useState + try/catch | useActionState (React 19) | Standardized async action handling |
| Optimistic feedback | Wait for n8n response | useOptimistic (React 19) | Immediate UI response improves perceived speed |

**Key insight:** Form handling in React has evolved significantly. React 19's new hooks (`useActionState`, `useOptimistic`) combined with React Hook Form and Zod provide a complete solution. Don't reinvent these patterns.

## Common Pitfalls

### Pitfall 1: IME Characters Appearing Incorrect During Composition
**What goes wrong:** User types Pinyin but sees incomplete characters, or characters change unexpectedly
**Why it happens:** React's `onChange` fires on every keystroke, including during IME composition
**How to avoid:** Track `compositionstart`/`compositionend` events, only update form state after composition ends
**Warning signs:** Chinese characters appearing as romanized letters, multiple onChange calls per character

### Pitfall 2: n8n Webhook Timeout on Cold Start
**What goes wrong:** First grading request takes 5-10 seconds, times out
**Why it happens:** n8n workflow may have cold start delay
**How to avoid:** Set reasonable timeout (10-15s) on fetch, show loading state, consider retry logic
**Warning signs:** "Failed to grade" errors after ~30 seconds

### Pitfall 3: Language Preference Hydration Mismatch
**What goes wrong:** Server renders all interactions, client filters to subset, causing hydration error
**Why it happens:** Server doesn't know user's preference if only stored in localStorage
**How to avoid:** Load preference from database via server component, or suppress hydration warning for preferences
**Warning signs:** React hydration mismatch warnings, content flashing on load

### Pitfall 4: Form Not Clearing After Retry
**What goes wrong:** Previous incorrect answer remains in input after user wants to retry
**Why it happens:** Form state not reset on feedback display
**How to avoid:** Add "Try Again" button that calls `form.reset()`, or clear on new attempt
**Warning signs:** Users manually deleting their previous answer

### Pitfall 5: AI Feedback Too Vague
**What goes wrong:** Feedback says "Incorrect" but doesn't help user understand why
**Why it happens:** n8n workflow doesn't return detailed corrections
**How to avoid:** Structure n8n response to include: corrections, hints, correct answer reveal after N attempts
**Warning signs:** Users stuck on same interaction, frustration

### Pitfall 6: Race Condition on Rapid Submissions
**What goes wrong:** User clicks submit twice, gets duplicate feedback or errors
**Why it happens:** No debounce or submission lock
**How to avoid:** Disable submit button during submission, use `isSubmitting` state from React Hook Form
**Warning signs:** Double feedback displays, "Already submitted" errors from n8n

## Code Examples

Verified patterns from official sources:

### React Hook Form with Zod Resolver
```typescript
// Source: react-hook-form.com + shadcn/ui docs
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  response: z
    .string()
    .min(1, { message: "Response is required" })
    .max(500, { message: "Response too long" }),
});

type FormValues = z.infer<typeof schema>;

const form = useForm<FormValues>({
  resolver: zodResolver(schema),
  defaultValues: { response: "" },
  mode: "onBlur", // Validate on blur, not every keystroke (important for IME)
});
```

### useOptimistic for Immediate Feedback
```typescript
// Source: react.dev/reference/react/useOptimistic
import { useOptimistic, startTransition } from "react";

function TextInteraction({ onComplete }) {
  const [feedback, setFeedback] = useState<GradingFeedback | null>(null);
  const [optimisticFeedback, addOptimisticFeedback] = useOptimistic(
    feedback,
    (_, newFeedback: "pending") => ({ isCorrect: false, score: 0, feedback: "Checking..." })
  );

  async function handleSubmit(values) {
    addOptimisticFeedback("pending");
    startTransition(async () => {
      const result = await submitToGrading(values);
      setFeedback(result);
    });
  }

  return (
    <div>
      {optimisticFeedback && <FeedbackDisplay feedback={optimisticFeedback} />}
    </div>
  );
}
```

### Composition Event Detection
```typescript
// Source: MDN Web Docs - compositionstart/compositionend events
const inputRef = useRef<HTMLInputElement>(null);
const isComposingRef = useRef(false);

useEffect(() => {
  const input = inputRef.current;
  if (!input) return;

  const handleStart = () => { isComposingRef.current = true; };
  const handleEnd = () => { isComposingRef.current = false; };

  input.addEventListener("compositionstart", handleStart);
  input.addEventListener("compositionend", handleEnd);

  return () => {
    input.removeEventListener("compositionstart", handleStart);
    input.removeEventListener("compositionend", handleEnd);
  };
}, []);
```

### API Route with Authentication
```typescript
// Source: Next.js docs + Clerk auth
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Process authenticated request
  const body = await request.json();
  // ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual form state with useState | React Hook Form + Zod | 2022+ | Type safety, less boilerplate |
| Redux Form | React Hook Form | 2020+ | Better performance, simpler API |
| Server Actions for external calls | API Routes for webhooks | Always | External services need HTTP endpoints |
| Ignore IME issues | Composition event handling | Always | Required for CJK language input |
| Manual loading state | useActionState (React 19) | 2024 | Standardized async handling |
| Manual optimistic updates | useOptimistic (React 19) | 2024 | Built-in support for optimistic UI |

**Deprecated/outdated:**
- `useFormState` renamed to `useActionState` in React 19 (same functionality)
- Formik: Still works but React Hook Form is more popular and better maintained
- Redux Form: Abandoned, migrate to React Hook Form

## Open Questions

Things that couldn't be fully resolved:

1. **n8n Webhook Response Format**
   - What we know: Must return isCorrect, feedback, possibly corrections/hints
   - What's unclear: Exact JSON schema the n8n workflow will return
   - Recommendation: Define TypeScript interface now, validate with Zod on response, coordinate with n8n workflow author

2. **Interaction Data Model**
   - What we know: Interactions have timestamp, prompt, expectedAnswer, language
   - What's unclear: Where interactions are stored (separate table? JSON field on lessons?)
   - Recommendation: Create `interactions` table with FK to lessons, allows querying and filtering

3. **Progress Tracking Persistence**
   - What we know: Need to track which interactions user has completed
   - What's unclear: Store on client (localStorage) or server (database)?
   - Recommendation: Database for cross-device sync and analytics, cache in React state during session

4. **Grading Threshold for "Correct"**
   - What we know: AI returns score 0-100
   - What's unclear: What score threshold = "correct" (e.g., 80%? 90%?)
   - Recommendation: Define in interaction metadata, default 80%, allow override per interaction

## Sources

### Primary (HIGH confidence)
- [React Hook Form docs](https://react-hook-form.com/docs/useform) - Form API, controlled inputs, validation modes
- [shadcn/ui Forms](https://ui.shadcn.com/docs/forms/react-hook-form) - Integration pattern with React Hook Form
- [React useOptimistic](https://react.dev/reference/react/useOptimistic) - Optimistic UI hook API
- [MDN compositionstart](https://developer.mozilla.org/en-US/docs/Web/API/Element/compositionstart_event) - IME composition events
- [Next.js API Routes](https://nextjs.org/blog/building-apis-with-nextjs) - When to use Routes vs Server Actions

### Secondary (MEDIUM confidence)
- [n8n Webhook docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/) - Webhook setup and response modes
- [React GitHub Issue #8683](https://github.com/facebook/react/issues/8683) - Composition events in controlled components
- [Server Actions vs API Routes](https://dev.to/myogeshchavan97/nextjs-server-actions-vs-api-routes-dont-build-your-app-until-you-read-this-4kb9) - Decision framework
- [Zustand persist middleware](https://zustand.docs.pmnd.rs/middlewares/persist) - Local storage persistence pattern

### Tertiary (LOW confidence)
- WebSearch results on AI language grading APIs - general patterns, no specific implementation verified
- Community discussions on unlimited retry quiz patterns - conceptual, not code-verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - React Hook Form + Zod + shadcn/ui is documented pattern
- Architecture: HIGH - API Routes for webhooks is official Next.js guidance
- IME handling: HIGH - Composition events are DOM standard, well-documented
- n8n integration: MEDIUM - General webhook pattern known, specific workflow not yet defined
- Pitfalls: MEDIUM - Based on known React/IME issues, some project-specific

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (30 days - stable technologies)
