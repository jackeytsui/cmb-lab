# Phase 35: Enhanced Chatbot - Research

**Researched:** 2026-02-07
**Domain:** Chat UI, AI SDK persistence, inline exercises, lesson context injection
**Confidence:** HIGH

## Summary

Phase 35 enhances the existing Phase 13 chatbot into an iMessage-style practice interface with persistent conversations, lesson-specific context, phonetic annotations, and inline exercises. The existing system uses Vercel AI SDK v6 (`ai@^6.0.62`, `@ai-sdk/react@^3.0.64`, `@ai-sdk/openai@^3.0.23`) with a `useChat` hook, streaming responses, and a RAG knowledge base tool. The chatbot is mounted globally in `layout.tsx` as a floating widget.

The core work involves: (1) restyling the chat UI with iMessage-style bubbles and timestamps, (2) adding a database schema for chat persistence using AI SDK's `onFinish` callback + `initialMessages` pattern, (3) injecting lesson context by detecting the current page URL and passing lesson data to the API, (4) generating inline MCQ/fill-in-blank exercises via AI tool calling with structured output that renders interactive components in chat, and (5) applying PhoneticText to user-typed Chinese messages.

**Primary recommendation:** Use the existing AI SDK v6 `useChat` + `toUIMessageStreamResponse` with `onFinish` callback for persistence. Add a new `chat_conversations` + `chat_messages` schema. Use AI SDK tool calling to generate inline exercises as structured JSON that the client renders as interactive components within the message stream. Pass `lessonId` from the client via the request body and build lesson context server-side using the existing `buildLessonInstructions` pattern from `src/lib/lesson-context.ts`.

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | ^6.0.62 | Server-side streaming, tool calling, persistence callbacks | Already in use; `onFinish` + `originalMessages` pattern is the official persistence approach |
| `@ai-sdk/react` | ^3.0.64 | `useChat` hook with `id` + `initialMessages` props | Already in use; native chat restore support |
| `@ai-sdk/openai` | ^3.0.23 | OpenAI provider (gpt-4o) | Already in use |
| `drizzle-orm` | (project version) | Database schema and queries | Project standard ORM |
| `framer-motion` | (project version) | Chat panel animations | Already used in ChatWidget/ChatMessage |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | (project version) | Tool input schemas, exercise definition validation | For structuring inline exercise tool output |
| `lucide-react` | (project version) | Icons (Send, X, etc.) | Already used in chat components |
| `@clerk/nextjs` | (project version) | Auth for API routes | Already used in chat API route |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DB persistence (Drizzle) | File-based storage | DB is correct for multi-device, multi-session; file-based is only for demos |
| AI SDK tool calling for exercises | Custom JSON in message text | Tool calling gives structured, typed output; parsing JSON from text is fragile |
| Detecting lesson from URL client-side | Server-side session/cookie | Client-side is simpler, uses existing `usePathname()` pattern |

**Installation:**
```bash
# No new packages needed - everything is already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/
│   └── chat.ts                     # NEW: chat_conversations + chat_messages tables
├── lib/
│   ├── chat-utils.ts               # EXISTING: KB search (extend with lesson context builder)
│   └── chat-persistence.ts         # NEW: saveChat, loadChat, listChats helpers
├── hooks/
│   └── useChatbot.ts               # MODIFY: add chatId, lessonId, initialMessages support
├── components/chat/
│   ├── ChatWidget.tsx              # MODIFY: detect lesson page, manage chatId
│   ├── ChatPanel.tsx               # RESTYLE: iMessage bubbles, timestamps, conversation list
│   ├── ChatMessage.tsx             # RESTYLE: left/right bubble alignment, timestamps
│   ├── ChatBubble.tsx              # NEW: iMessage-style bubble component
│   ├── ChatExercise.tsx            # NEW: inline exercise renderer (MCQ + fill-in-blank)
│   ├── ChatConversationList.tsx    # NEW: sidebar/dropdown to switch conversations
│   └── ChineseAnnotation.tsx       # EXISTING: unchanged
├── app/api/
│   ├── chat/route.ts               # MODIFY: accept chatId/lessonId, persist with onFinish
│   └── chat/conversations/route.ts # NEW: list/create conversation endpoints
│   └── chat/[chatId]/route.ts      # NEW: load specific conversation messages
```

