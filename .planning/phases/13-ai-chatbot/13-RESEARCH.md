# Phase 13: AI Chatbot - Research

**Researched:** 2026-01-30
**Domain:** AI-powered chatbot with streaming, RAG retrieval, and Chinese language rendering
**Confidence:** HIGH

## Summary

This phase adds a floating AI chatbot widget to all pages of the LMS. The chatbot must stream responses in real-time, maintain conversation context within a session, allow clearing conversation, respect student language preferences, output in Simplified Chinese / Traditional Chinese / Cantonese with Pinyin/Jyutping annotations, and retrieve answers from the existing knowledge base (RAG).

The standard approach is to use the **Vercel AI SDK** (`ai` + `@ai-sdk/openai`) with the `useChat` hook for the frontend and `streamText` for the backend API route. The knowledge base already has a keyword search API (`/api/knowledge/search`) with `ilike`-based matching across chunks and entries. The chatbot API route will call this search internally (server-side) to inject relevant KB context into the system prompt before sending to the LLM. No vector embeddings are needed since the existing keyword search is sufficient for the current KB size and use case.

**Primary recommendation:** Use AI SDK 6 (`ai` + `@ai-sdk/openai` + `@ai-sdk/react`) with `useChat` hook for streaming UI and `streamText` with tool-based KB retrieval on the server. Render Chinese annotations reusing the existing `<ruby>` pattern from `SubtitleOverlay`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | ^6.0.39 | AI SDK core - `streamText`, `convertToModelMessages`, `tool` | Official Vercel AI toolkit, 20M+ monthly downloads, built for Next.js streaming |
| `@ai-sdk/openai` | ^3.0.12 | OpenAI provider for AI SDK | Official provider, uses `OPENAI_API_KEY` env var (already configured in project) |
| `@ai-sdk/react` | (bundled w/ ai) | React hooks - `useChat`, `DefaultChatTransport` | Provides `useChat` hook with automatic streaming, status management, message state |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^4.3.6 (already installed) | Tool input schema validation | Define schemas for KB search tool parameters |
| `lucide-react` | ^0.563.0 (already installed) | Icons for chat UI | MessageCircle, X, Send, Trash2 icons |
| `framer-motion` | ^12.29.2 (already installed) | Chat widget open/close animation | Smooth expand/collapse of floating widget |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| AI SDK `useChat` | Direct OpenAI streaming + custom SSE parsing | Much more manual work; AI SDK handles all the complexity |
| AI SDK `streamText` | n8n webhook for chatbot | n8n adds latency; direct API call is faster for streaming; but breaks the "AI via n8n" pattern used for grading |
| Keyword search (ilike) for RAG | pgvector embeddings for semantic search | pgvector is better for large KBs; ilike is sufficient for current KB size, already built, no new dependencies |
| OpenAI `gpt-4o` | Anthropic Claude | OpenAI already configured in project (OPENAI_API_KEY), used for voice bot |

**Installation:**
```bash
npm install ai @ai-sdk/openai @ai-sdk/react
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── api/chat/route.ts              # Streaming chat API endpoint
│   └── layout.tsx                      # Add ChatWidget here (global)
├── components/
│   └── chat/
│       ├── ChatWidget.tsx              # Floating button + panel container
│       ├── ChatPanel.tsx               # Chat panel (messages, input, controls)
│       ├── ChatMessage.tsx             # Single message bubble with annotation support
│       └── ChineseAnnotation.tsx       # Ruby annotation renderer for chat content
├── hooks/
│   └── useChatbot.ts                   # Wrapper around useChat with KB/language config
└── lib/
    └── chat-utils.ts                   # KB search helper, prompt construction
```

### Pattern 1: AI SDK Streaming Chat with RAG Tool
**What:** Use AI SDK's `streamText` with a `getKnowledgeBase` tool that the LLM calls to search the KB before answering.
**When to use:** When the chatbot needs to answer questions grounded in the knowledge base.
**Example:**
```typescript
// Source: AI SDK docs - RAG chatbot guide
// app/api/chat/route.ts
import { convertToModelMessages, streamText, tool, UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    system: `You are a helpful learning assistant for CantoMando Blueprint...
      Check your knowledge base before answering questions.
      If relevant information is found, use it to answer accurately.`,
    messages: await convertToModelMessages(messages),
    tools: {
      searchKnowledgeBase: tool({
        description: 'Search the knowledge base for information to answer student questions',
        inputSchema: z.object({
          query: z.string().describe('The search query'),
        }),
        execute: async ({ query }) => {
          // Call existing KB search logic server-side
          return await searchKnowledgeBase(query);
        },
      }),
    },
    maxSteps: 3, // Allow multi-step: search KB, then answer
  });

  return result.toUIMessageStreamResponse();
}
```

