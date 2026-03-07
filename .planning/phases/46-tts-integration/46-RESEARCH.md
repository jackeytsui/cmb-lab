# Phase 46: TTS Integration - Research

**Researched:** 2026-02-08
**Domain:** Azure Text-to-Speech REST API, SSML, Redis caching, client-side audio playback
**Confidence:** HIGH

## Summary

Phase 46 adds Azure Text-to-Speech to the LMS, enabling character-level and sentence-level audio pronunciation for both Mandarin and Cantonese. The implementation is straightforward because the project already has all infrastructure in place: Azure Speech credentials (same key/region as pronunciation scoring in `src/lib/pronunciation.ts`), Upstash Redis for caching (`@upstash/redis` v1.36.1), and rate limiting (`@upstash/ratelimit` v2.0.8). No new npm packages are needed.

The architecture is a single POST `/api/tts` route that builds SSML, checks Redis cache, calls Azure TTS REST API on miss, caches the MP3 audio as base64, and returns the binary audio. A `src/lib/tts.ts` module encapsulates SSML building, voice resolution, and cache logic. A `src/hooks/useTTS.ts` client hook manages fetch, blob URL caching, Audio API playback, loading/playing state, and stop control. The existing v6 research at `.planning/research/v6-azure-tts.md` contains comprehensive voice lists, SSML examples, pricing, and implementation patterns -- all verified as accurate against the codebase and Azure documentation.

**Primary recommendation:** Use the Azure TTS REST API directly (not SDK), standard neural voices only (NOT HD), Redis base64 caching with tiered TTL, and a single shared `useTTS` hook for all playback across the reader, popup, and sentence features.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@upstash/redis` | ^1.36.1 | Redis cache for TTS audio responses | Already installed, `Redis.fromEnv()` pattern used in `rate-limit.ts` and `echo-detection.ts` |
| `@upstash/ratelimit` | ^2.0.8 | Rate limit TTS API requests per user | Already installed, pattern in `rate-limit.ts` |
| `pinyin-pro` | ^3.28.0 | Generate pinyin for SSML phoneme tags (polyphonic chars) | Already installed, verified working for dictionary |
| `to-jyutping` | ^3.1.1 | Generate jyutping for Cantonese SSML phoneme tags | Already installed, verified working for dictionary |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `crypto` | Built-in | MD5 hash for cache keys | Every TTS request to build deterministic cache key |
| Web Audio API | Built-in | `new Audio()` for client playback | Every playback in `useTTS` hook |
| `URL.createObjectURL` | Built-in | Blob URL caching on client side | Every successful audio fetch to avoid re-downloading |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| REST API | `microsoft-cognitiveservices-speech-sdk` | SDK is ~50MB, adds streaming but overkill for short Chinese text. REST API matches existing `pronunciation.ts` pattern |
| Base64 in Redis | Binary buffers in Redis | Upstash REST API works with strings; base64 adds ~33% overhead but keeps things simple. For 6KB character audio, cached value is ~8KB -- negligible |
| Server-side synthesis | Browser-side SDK | Would expose Azure key to client and bypass Redis cache. Not viable for security or cost |

### Installation
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  app/api/tts/
    route.ts              # POST handler: auth -> validate -> cache check -> Azure call -> cache set -> return MP3
  lib/
    tts.ts                # SSML builder, voice resolver, cache key builder, XML escape
  hooks/
    useTTS.ts             # Client-side: fetch /api/tts, blob URL cache, Audio playback, state management
```