### Pattern 1: Chat Persistence with AI SDK v6 onFinish
**What:** Save messages to database after each AI response completes
**When to use:** Every chat interaction
**Example:**
```typescript
// Source: Context7 - AI SDK docs (chatbot-message-persistence)
// Server: src/app/api/chat/route.ts

export async function POST(req: Request) {
  const { messages, chatId, lessonId }: {
    messages: UIMessage[];
    chatId: string;
    lessonId?: string;
  } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    messages: await convertToModelMessages(messages.slice(-20)),
    tools: { /* ... */ },
  });

  // Consume stream to ensure onFinish fires even if client disconnects
  result.consumeStream(); // no await

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: ({ messages: allMessages }) => {
      saveChat({ chatId, messages: allMessages, userId, lessonId });
    },
  });
}
```

### Pattern 2: Chat Restore with initialMessages
**What:** Load persisted conversation when chatbot opens
**When to use:** When student reopens chatbot or refreshes page
**Example:**
```typescript
// Source: Context7 - AI SDK docs (chatbot-message-persistence)
// Client: ChatPanel.tsx

const { messages, sendMessage, status } = useChat({
  id: chatId,                    // Chat session ID
  messages: initialMessages,      // Loaded from DB
  transport: new DefaultChatTransport({
    api: '/api/chat',
    body: { chatId, lessonId, languagePreference: preference },
  }),
});
```

### Pattern 3: Inline Exercises via Tool Calling
**What:** AI generates structured exercise data as a tool call; client renders interactive components
**When to use:** When chatbot wants to quiz the student
**Example:**
```typescript
// Server-side tool definition
tools: {
  generateExercise: {
    description: "Generate an inline practice exercise for the student",
    inputSchema: z.object({
      type: z.enum(["multiple_choice", "fill_in_blank"]),
      question: z.string(),
      options: z.array(z.object({
        id: z.string(),
        text: z.string(),
      })).optional(),
      correctOptionId: z.string().optional(),
      sentence: z.string().optional(),
      blanks: z.array(z.object({
        id: z.string(),
        correctAnswer: z.string(),
      })).optional(),
    }),
    execute: async (exercise) => {
      // Return the exercise data for client rendering
      return { exercise, rendered: true };
    },
  },
}

// Client-side rendering in ChatMessage
// When a tool-invocation part has toolName === "generateExercise"
// Render <ChatExercise definition={toolResult.exercise} />
```

### Pattern 4: Lesson Context Detection from Client URL
**What:** Client detects current lesson from pathname and passes lessonId to chatbot
**When to use:** When chatbot opens on a lesson page
**Example:**
```typescript
// ChatWidget.tsx
import { usePathname } from 'next/navigation';

const pathname = usePathname();
// Match /lessons/[uuid] pattern
const lessonMatch = pathname?.match(/^\/lessons\/([a-f0-9-]+)$/);
const currentLessonId = lessonMatch?.[1] ?? null;

// Pass to ChatPanel which passes to useChatbot
<ChatPanel lessonId={currentLessonId} />
```