### Pattern 2: Floating Chat Widget with Fixed Positioning
**What:** A fixed-position button in the bottom-right corner that expands into a chat panel.
**When to use:** Global chatbot available on all pages.
**Example:**
```typescript
// Source: Common pattern for floating chat widgets
// components/chat/ChatWidget.tsx
'use client';

import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChatPanel } from './ChatPanel';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-16 right-0 w-[380px] h-[520px]
                       bg-gray-900 border border-gray-700 rounded-2xl
                       shadow-2xl overflow-hidden flex flex-col"
          >
            <ChatPanel onClose={() => setIsOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full bg-cyan-600 hover:bg-cyan-500
                   text-white shadow-lg flex items-center justify-center
                   transition-colors"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}
```

### Pattern 3: useChat Hook with Language Preference
**What:** Wrap `useChat` to automatically inject language preference into each request.
**When to use:** Every chat interaction needs to respect the student's saved language preference.
**Example:**
```typescript
// Source: AI SDK useChat docs + project pattern
// hooks/useChatbot.ts
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useLanguagePreference } from './useLanguagePreference';

export function useChatbot() {
  const { preference } = useLanguagePreference();

  const chat = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { languagePreference: preference },
    }),
  });

  return chat;
}
```

### Pattern 4: Chinese Text with Ruby Annotations in Chat Messages
**What:** Render Chinese characters with Pinyin/Jyutping using `<ruby>` HTML elements (same pattern as SubtitleOverlay).
**When to use:** When chatbot responses contain Chinese text that needs annotation.
**Example:**
```typescript
// Source: Existing SubtitleOverlay.tsx pattern in this codebase
// components/chat/ChineseAnnotation.tsx
export function ChineseAnnotation({
  chinese,
  pinyin,
  jyutping,
}: {
  chinese: string;
  pinyin?: string;
  jyutping?: string;
}) {
  const chars = [...chinese];
  const pinyinArr = pinyin?.split(' ') ?? [];
  const jyutpingArr = jyutping?.split(' ') ?? [];

  return (
    <span className="inline">
      {chars.map((char, i) => (
        <ruby key={i} className="mx-0.5">
          {char}
          {pinyinArr[i] && (
            <rt className="text-xs text-yellow-400">{pinyinArr[i]}</rt>
          )}
          {jyutpingArr[i] && (
            <rt className="text-xs text-cyan-400">{jyutpingArr[i]}</rt>
          )}
        </ruby>
      ))}
    </span>
  );
}
```

### Anti-Patterns to Avoid
- **Client-side API key exposure:** Never send `OPENAI_API_KEY` to the client. The AI SDK API route handles this server-side.
- **Unbounded conversation history:** Sending all messages to the LLM on every request will exceed context limits and increase costs. Trim to last N messages (e.g., 20) or use summarization.
- **Polling instead of streaming:** The AI SDK uses Server-Sent Events (SSE) for streaming. Do not implement polling.
- **Direct DB queries from client components:** Always go through API routes; the chat API route handles KB search server-side.
- **Embedding the widget in every page component:** Add it once in the root layout, not per-page.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Streaming chat UI | Custom SSE parsing + state management | AI SDK `useChat` hook | Handles streaming, message state, status, abort, error recovery |
| Server-side streaming response | Manual `ReadableStream` + event encoding | AI SDK `streamText` + `toUIMessageStreamResponse()` | Handles protocol, backpressure, abort signals |
| Chat message formatting | Custom message state array | AI SDK `messages` with `parts` (text, tool-call, etc.) | Handles multi-part messages, tool results, streaming updates |
| Tool calling / function calling | Manual OpenAI function calling parsing | AI SDK `tool()` with Zod schemas | Type-safe, auto-validates, handles multi-step tool use |
| Floating widget positioning | Custom absolute positioning logic | CSS `fixed bottom-6 right-6 z-50` | Simple, reliable, no library needed |

**Key insight:** The AI SDK abstracts away all the complexity of streaming protocols, message state management, and tool calling. Building these manually would be error-prone and take 10x longer.

## Common Pitfalls

### Pitfall 1: Forgetting `maxDuration` on API Route
**What goes wrong:** Vercel/Next.js default function timeout is 10 seconds. LLM responses with KB search tool calls can take 15-25 seconds.
**Why it happens:** Default timeout is too short for multi-step LLM calls.
**How to avoid:** Add `export const maxDuration = 30;` to the API route.
**Warning signs:** "504 Gateway Timeout" errors in production.

### Pitfall 2: Not Converting UIMessage to ModelMessage
**What goes wrong:** Sending raw `UIMessage[]` to `streamText` causes type errors or missing context.
**Why it happens:** `useChat` sends `UIMessage` format which includes UI-specific fields. The LLM needs `ModelMessage` format.
**How to avoid:** Always use `await convertToModelMessages(messages)` in the API route.
**Warning signs:** TypeScript errors or LLM receiving malformed messages.