### Pattern 1: Server-Side TTS with Redis Cache-Aside
**What:** API route checks Redis cache before calling Azure. On miss, calls Azure, caches result as base64 string with tiered TTL, returns binary MP3.
**When to use:** Every TTS request.
**Example:**
```typescript
// Source: Verified from codebase patterns (rate-limit.ts, echo-detection.ts, pronunciation.ts)
import { Redis } from "@upstash/redis";
import crypto from "crypto";

const redis = Redis.fromEnv();

function buildCacheKey(text: string, language: string, voice: string, rate: string): string {
  const hash = crypto.createHash("md5").update(text).digest("hex");
  return `tts:${language}:${voice}:${rate}:${hash}`;
}

// Cache-aside pattern:
const cached = await redis.get<string>(cacheKey);
if (cached) {
  const audioBuffer = Buffer.from(cached, "base64");
  return new NextResponse(audioBuffer, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" },
  });
}

// On miss: call Azure, then cache
const audioBuffer = Buffer.from(await azureResponse.arrayBuffer());
const ttl = text.length <= 2 ? 604800 : text.length <= 6 ? 259200 : 86400;
await redis.set(cacheKey, audioBuffer.toString("base64"), { ex: ttl });
```

### Pattern 2: Azure TTS REST API Call
**What:** POST to `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1` with SSML body and subscription key header. Returns raw MP3 binary.
**When to use:** Every cache miss.
**Example:**
```typescript
// Source: Azure TTS REST API docs (https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech)
// Matches existing pattern in src/lib/pronunciation.ts (same key, region, fetch pattern)
const response = await fetch(
  `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
  {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "CantoMandoBlueprint",
    },
    body: ssml,
    signal: controller.signal, // 5-second AbortController timeout
  }
);
const audioBuffer = Buffer.from(await response.arrayBuffer());
```

### Pattern 3: SSML Builder with Phoneme Support
**What:** TypeScript functions that build SSML strings for different TTS modes (character, word, sentence) with prosody rate control and optional phoneme tags for polyphonic character disambiguation.
**When to use:** Every Azure TTS call to construct the request body.
**Example:**
```typescript
// Source: Azure SSML docs (https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation)
function buildSSML(text: string, voiceName: string, lang: string, rate: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">
  <voice name="${voiceName}">
    <prosody rate="${rate}">${escapeXml(text)}</prosody>
  </voice>
</speak>`;
}

// Phoneme variant for polyphonic characters:
function buildPhonemeSSML(text: string, phoneme: string, voiceName: string, lang: string, rate: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">
  <voice name="${voiceName}">
    <prosody rate="${rate}">
      <phoneme alphabet="sapi" ph="${escapeXml(phoneme)}">${escapeXml(text)}</phoneme>
    </prosody>
  </voice>
</speak>`;
}
```

### Pattern 4: Client-Side Audio Hook with Blob URL Cache
**What:** React hook that fetches audio from `/api/tts`, creates blob URLs, caches them in a `Map` ref, manages playback via `Audio` API, and exposes `speak`, `stop`, `isPlaying`, `isLoading`.
**When to use:** Every component that triggers TTS (popup, reader, sentence controls).
**Example:**
```typescript
// Source: Standard React pattern, matches existing hooks in src/hooks/
const cacheRef = useRef<Map<string, string>>(new Map());
const audioRef = useRef<HTMLAudioElement | null>(null);