### Anti-Patterns to Avoid
- **Storing full UIMessage objects as a single JSON blob:** Store individual messages in a relational table for queryability; use JSONB for the `parts` array within each message.
- **Re-fetching the entire conversation from the API on each message:** Use `initialMessages` to restore, then rely on client-side state for new messages. Only save to DB via `onFinish`.
- **Using raw message text parsing for exercises:** Use AI SDK tool calling for structured exercise generation. Never try to parse exercise JSON from free-text AI responses.
- **Self-fetching API routes from server components for conversation loading:** Query DB directly from server components (established project pattern from Phase 25 bug fix).
- **Building a separate chat page:** The chatbot is a floating widget -- keep it as a panel overlay, not a full-page route.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chat message persistence | Custom WebSocket or polling | AI SDK `onFinish` + `toUIMessageStreamResponse` with `originalMessages` | Built-in, handles stream completion and client disconnect |
| Message restore on page load | Custom state sync | `useChat({ id, messages: initialMessages })` | Native AI SDK support, handles deduplication |
| Inline exercise generation | Parsing JSON from AI text responses | AI SDK tool calling (`tools` in `streamText`) | Structured, typed, validated output |
| Client-side MCQ grading | Custom grading logic | `gradeMultipleChoice` from `src/lib/practice-grading.ts` | Already implemented and tested (Phase 33) |
| Client-side fill-in-blank grading | Custom grading logic | `gradeFillInBlank` from `src/lib/practice-grading.ts` | Already implemented and tested (Phase 33) |
| Phonetic text rendering | Custom font switching | `PhoneticText` component from `src/components/phonetic/PhoneticText.tsx` | Already wraps font selection based on language preference |
| Chinese annotation parsing | Custom regex | `parseAnnotatedText` from `src/components/chat/ChineseAnnotation.tsx` | Already handles [char|pinyin|jyutping] format |
| Lesson context building | Duplicating queries | Adapt `buildLessonInstructions` from `src/lib/lesson-context.ts` | Already queries lesson + module + course + interactions |
| System prompt loading | Hardcoding prompts | `getPrompt("chatbot-system", fallback)` from `src/lib/prompts.ts` | Already has caching and DB fallback |
| Rate limiting | Custom middleware | Existing `aiChatLimiter` from `src/lib/rate-limit.ts` | Already configured for chat endpoint |

**Key insight:** The Phase 13 chatbot and Phase 31-33 exercise system already provide most building blocks. The work is primarily integration and restyling, not building from scratch.

## Common Pitfalls

### Pitfall 1: Message Format Mismatch Between DB and AI SDK
**What goes wrong:** Storing messages in a format incompatible with `UIMessage` causes errors when restoring conversations.
**Why it happens:** AI SDK v6 uses `UIMessage` with `parts: Array<{ type, text?, toolInvocation? }>` structure. If you store raw text strings, restoration fails.
**How to avoid:** Store the full `UIMessage[]` array as returned by the `onFinish` callback. The `messages` parameter in `onFinish` already includes both user and assistant messages in the correct format.
**Warning signs:** TypeScript errors when passing `initialMessages`, missing tool invocation results on restore.

### Pitfall 2: Chat ID Collisions or Missing IDs
**What goes wrong:** Multiple browser tabs or page refreshes create duplicate conversations or lose context.
**Why it happens:** Not generating a stable chat ID per conversation, or generating a new one on every render.
**How to avoid:** Generate the chat ID once when creating a new conversation, store it in state or URL. Use the conversation's DB ID, not a random client-side value.
**Warning signs:** Duplicate conversations in the database, messages appearing in wrong conversations.

### Pitfall 3: Lesson Context Not Updating When Navigating
**What goes wrong:** Student opens chatbot on Lesson A, navigates to Lesson B, chatbot still thinks it's Lesson A.
**Why it happens:** The `lessonId` is captured once and not updated when the pathname changes.
**How to avoid:** Use `usePathname()` in a `useEffect` to detect route changes. When `lessonId` changes, either start a new conversation or update the context. Consider prompting the student: "You've moved to a new lesson. Start a new conversation?"
**Warning signs:** Chatbot referencing wrong lesson vocabulary, confusing lesson context.