### Pitfall 3: Chinese Annotation Parsing Failures
**What goes wrong:** Ruby annotations misalign when Chinese text includes punctuation, spaces, or mixed scripts.
**Why it happens:** Character count != syllable count when punctuation is present.
**How to avoid:** Only annotate CJK characters (regex: `/[\u4e00-\u9fff]/`), skip punctuation and latin characters.
**Warning signs:** Pinyin/Jyutping appearing over wrong characters.

### Pitfall 4: Chat Widget Blocking Page Interactions
**What goes wrong:** The chat panel or its backdrop captures clicks meant for the underlying page.
**Why it happens:** High z-index and improper event handling.
**How to avoid:** Use precise z-index (z-50), don't add a full-screen backdrop, ensure the chat panel has explicit bounds.
**Warning signs:** Users unable to click buttons on the page when chat is open.

### Pitfall 5: Unbounded Message History Costs
**What goes wrong:** API costs spike as conversations grow because all messages are sent each turn.
**Why it happens:** `useChat` sends the full message array by default.
**How to avoid:** In the API route, slice messages to last 20 before sending to LLM, or implement conversation summarization.
**Warning signs:** Slow responses and high OpenAI bills.

### Pitfall 6: KB Search Returns No Context
**What goes wrong:** Chatbot answers without KB context, producing hallucinated answers.
**Why it happens:** The LLM doesn't always choose to call the search tool.
**How to avoid:** Use a strong system prompt: "Always search the knowledge base before answering factual questions about the platform." Consider also pre-searching based on the user message before calling `streamText`.
**Warning signs:** Chatbot gives generic answers instead of platform-specific ones.

## Code Examples

### Complete API Route with RAG Tool
```typescript
// Source: AI SDK docs + project context
// app/api/chat/route.ts
import { convertToModelMessages, streamText, tool, UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { db } from '@/db';
import { kbChunks, kbEntries } from '@/db/schema';
import { and, eq, ilike } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { getPrompt } from '@/lib/prompts';

export const maxDuration = 30;

const DEFAULT_SYSTEM_PROMPT = `You are a helpful learning assistant for CantoMando Blueprint,
an LMS teaching Mandarin and Cantonese simultaneously.
Always search the knowledge base before answering factual questions.
Respond in the language the student prefers.`;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages, languagePreference } = await req.json() as {
    messages: UIMessage[];
    languagePreference: string;
  };

  const systemPrompt = await getPrompt('chatbot-system', DEFAULT_SYSTEM_PROMPT);

  const result = streamText({
    model: openai('gpt-4o'),
    system: `${systemPrompt}\n\nStudent language preference: ${languagePreference}`,
    messages: await convertToModelMessages(messages.slice(-20)),
    tools: {
      searchKnowledgeBase: tool({
        description: 'Search the knowledge base to find relevant information for answering student questions about the platform, courses, Chinese language, packages, or coaching.',
        inputSchema: z.object({
          query: z.string().describe('Search keywords'),
        }),
        execute: async ({ query }) => {
          const sanitized = query.trim().replace(/%/g, '\\%').replace(/_/g, '\\_');
          const pattern = `%${sanitized}%`;
          const results = await db
            .select({
              content: kbChunks.content,
              title: kbEntries.title,
            })
            .from(kbChunks)
            .innerJoin(kbEntries, eq(kbChunks.entryId, kbEntries.id))
            .where(and(
              ilike(kbChunks.content, pattern),
              eq(kbEntries.status, 'published'),
            ))
            .limit(5);
          return results.length > 0
            ? results.map(r => `[${r.title}]: ${r.content}`).join('\n\n')
            : 'No relevant information found in knowledge base.';
        },
      }),
    },
    maxSteps: 3,
  });

  return result.toUIMessageStreamResponse();
}
```