const speak = useCallback(async (text: string, options?: TTSOptions) => {
  // Stop current audio
  if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

  const key = `${text}:${options?.language}:${options?.rate}`;
  let url = cacheRef.current.get(key);

  if (!url) {
    setIsLoading(true);
    const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, ...options }) });
    const blob = await res.blob();
    url = URL.createObjectURL(blob);
    cacheRef.current.set(key, url);
    setIsLoading(false);
  }

  const audio = new Audio(url);
  audioRef.current = audio;
  setIsPlaying(true);
  audio.onended = () => setIsPlaying(false);
  audio.play();
}, []);
```

### Anti-Patterns to Avoid
- **Exposing Azure key to client:** Never call Azure TTS from the browser. Always proxy through `/api/tts` server route.
- **Using HD voices:** HD voices (`DragonHDLatestNeural`) lack `<prosody>` and `<break>` support -- critical for language learning rate control. Always use standard neural voices.
- **Overlapping audio playback:** Without stopping current audio before playing new, rapid hover-to-hear causes overlapping sounds. Always `.pause()` + nullify the ref before new playback.
- **Not escaping SSML text:** Chinese text with `&`, `<`, `>` will break SSML XML parsing. Always run `escapeXml()` on user text.
- **Relying on Azure defaults for pronunciation:** Polyphonic characters (行, 了, 还, 得, 地, 长) may be mispronounced without explicit `<phoneme>` tags. Use `pinyin-pro` to detect and inject phoneme annotations.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio caching | Custom file-based cache or DB storage | Upstash Redis with base64 strings and TTL | Already configured, handles expiry, distributed, serverless-compatible. Max record size 100MB (per Upstash docs), our max is ~240KB base64 for paragraphs |
| Rate limiting | Custom counter logic | `@upstash/ratelimit` sliding window | Already configured with role-based elevation pattern in `rate-limit.ts` |
| Pinyin generation | Custom lookup table for polyphonic chars | `pinyin-pro` `.pinyin()` with `toneType: 'num'` | Already installed, handles context-dependent pronunciation for thousands of polyphonic characters |
| Jyutping generation | Custom Cantonese pronunciation table | `to-jyutping` | Already installed, covers zh-HK pronunciation |
| XML escaping | Manual string replacement | Dedicated `escapeXml()` utility | 5 characters to escape (`&`, `<`, `>`, `"`, `'`), easy to miss one |
| Audio playback state | Custom event listener management | React hook with `useCallback`, `useRef`, `useState` | Standard React pattern, matches existing 14 hooks in `src/hooks/` |

**Key insight:** Every piece of infrastructure for this phase is already installed and has established patterns in the codebase. The only new code is the TTS-specific business logic (SSML building, voice mapping, cache key construction).

## Common Pitfalls

### Pitfall 1: HD Voices Lack SSML Control
**What goes wrong:** Using `zh-CN-Xiaochen:DragonHDLatestNeural` or any HD voice results in `<prosody>` and `<break>` tags being silently ignored -- audio plays at normal speed regardless of rate parameter.
**Why it happens:** HD voices use a different synthesis engine that doesn't support SSML prosody control. This is documented but easy to miss.
**How to avoid:** Hard-code voice names to standard neural voices only: `zh-CN-XiaoxiaoNeural` (Mandarin) and `zh-HK-HiuMaanNeural` (Cantonese). Validate voice names in the API route.
**Warning signs:** Audio always plays at the same speed regardless of rate parameter.

### Pitfall 2: SSML XML Injection / Parsing Failure
**What goes wrong:** Chinese text containing `&` (e.g., in dictionary definitions) or user-pasted text with `<` breaks SSML parsing, causing Azure to return 400.
**Why it happens:** SSML is XML. Special characters must be escaped.
**How to avoid:** Always run `escapeXml()` on text content before embedding in SSML. Test with edge-case characters.
**Warning signs:** Intermittent 400 errors from Azure, especially with certain dictionary entries.

### Pitfall 3: Free Tier Rate Limiting (20 req/60s)
**What goes wrong:** Multiple students hovering over characters simultaneously exhaust the Azure free tier's 20 requests/60 seconds limit, causing 429 errors.
**Why it happens:** Free tier has a hard 20 TPS limit that cannot be increased.
**How to avoid:** Three-layer mitigation: (1) Redis cache eliminates repeated requests for the same text, (2) client-side blob URL cache prevents re-fetching within a session, (3) debounce hover events (300ms) before triggering TTS. For production, upgrade to S0 tier ($16/million chars, 200 TPS).
**Warning signs:** Sudden burst of 429 responses from the TTS endpoint during classroom sessions.

### Pitfall 4: Audio Playback Overlap on Rapid Hover
**What goes wrong:** User quickly hovers over multiple characters, triggering overlapping audio that sounds garbled.
**Why it happens:** Each hover creates a new `Audio` instance without stopping the previous one.
**How to avoid:** `useTTS` hook must always call `audioRef.current.pause()` and set `audioRef.current = null` before creating a new `Audio` instance. Single audio ref pattern.
**Warning signs:** Garbled overlapping audio when moving mouse quickly across characters.