### Pitfall 4: consumeStream Missing on Server
**What goes wrong:** `onFinish` callback never fires because the client disconnected before the stream completed.
**Why it happens:** Without `result.consumeStream()`, the server stream depends on the client consuming it. If the client navigates away, the stream aborts.
**How to avoid:** Always call `result.consumeStream()` (without `await`) before returning the response. This ensures the stream completes server-side regardless of client state.
**Warning signs:** Missing messages in database, conversations cut off mid-response.

### Pitfall 5: Inline Exercise State Lost on Page Refresh
**What goes wrong:** Student was mid-exercise in the chat, refreshes page, exercise component is gone (just shows tool result text).
**Why it happens:** Tool invocation results are stored as data, but the interactive component state (selected option, typed answers) is ephemeral.
**How to avoid:** When restoring messages, re-render tool invocation parts with exercise components. If the exercise was already answered (stored in tool result), show the graded result. If not yet answered, show the interactive exercise again.
**Warning signs:** Blank areas where exercises were, or raw JSON displayed instead of interactive components.

### Pitfall 6: PhoneticText on User Messages Causes Layout Issues
**What goes wrong:** Phonetic font renders annotations above characters, increasing line height significantly in the compact chat bubble.
**Why it happens:** The custom phonetic fonts add vertical space for annotations above each character.
**How to avoid:** Apply PhoneticText only to detected Chinese text segments, not the entire message. Use a Chinese character detection regex to identify segments that should get phonetic treatment. Keep English text in the regular font.
**Warning signs:** Enormous chat bubbles, inconsistent line heights, broken bubble layout.

## Code Examples

### Database Schema for Chat Persistence
```typescript
// Source: Project pattern from src/db/schema/conversations.ts (voice AI)
// New file: src/db/schema/chat.ts

import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { lessons } from "./courses";

export const chatConversations = pgTable("chat_conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id")
    .references(() => lessons.id, { onDelete: "set null" }), // nullable — general chat has no lesson
  title: text("title"), // Auto-generated from first message or lesson title
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => chatConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  parts: jsonb("parts").notNull(), // UIMessage parts array
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### Lesson Context Injection for Chatbot
```typescript
// Adapt from src/lib/lesson-context.ts pattern
// The chatbot already has a system prompt loaded via getPrompt("chatbot-system")
// Add lesson context as an additional section when lessonId is provided