### Client-Side Chat Panel with useChat
```typescript
// Source: AI SDK useChat docs
// components/chat/ChatPanel.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';
import { Send, Trash2, X } from 'lucide-react';

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { languagePreference: 'both' }, // from useLanguagePreference
    }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && status === 'ready') {
      sendMessage({ text: input });
      setInput('');
    }
  };

  const handleClear = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h3 className="font-semibold text-white">Learning Assistant</h3>
        <div className="flex gap-2">
          <button onClick={handleClear}><Trash2 size={16} /></button>
          <button onClick={onClose}><X size={16} /></button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((message) => (
          <div key={message.id} className={message.role === 'user' ? 'ml-auto' : ''}>
            {message.parts.map((part, i) =>
              part.type === 'text' ? <p key={i}>{part.text}</p> : null
            )}
          </div>
        ))}
        {status === 'submitted' && <div>Thinking...</div>}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-gray-700 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== 'ready'}
          placeholder="Ask a question..."
          className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm"
        />
        <button type="submit" disabled={status !== 'ready'}>
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AI SDK v3 `useChat` with `handleSubmit` | AI SDK v6 `useChat` with `sendMessage` + `DefaultChatTransport` | AI SDK 5/6 (2025-2026) | `sendMessage` replaces `handleSubmit`; `transport` replaces `api` string |
| `result.toDataStreamResponse()` | `result.toUIMessageStreamResponse()` | AI SDK 5+ | New protocol for UI message streaming |
| Manual SSE parsing | AI SDK handles streaming protocol | AI SDK 3+ | No need to manually parse Server-Sent Events |
| Direct `messages` prop on useChat | `convertToModelMessages()` on server | AI SDK 5+ | Explicit conversion between UI and model message formats |
| OpenAI SDK direct streaming | AI SDK provider abstraction | AI SDK 4+ | Provider-agnostic; swap models with one line |

**Deprecated/outdated:**
- `useChat({ api: '/api/chat' })` - replaced by `transport: new DefaultChatTransport({ api: '/api/chat' })` in AI SDK 6
- `result.toDataStreamResponse()` - replaced by `result.toUIMessageStreamResponse()` for UI consumption
- `handleSubmit` / `input` from useChat - replaced by manual `sendMessage` + `useState` pattern in AI SDK 6

## Open Questions

1. **Chinese annotation in chatbot responses**
   - What we know: The existing `SubtitleOverlay` uses `<ruby>` + `<rt>` for pre-annotated text where pinyin/jyutping are provided separately. Chatbot responses will be free-form text from the LLM.
   - What's unclear: How to automatically generate Pinyin/Jyutping annotations for Chinese characters in chatbot responses. The LLM could be prompted to include them, or a client-side library could be used.
   - Recommendation: Prompt the LLM to include annotations in a parseable format (e.g., `你好(nǐ hǎo)`) and parse on the client. This avoids additional dependencies and leverages the LLM's Chinese language knowledge. Alternatively, instruct the LLM to use a structured format like `[char|pinyin|jyutping]` that the client can render as ruby annotations.

2. **Chat conversation persistence**
   - What we know: Requirement CHAT-03 says "maintains conversation context within session." CHAT-04 says "clear chat and start new conversation."
   - What's unclear: Whether conversations should be persisted to the database (like voice conversations in the `conversations` table) or kept in-memory only.
   - Recommendation: Start with client-side only (in-memory via `useChat` state). The `useChat` hook manages messages in React state, which naturally clears on page refresh. This satisfies CHAT-03 and CHAT-04 without database complexity. Add persistence later if needed.

3. **Student-only visibility**
   - What we know: The chatbot should appear for students. Coaches/admins have their own admin tools.
   - What's unclear: Should the chatbot widget be visible to coaches/admins too? It could be useful for testing.
   - Recommendation: Show to all authenticated users but with a role check to conditionally render. Default: show to students, hide for admin pages.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/ai-sdk_dev` - useChat hook, streamText API, RAG chatbot guide, chatbot UI patterns
- Context7 `/openai/openai-node` - OpenAI streaming chat completions
- [AI SDK Official Docs](https://ai-sdk.dev/docs/introduction) - Getting started, useChat reference, chatbot guide
- [AI SDK RAG Chatbot Guide](https://ai-sdk.dev/docs/guides/rag-chatbot) - Tool-based retrieval architecture
- [AI SDK npm package](https://www.npmjs.com/package/ai) - Version 6.0.39, latest release
- [@ai-sdk/openai npm](https://www.npmjs.com/package/@ai-sdk/openai) - Version 3.0.12

### Secondary (MEDIUM confidence)
- [AI SDK 6 Blog Post](https://vercel.com/blog/ai-sdk-6) - Major version changes, migration path
- [Blazity shadcn-chatbot-kit](https://github.com/Blazity/shadcn-chatbot-kit) - Chat widget UI patterns
- Existing codebase: `SubtitleOverlay.tsx`, `useLanguagePreference.ts`, knowledge search API, prompts system

### Tertiary (LOW confidence)
- Chat widget floating position pattern (community convention, not official docs)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - AI SDK is well-documented with official guides matching this exact use case
- Architecture: HIGH - Follows official AI SDK patterns for Next.js + RAG chatbot
- Pitfalls: HIGH - Based on official documentation warnings and known patterns
- Chinese annotation in chat: MEDIUM - LLM-based annotation is viable but exact prompt format needs experimentation

**Research date:** 2026-01-30
**Valid until:** 2026-03-01 (stable - AI SDK 6 is current major version)