### Pitfall 5: Polyphonic Character Mispronunciation
**What goes wrong:** Character 行 in "银行" (bank) is pronounced "xing2" instead of "hang2" because Azure defaults to the more common reading.
**Why it happens:** Chinese has hundreds of polyphonic characters. Azure handles common cases but not all context-dependent readings.
**How to avoid:** For character-level TTS where context is available (e.g., from dictionary lookup), use `pinyin-pro` to get the context-appropriate pinyin and inject `<phoneme alphabet="sapi" ph="hang 2">行</phoneme>` tags. The phoneme SSML builder function handles this.
**Warning signs:** Users report incorrect pronunciation for specific characters.

### Pitfall 6: Missing AbortController Timeout
**What goes wrong:** Azure TTS call hangs indefinitely if the service is degraded, causing the API route to time out at the serverless function level (e.g., Vercel's 10s/60s limit) with a generic error.
**Why it happens:** `fetch` has no default timeout.
**How to avoid:** Use AbortController with 5-second timeout, matching the pattern in `pronunciation.ts` (which uses 20s for the more complex pronunciation assessment). 5 seconds is generous for TTS which typically responds in <300ms.
**Warning signs:** Occasional very slow responses or serverless function timeouts.

## Code Examples

Verified patterns from official sources and existing codebase:

### Azure TTS REST API Call (Matches pronunciation.ts Pattern)
```typescript
// Source: Azure TTS REST API docs + codebase pattern from src/lib/pronunciation.ts
const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;

const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

try {
  const response = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "CantoMandoBlueprint",
      },
      body: ssml,
      signal: controller.signal,
    }
  );
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Azure TTS error: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
} catch (error) {
  clearTimeout(timeoutId);
  if (error instanceof Error && error.name === "AbortError") {
    throw new Error("TTS request timed out");
  }
  throw error;
}
```

### Redis Cache with Tiered TTL (Matches echo-detection.ts Pattern)
```typescript
// Source: Upstash Redis docs (Context7: /upstash/redis-js) + codebase pattern from src/lib/ghl/echo-detection.ts
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// TTL tiers based on content length (characters reused more, sentences less)
function getCacheTTL(textLength: number): number {
  if (textLength <= 2) return 604800;  // 7 days for single chars / 2-char words
  if (textLength <= 6) return 259200;  // 3 days for short words
  return 86400;                         // 24 hours for sentences
}

// Store as base64 string (Upstash REST API is string-native)
await redis.set(cacheKey, audioBuffer.toString("base64"), { ex: ttl });

// Retrieve and decode
const cached = await redis.get<string>(cacheKey);
if (cached) {
  const audioBuffer = Buffer.from(cached, "base64");
  // Return as binary response
}
```

### SSML Phoneme Tag with pinyin-pro
```typescript
// Source: Azure SSML phonetic sets docs + pinyin-pro already installed
import { pinyin } from "pinyin-pro";

// Get context-aware pinyin with tone numbers (Azure sapi format)
const py = pinyin("行", { toneType: "num", type: "array" }); // ["hang2"] or ["xing2"] depending on context

// Build phoneme SSML
const ssml = `<phoneme alphabet="sapi" ph="${py[0]}">${char}</phoneme>`;

// For Cantonese with to-jyutping:
import ToJyutping from "to-jyutping";
const jyutping = ToJyutping.getJyutping("行"); // "hang4" or similar
```

### Rate Limiter for TTS Endpoint (Matches rate-limit.ts Pattern)
```typescript
// Source: Codebase pattern from src/lib/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// TTS: 30/min students, 90/min elevated (coaches/admins)
// Higher than grading (10/min) because hover-to-hear generates rapid requests
export const ttsLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  prefix: "ratelimit:tts",
  analytics: true,
});

export const ttsLimiterElevated = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(90, "1 m"),
  prefix: "ratelimit:tts:elevated",
  analytics: true,
});
```

### Clerk Auth Guard (Matches grade-audio/route.ts Pattern)
```typescript
// Source: Codebase pattern from src/app/api/grade-audio/route.ts
import { auth } from "@clerk/nextjs/server";

export async function POST(request: NextRequest) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limiting with role detection
  const role = (sessionClaims?.metadata as Record<string, unknown>)?.role as string || "student";
  const limiter = selectLimiter(role, ttsLimiter, ttsLimiterElevated);
  const rl = await limiter.limit(userId);
  if (!rl.success) return rateLimitResponse(rl);

  // ... TTS logic
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Azure Speech SDK in browser | REST API from server | Ongoing recommendation | SDK is 50MB+, exposes key. REST API is simpler for short TTS |
| HD voices for quality | Standard neural voices | March 2025 (HD GA) | HD voices lack SSML prosody/break support -- unusable for language learning |
| Token-based auth (`Authorization: Bearer`) | Subscription key header (`Ocp-Apim-Subscription-Key`) | Both supported | Key header is simpler for server-side use. Token auth adds complexity of token refresh. Key header matches existing `pronunciation.ts` pattern |

**Deprecated/outdated:**
- `microsoft-cognitiveservices-speech-sdk` for simple TTS: Overkill for short-text TTS from server. Only needed for real-time streaming of long passages, which is not the use case here.
- HD voices for Chinese learning apps: Despite higher quality on paper, the inability to control prosody rate makes them unsuitable.

## Open Questions

1. **Phoneme injection scope for Phase 46**
   - What we know: `pinyin-pro` can generate context-aware pinyin for polyphonic characters. SSML phoneme tags work with the `sapi` alphabet.
   - What's unclear: Should the TTS API route accept optional `phoneme` parameter, or should it auto-detect polyphonic characters? Auto-detection requires sentence context which may not always be available for single-character requests.
   - Recommendation: Accept an optional `phoneme` parameter in the API. Let the calling component (popup, reader) decide whether to provide it based on available context. This keeps the TTS route simple and pushes context decisions to the consumer. Phase 48 (Character Popup) will provide phoneme from dictionary lookup context.

2. **Rate limit numbers for TTS**
   - What we know: Grading uses 10/min student, 30/min elevated. TTS will be called much more frequently (hover-to-hear).
   - What's unclear: Exact ideal rate limit numbers depend on usage patterns.
   - Recommendation: Start with 30/min student, 90/min elevated. Redis cache + client blob cache will handle the majority of requests before they hit the rate limiter. Adjust based on actual usage data.

3. **Upstash Redis storage cost for TTS cache**
   - What we know: Free tier has 256MB max data size. Pay-as-you-go has 100GB. Single character audio is ~8KB base64 cached. Max record size is 100MB (well within limits).
   - What's unclear: How many unique cache entries accumulate over time with tiered TTL.
   - Recommendation: With 7-day TTL for characters, 3-day for words, 24h for sentences, cache naturally expires. Worst case: 4000 common characters x 2 languages x 2 rates = 16,000 entries x 8KB = ~128MB. Well within pay-as-you-go limits. Monitor via Upstash dashboard.

## Voices Configuration

### Selected Voices (Locked for Phase 46)
| Language | Voice Name | Gender | Use |
|----------|-----------|--------|-----|
| Mandarin (zh-CN) | `zh-CN-XiaoxiaoNeural` | Female | Default Mandarin voice -- most feature-rich, clearest diction |
| Cantonese (zh-HK) | `zh-HK-HiuMaanNeural` | Female | Default Cantonese voice -- primary zh-HK female voice |

### SSML Rate Values
| Value | Multiplier | Use Case |
|-------|-----------|----------|
| `x-slow` | 0.5x | Character study mode |
| `slow` | 0.64x | Beginner sentence reading |
| `medium` | 1.0x | Normal speech (default) |
| `fast` | 1.55x | Advanced listening practice |

### Audio Format
- **Format:** `audio-24khz-48kbitrate-mono-mp3`
- **Rationale:** 24kHz mono MP3 at 48kbps provides clear speech quality at minimal file size. Universally supported by all browsers via `Audio` API.

### Estimated File Sizes
| Content | Duration | Size |
|---------|----------|------|
| Single character | 0.5-1.0s | 3-6 KB |
| 2-char word | 0.8-1.5s | 5-9 KB |
| Short phrase (4-6 chars) | 1.5-3.0s | 9-18 KB |
| Full sentence (10-20 chars) | 3-8s | 18-48 KB |

## Caching Strategy

### Cache Key Format
```
tts:{language}:{voice}:{rate}:{md5(text)}
```

### TTL Tiers
| Text Length | TTL | Rationale |
|-------------|-----|-----------|
| 1-2 chars | 7 days (604,800s) | High reuse, tiny size (~8KB base64) |
| 3-6 chars | 3 days (259,200s) | Moderate reuse for compound words |
| 7+ chars | 24 hours (86,400s) | Lower reuse for sentences, larger size |

### Three-Layer Cache
1. **Client-side blob URL cache** (`Map<string, string>` in `useTTS` hook ref) -- instant, session-scoped
2. **HTTP Cache-Control header** (`public, max-age=86400`) -- browser disk cache
3. **Redis server-side cache** (Upstash, base64 strings with TTL) -- shared across all users

## Sources

### Primary (HIGH confidence)
- Azure TTS REST API Reference: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech -- Endpoint, headers, output formats, auth method verified
- Azure SSML Pronunciation Reference: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation -- Phoneme `sapi` alphabet, pinyin/jyutping format verified
- Azure SSML Voice and Sound: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice -- Prosody rate values, break tags verified
- Azure HD Voices Limitations: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/high-definition-voices -- No prosody/break support confirmed
- Upstash Redis JS SDK (Context7: `/upstash/redis-js`): `Redis.fromEnv()`, `.set()` with `{ ex: ttl }`, `.get<T>()` -- pattern verified
- Upstash Redis Limits: Max record size 100MB, max key size 32KB, free tier 256MB data -- verified via Context7

### Secondary (MEDIUM confidence)
- Azure Speech Pricing: https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/ -- $16/M chars neural, free tier 500K chars/month
- Azure Speech Quotas: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits -- Free tier 20 req/60s, S0 200 TPS
- Existing v6 TTS research: `.planning/research/v6-azure-tts.md` -- comprehensive coverage, cross-verified

### Codebase References (HIGH confidence)
- `src/lib/pronunciation.ts` -- Azure Speech REST API pattern (same key, region, fetch, AbortController)
- `src/lib/rate-limit.ts` -- Upstash Redis and Ratelimit pattern (`Redis.fromEnv()`, sliding window, role-based elevation)
- `src/lib/ghl/echo-detection.ts` -- Upstash Redis direct usage pattern (set with TTL, get, key naming)
- `src/app/api/grade-audio/route.ts` -- API route pattern (Clerk auth, rate limit, error handling, 502 for upstream failure)
- `src/hooks/*.ts` (14 existing hooks) -- React hook conventions (useCallback, useRef, useState patterns)
- `.env.example` lines 71-72 -- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` already documented

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Every dependency already installed, every pattern already established in codebase
- Architecture: HIGH -- REST API endpoint + Redis cache + client hook is a straightforward, well-understood pattern matching 3 existing codebase examples
- Pitfalls: HIGH -- HD voice limitation is officially documented, SSML escaping is standard XML, rate limiting pattern is proven
- Voice selection: HIGH -- Voices verified from official Azure voice list, HD limitation verified from official docs

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (30 days -- Azure voice list and API are stable)