async function buildChatLessonContext(lessonId: string): Promise<string> {
  const lessonData = await db
    .select({
      lessonTitle: lessons.title,
      moduleTitle: modules.title,
      courseTitle: courses.title,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .limit(1);

  if (lessonData.length === 0) return "";

  const lesson = lessonData[0];

  // Get lesson interactions for vocabulary
  const interactionData = await db
    .select({ prompt: interactions.prompt, expectedAnswer: interactions.expectedAnswer })
    .from(interactions)
    .where(eq(interactions.lessonId, lessonId));

  const vocab = interactionData.length > 0
    ? interactionData.map(i => `- ${i.prompt}${i.expectedAnswer ? ` (${i.expectedAnswer})` : ""}`).join("\n")
    : "No specific vocabulary for this lesson.";

  return `\n\nCURRENT LESSON CONTEXT:
The student is currently on: "${lesson.lessonTitle}" in module "${lesson.moduleTitle}" of course "${lesson.courseTitle}".

Lesson vocabulary and phrases:
${vocab}

BEHAVIOR:
- Reference this lesson's vocabulary naturally in your responses
- Suggest practice topics based on this lesson's content
- When generating exercises, use vocabulary from this lesson
- If the student asks about unrelated topics, help them but gently bring conversation back to lesson material`;
}
```

### Inline Exercise Rendering in ChatMessage
```typescript
// ChatMessage.tsx - handle tool invocation parts for exercises
function renderPart(part: MessagePart) {
  if (part.type === "tool-invocation" && part.toolName === "generateExercise") {
    if (part.state === "result") {
      const exerciseData = part.result?.exercise;
      return <ChatExercise definition={exerciseData} />;
    }
    return <p className="text-xs text-gray-400 animate-pulse">Generating exercise...</p>;
  }
  // ... existing text rendering
}
```

### iMessage-Style Bubble Component
```typescript
// ChatBubble.tsx pattern
interface ChatBubbleProps {
  role: "user" | "assistant";
  timestamp: Date;
  children: React.ReactNode;
}

export function ChatBubble({ role, timestamp, children }: ChatBubbleProps) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-1`}>
      <div className={`max-w-[80%] ${
        isUser
          ? "bg-blue-600 text-white rounded-2xl rounded-br-sm"
          : "bg-zinc-800 text-zinc-100 rounded-2xl rounded-bl-sm"
      } px-4 py-2.5`}>
        {children}
      </div>
    </div>
    <p className={`text-[10px] text-zinc-500 ${isUser ? "text-right" : "text-left"} px-2`}>
      {formatRelativeTime(timestamp)}
    </p>
  );
}
```

## State of the Art

| Old Approach (Phase 13) | Current Approach (Phase 35) | What Changed | Impact |
|---|---|---|---|
| In-memory messages only (lost on refresh) | DB-persisted conversations with `onFinish` | AI SDK v6 added `originalMessages` + `onFinish` pattern | Students can resume conversations |
| No lesson awareness | Lesson context injected from URL detection | New feature | Chatbot becomes lesson-specific tutor |
| Text-only responses | Tool calling for inline exercises | AI SDK tool calling was always available | Interactive practice within chat |
| Simple message list | iMessage-style bubbles with timestamps | UI redesign | More natural, familiar chat UX |

**Deprecated/outdated:**
- AI SDK v5 `useChat` used `onFinish` client-side; v6 moves persistence to the server-side `onFinish` in `streamText` or `toUIMessageStreamResponse`
- AI SDK v5 used `Message` type; v6 uses `UIMessage` with `parts` array (already adopted in Phase 13)

## Existing Codebase Inventory

### Files to MODIFY
| File | What Changes | Why |
|------|-------------|-----|
| `src/hooks/useChatbot.ts` | Add `chatId`, `lessonId`, `initialMessages` props; pass in transport body | Persistence + lesson context |
| `src/components/chat/ChatWidget.tsx` | Detect lesson from pathname; manage conversation ID; add conversation switcher | Lesson awareness + persistence |
| `src/components/chat/ChatPanel.tsx` | Restyle as iMessage UI; add timestamps; support conversation list | CHAT-01 requirement |
| `src/components/chat/ChatMessage.tsx` | Restyle as bubbles; render tool invocations as exercises; add PhoneticText to user messages | CHAT-01, CHAT-02, CHAT-04 |
| `src/app/api/chat/route.ts` | Accept chatId/lessonId; inject lesson context; add exercise tool; persist with onFinish | CHAT-03, CHAT-04, CHAT-05, CHAT-06 |
| `src/db/schema/index.ts` | Add `export * from "./chat"` | New schema registration |
| `src/app/layout.tsx` | No change needed (ChatWidget already mounted globally) | - |

### Files to CREATE
| File | Purpose |
|------|---------|
| `src/db/schema/chat.ts` | `chat_conversations` + `chat_messages` tables |
| `src/lib/chat-persistence.ts` | `saveChat`, `loadChat`, `listUserConversations` helpers |
| `src/components/chat/ChatBubble.tsx` | iMessage-style bubble with timestamp |
| `src/components/chat/ChatExercise.tsx` | Inline exercise renderer (MCQ + fill-in-blank) with grading |
| `src/components/chat/ChatConversationList.tsx` | Conversation history sidebar/dropdown |
| `src/app/api/chat/conversations/route.ts` | GET: list conversations, POST: create conversation |
| `src/app/api/chat/[chatId]/route.ts` | GET: load conversation messages |

### Reusable Components from Earlier Phases
| Component/Utility | From | Reuse How |
|---|---|---|
| `PhoneticText` | Phase 30 | Wrap user-typed Chinese text in chat bubbles |
| `ChineseAnnotation` + `parseAnnotatedText` | Phase 13 | Parse AI responses with `[char|pinyin|jyutping]` format |
| `gradeMultipleChoice` | Phase 33 | Grade inline MCQ exercises client-side |
| `gradeFillInBlank` | Phase 33 | Grade inline fill-in-blank exercises client-side |
| `MultipleChoiceDefinition` / `FillInBlankDefinition` | Phase 31 | Type definitions for inline exercise data |
| `buildLessonInstructions` pattern | Phase 8 | Adapt lesson context query pattern for chatbot |
| `getPrompt` | Phase 10 | Load chatbot system prompt from database |
| `searchKnowledgeBase` | Phase 12/13 | Existing RAG tool in chat API |

## Open Questions

Things that couldn't be fully resolved:

1. **Conversation title generation strategy**
   - What we know: Each conversation needs a title for the conversation list
   - What's unclear: Should it be auto-generated from the first user message, from the lesson title, or AI-generated?
   - Recommendation: Use lesson title if lesson-specific ("Practice: Beginner Greetings"), or first user message truncated to 50 chars for general chats. Claude's discretion.

2. **Maximum conversation history to load**
   - What we know: AI SDK docs slice to last 20 messages for context window
   - What's unclear: How many messages to load for UI display vs. send to AI
   - Recommendation: Load all messages for UI display, send last 20 to AI (existing pattern in `route.ts` line 61: `messages.slice(-20)`)

3. **Exercise answer persistence in chat**
   - What we know: Tool results are part of the message stream and will be saved with the conversation
   - What's unclear: Should student exercise answers also be tracked separately (like practice attempts)?
   - Recommendation: Keep it simple -- exercise answers stay within the chat message stream. No separate tracking for inline chat exercises (they're informal practice, not graded assignments).

4. **Conversation-per-lesson vs. continuing conversation**
   - What we know: The requirement says "lesson-specific conversation practice"
   - What's unclear: Should navigating to a different lesson auto-start a new conversation, or let the student choose?
   - Recommendation: Auto-start a new lesson-specific conversation when opening chatbot from a new lesson. Allow student to switch to previous conversations via the conversation list.

5. **Chinese text detection in user messages for PhoneticText**
   - What we know: PhoneticText applies phonetic font to wrapped text
   - What's unclear: How to detect which parts of a user message are Chinese vs. English
   - Recommendation: Use a Unicode range regex (`/[\u4e00-\u9fff\u3400-\u4dbf]/`) to detect Chinese character runs. Wrap Chinese segments in PhoneticText, leave English segments in default font.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/ai-sdk_dev` - Chat persistence with `onFinish`, `originalMessages`, `initialMessages`, and `consumeStream` patterns
- Context7 `/websites/ai-sdk_dev` - Tool calling with structured output in `streamText`
- Codebase: `src/app/api/chat/route.ts` - Current chat API implementation
- Codebase: `src/hooks/useChatbot.ts` - Current useChat wrapper
- Codebase: `src/components/chat/*` - Current chat UI components
- Codebase: `src/lib/lesson-context.ts` - Lesson context building pattern
- Codebase: `src/lib/practice-grading.ts` - Client-side grading functions
- Codebase: `src/types/exercises.ts` - Exercise definition types
- Codebase: `src/components/phonetic/PhoneticText.tsx` - Phonetic font wrapper
- Codebase: `src/db/schema/conversations.ts` - Voice AI conversation schema (reference pattern)

### Secondary (MEDIUM confidence)
- Vercel AI SDK documentation on chat message persistence patterns

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and in use
- Architecture: HIGH - Follows existing project patterns; AI SDK docs confirm persistence approach
- Pitfalls: HIGH - Based on actual codebase analysis and official AI SDK documentation
- Inline exercises: MEDIUM - Tool calling approach is well-documented but inline rendering pattern is custom integration

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (stable - all dependencies already pinned in project)
