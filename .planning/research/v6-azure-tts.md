# Research: Azure TTS for Chinese Reader Feature

**Project:** CantoMando Blueprint -- v6.0 Reading & Dictionary
**Researched:** 2026-02-08
**Overall Confidence:** HIGH
**Scope:** Azure Text-to-Speech for hover-to-hear, sentence read-aloud, and character pronunciation in a Chinese learning LMS

---

## Executive Summary

Azure Speech Services can handle both TTS and pronunciation scoring using the same subscription key, region, and REST API endpoint pattern the project already uses. The existing `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` environment variables work for TTS with zero additional configuration. The TTS REST API is the recommended approach (not the SDK) because it matches the existing pronunciation scoring pattern, avoids adding the heavy `microsoft-cognitiveservices-speech-sdk` npm package for a simple use case, and supports all needed audio output formats natively.

For Mandarin Chinese (zh-CN), Azure offers 24+ standard neural voices plus HD and Flash variants. For Cantonese (zh-HK), there are 3 neural voices. SSML support is comprehensive: pinyin phonemes via the `sapi` alphabet, jyutping phonemes for Cantonese, prosody rate/pitch/volume control, break tags for pacing, and express-as styles for emotional tone. The critical limitation is that HD voices do NOT support `<prosody>` or `<break>` tags -- only standard neural voices support full SSML control, which matters for a language learning app that needs rate control and character-by-character pacing.

The recommended implementation is a server-side API route (`/api/tts`) that calls the Azure TTS REST API, returns MP3 audio, and caches results in Redis (Upstash, already configured) keyed by text+voice+rate. For single characters, MP3 at 48kbps/24kHz yields approximately 3-6 KB per character -- small enough to cache aggressively. For sentences, generate on-demand with optional slow-rate SSML. The free tier (500K characters/month) is sufficient for development and light production use; standard tier costs $16/million characters.

---

## 1. Azure TTS Chinese Voices

### Mandarin Chinese (zh-CN) -- Standard Neural Voices

| Voice Name | Gender | Notes |
|------------|--------|-------|
| `zh-CN-XiaoxiaoNeural` | Female | Most popular, supports 14+ speaking styles |
| `zh-CN-YunxiNeural` | Male | Popular, supports multiple styles |
| `zh-CN-YunjianNeural` | Male | Natural conversational tone |
| `zh-CN-XiaoyiNeural` | Female | Clear articulation |
| `zh-CN-YunyangNeural` | Male | News anchor style, very clear diction |
| `zh-CN-XiaochenNeural` | Female | Warm tone |
| `zh-CN-XiaohanNeural` | Female | Multiple styles (calm, sad, angry, etc.) |
| `zh-CN-XiaomengNeural` | Female | Young voice |
| `zh-CN-XiaomoNeural` | Female | Supports role-play (YoungAdultFemale, OlderAdultMale, etc.) |
| `zh-CN-XiaoqiuNeural` | Female | Standard |
| `zh-CN-XiaorouNeural` | Female | Gentle |
| `zh-CN-XiaoruiNeural` | Female | Senior voice |
| `zh-CN-XiaoshuangNeural` | Female | Child voice |
| `zh-CN-XiaoyanNeural` | Female | Standard |
| `zh-CN-XiaoyouNeural` | Female | Child voice |
| `zh-CN-XiaozhenNeural` | Female | Standard |
| `zh-CN-YunfengNeural` | Male | Standard |
| `zh-CN-YunhaoNeural` | Male | Standard |
| `zh-CN-YunjieNeural` | Male | Standard |
| `zh-CN-YunxiaNeural` | Male | Child/young voice |
| `zh-CN-YunyeNeural` | Male | Supports role-play |
| `zh-CN-YunzeNeural` | Male | Supports multiple styles |
| `zh-CN-YunfanNeural` | Male | Standard |

**Recommendation for language learning:** Use `zh-CN-XiaoxiaoNeural` (female) and `zh-CN-YunyangNeural` (male) as defaults. XiaoxiaoNeural is the most feature-rich (14+ styles, role-play, prosody) and has the clearest diction. YunyangNeural has a professional news-anchor clarity ideal for pronunciation modeling.

### Mandarin Chinese (zh-CN) -- HD Voices

| Voice Name | Gender | Type |
|------------|--------|------|
| `zh-CN-Xiaochen:DragonHDLatestNeural` | Female | HD (GA) |
| `zh-CN-Yunfan:DragonHDLatestNeural` | Male | HD (GA) |

**HD Flash Voices (lower latency):**
- `zh-CN-Xiaoxiao:DragonHDFlashLatestNeural` (Female)
- `zh-CN-Xiaoxiao2:DragonHDFlashLatestNeural` (Female)
- `zh-CN-Xiaochen:DragonHDFlashLatestNeural` (Female)
- `zh-CN-Yunxiao:DragonHDFlashLatestNeural` (Male)
- `zh-CN-Yunyi:DragonHDFlashLatestNeural` (Male)
- Plus 5 more variants

**HD Voice Limitations (critical for this project):**
- NO support for `<prosody>` (rate, pitch, volume control)
- NO support for `<break>` (pause insertion)
- NO support for `<emphasis>`
- NO support for `<mstts:express-as>` (except Dragon HD Omni)
- Limited to regions: eastus, westeurope, southeastasia
- Priced at $30/million characters (vs $16 for standard)

**Verdict:** Do NOT use HD voices for the reader feature. The lack of prosody and break support makes them unsuitable for a language learning app where speaking rate control and character-by-character pacing are essential. Standard neural voices provide full SSML control and are half the price.

### Cantonese (zh-HK) -- Neural Voices

| Voice Name | Gender | Notes |
|------------|--------|-------|
| `zh-HK-HiuMaanNeural` | Female | Primary Cantonese female voice |
| `zh-HK-WanLungNeural` | Male | Primary Cantonese male voice |
| `zh-HK-HiuGaaiNeural` | Female | Secondary Cantonese female voice |

**Recommendation:** Use `zh-HK-HiuMaanNeural` (female) and `zh-HK-WanLungNeural` (male) as defaults. The Cantonese voice selection is limited compared to Mandarin, but all three are standard neural voices with full SSML support including prosody control.

### Regional/Dialect Voices (bonus)

Azure also offers Mandarin dialect voices that could be interesting for advanced learners:
- `zh-CN-sichuan-YunxiNeural` -- Southwestern Mandarin (Sichuan)
- `zh-CN-liaoning-XiaobeiNeural` -- Northeastern Mandarin
- `zh-CN-shaanxi-XiaoniNeural` -- Shaanxi Mandarin
- `zh-CN-shandong-YunxiangNeural` -- Shandong Mandarin

### Can the Same Azure Subscription Be Used for Both TTS and Pronunciation Scoring?

**YES -- Confidence: HIGH.** The same `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` environment variables already configured for pronunciation scoring work for TTS. Both services are part of Azure Speech Services and use the same subscription. The endpoints differ:
- Pronunciation scoring (STT): `https://{region}.stt.speech.microsoft.com/speech/recognition/...`
- Text-to-speech (TTS): `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`

No additional Azure resources, keys, or configuration needed.

---

## 2. SSML for Chinese

### Speaking Rate Control

Standard neural voices support the `<prosody>` element for rate control:

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="zh-CN-XiaoxiaoNeural">
    <!-- Normal speed -->
    <prosody rate="medium">你好世界</prosody>

    <!-- Slow (0.64x) - good for beginners -->
    <prosody rate="slow">你好世界</prosody>

    <!-- Extra slow (0.5x) - character-by-character learning -->
    <prosody rate="x-slow">你好世界</prosody>

    <!-- Custom percentage (-30% slower) -->
    <prosody rate="-30%">你好世界</prosody>

    <!-- Custom multiplier (0.7x speed) -->
    <prosody rate="0.7">你好世界</prosody>
  </voice>
</speak>
```

**Rate values:**
| Value | Speed Multiplier | Use Case |
|-------|-----------------|----------|
| `x-slow` | 0.5x | Individual character study |
| `slow` | 0.64x | Beginner sentence reading |
| `medium` | 1.0x | Normal speech (default) |
| `fast` | 1.55x | Advanced listening practice |
| `x-fast` | 2.0x | Speed drill |
| `-50%` to `+100%` | Custom | Fine-tuned pacing |
| `0.5` to `2.0` | Custom multiplier | Precise control |

### Character-by-Character vs Word-by-Word Pronunciation

For character-by-character pronunciation (hover-to-hear individual characters), use `<break>` tags between characters:

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="zh-CN-XiaoxiaoNeural">
    <!-- Individual character with slow rate -->
    <prosody rate="slow">你</prosody>

    <!-- Character-by-character with pauses -->
    <prosody rate="x-slow">
      你 <break time="500ms"/> 好 <break time="500ms"/> 世 <break time="500ms"/> 界
    </prosody>

    <!-- Natural sentence reading -->
    <prosody rate="slow">你好世界</prosody>
  </voice>
</speak>
```

For sentence-level silence control between sentences:

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
  <voice name="zh-CN-YunyangNeural">
    <mstts:silence type="Sentenceboundary" value="400ms"/>
    <mstts:silence type="comma-exact" value="200ms"/>
    <prosody rate="slow">
      你好，欢迎来到我们的课程。今天我们学习新的词汇。
    </prosody>
  </voice>
</speak>
```

**Break element strength values:**
| Strength | Duration |
|----------|----------|
| `x-weak` | 250ms |
| `weak` | 500ms |
| `medium` | 750ms (default) |
| `strong` | 1000ms |
| `x-strong` | 1250ms |
| `time="Nms"` | Custom, 0-20000ms |

### Phoneme Tags for Pinyin/Jyutping

Azure supports pinyin and jyutping via the `sapi` phonetic alphabet. This is critical for disambiguating polyphonic characters.

**Pinyin (Mandarin zh-CN):**

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="zh-CN-XiaoxiaoNeural">
    <!-- Force specific pinyin pronunciation -->
    <!-- Tone numbers: 1=high level, 2=rising, 3=dipping, 4=falling, 5=neutral -->
    <phoneme alphabet="sapi" ph="ba 1">八</phoneme>  <!-- ba1: eight -->
    <phoneme alphabet="sapi" ph="ba 2">拔</phoneme>  <!-- ba2: pull -->
    <phoneme alphabet="sapi" ph="ba 3">把</phoneme>  <!-- ba3: handle -->
    <phoneme alphabet="sapi" ph="ba 4">爸</phoneme>  <!-- ba4: father -->

    <!-- Multi-character with pinyin -->
    <phoneme alphabet="sapi" ph="zu 3 - zhi 1 - guan 1 - xi 5">组织关系</phoneme>

    <!-- Polyphonic character disambiguation -->
    <!-- 行 can be hang2 (row) or xing2 (walk) -->
    <phoneme alphabet="sapi" ph="hang 2">行</phoneme>  <!-- row/line -->
    <phoneme alphabet="sapi" ph="xing 2">行</phoneme>  <!-- walk -->
  </voice>
</speak>
```

**Jyutping (Cantonese zh-HK):**

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-HK">
  <voice name="zh-HK-HiuMaanNeural">
    <!-- Jyutping with 6 tones -->
    <phoneme alphabet="sapi" ph="saa 1">沙</phoneme>  <!-- saa1: sand -->
    <phoneme alphabet="sapi" ph="nei 5">你</phoneme>  <!-- nei5: you -->
    <phoneme alphabet="sapi" ph="hou 2">好</phoneme>  <!-- hou2: good -->

    <!-- Multi-character jyutping -->
    <phoneme alphabet="sapi" ph="sik 6 - faan 6">食饭</phoneme>  <!-- eat rice -->
  </voice>
</speak>
```

**Key detail:** The project already has `pinyin-pro` (v3.28.0) and `to-jyutping` (v3.1.1) installed in `package.json`. These can generate the pinyin/jyutping values needed for phoneme tags, enabling accurate pronunciation of polyphonic characters in the TTS output.

### Express-As Styles for Chinese Voices

Several zh-CN voices support emotional/contextual speaking styles:

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
  <voice name="zh-CN-XiaomoNeural">
    <!-- Calm reading style for study -->
    <mstts:express-as style="calm">
      今天我们学习第三课。
    </mstts:express-as>

    <!-- Cheerful encouragement -->
    <mstts:express-as style="cheerful" styledegree="1.5">
      做得很好！继续加油！
    </mstts:express-as>
  </voice>
</speak>
```

Styles supported by `zh-CN-XiaoxiaoNeural`: `cheerful`, `sad`, `angry`, `fearful`, `disgruntled`, `serious`, `affectionate`, `gentle`, `lyrical`, `customerservice`, `newscast`, `assistant`, `calm`, `chat`.

### Say-As for Context-Dependent Pronunciation

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="zh-CN-XiaoxiaoNeural">
    <!-- Name pronunciation (context-aware: 仇 as qiu2, not chou2) -->
    <say-as interpret-as="name">仇先生</say-as>

    <!-- Number reading -->
    <say-as interpret-as="cardinal">12345</say-as>

    <!-- Character-by-character spelling -->
    <say-as interpret-as="characters">你好</say-as>
  </voice>
</speak>
```

---

## 3. Implementation Approach

### Architecture: REST API Route (Recommended)

Use the Azure TTS REST API directly from a Next.js API route, matching the existing pattern used for pronunciation scoring. Do NOT install the `microsoft-cognitiveservices-speech-sdk` npm package for TTS -- the REST API is simpler, lighter, and sufficient.

```
Client (hover/click)
  -> /api/tts (POST with text, voice, rate, language)
    -> Check Redis cache (Upstash)
      -> HIT: Return cached MP3 audio buffer
      -> MISS: Call Azure TTS REST API
        -> Cache result in Redis (24h TTL)
        -> Return MP3 audio buffer
  -> Client plays audio via Audio API
```

### REST API Call Pattern

```typescript
// POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1
// Headers:
//   Ocp-Apim-Subscription-Key: {key}     (same key as pronunciation scoring)
//   Content-Type: application/ssml+xml
//   X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3
//   User-Agent: CantoMandoBlueprint

const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="zh-CN-XiaoxiaoNeural">
    <prosody rate="slow">你好</prosody>
  </voice>
</speak>`;

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
  }
);

// Response body IS the audio binary (audio/mpeg)
const audioBuffer = Buffer.from(await response.arrayBuffer());
```

### Pre-Generate vs On-Demand

**Recommendation: Hybrid approach.**

| Content Type | Strategy | Rationale |
|-------------|----------|-----------|
| Individual characters (hover-to-hear) | On-demand + aggressive cache | ~4,000 common characters x 2 languages x 2 voices = 16,000 entries. Too many to pre-generate all. Cache on first request with long TTL. |
| Dictionary headwords | On-demand + cache | Generated when user looks up a word. Cached in Redis. |
| Lesson vocabulary | Pre-generate at lesson creation | Each lesson has 10-30 vocabulary items. Pre-generate at content creation time. Store in DB or object storage. |
| Full sentence read-aloud | On-demand only | Sentences are too varied to pre-generate. Generate with SSML rate control. Short cache TTL. |

### Audio Format and Size

**Recommended format:** `audio-24khz-48kbitrate-mono-mp3`

Rationale:
- MP3 is universally supported in browsers (Audio API, `<audio>` element)
- 24kHz sample rate provides good speech quality (higher than needed for spoken voice)
- 48kbps bitrate keeps file size small while maintaining clarity
- Mono channel is sufficient for speech

**Estimated file sizes (at 48kbps MP3):**

| Content | Duration | Estimated Size |
|---------|----------|---------------|
| Single character (e.g., "你") | 0.5-1.0s | 3-6 KB |
| Two-character word (e.g., "你好") | 0.8-1.5s | 5-9 KB |
| Short phrase (4-6 chars) | 1.5-3.0s | 9-18 KB |
| Full sentence (10-20 chars) | 3-8s | 18-48 KB |
| Paragraph (50+ chars) | 10-30s | 60-180 KB |

These sizes are small enough to cache in Redis (Upstash) and send inline as binary responses. No need for object storage for character/word-level audio.

### Client-Side vs Server-Side Synthesis

**Use server-side synthesis.** Reasons:

1. **Security:** Azure subscription key stays on the server. The project already follows this pattern for pronunciation scoring.
2. **Caching:** Server-side Redis cache prevents redundant Azure API calls. Multiple students looking up the same character hit the cache, not Azure.
3. **Rate limiting:** Server controls request rate via existing Upstash rate limiter.
4. **Consistency:** Matches the existing `src/lib/pronunciation.ts` architecture pattern.

Client-side synthesis (using the SDK in the browser) would expose the Azure key and bypass caching. Not recommended.

### API Rate Limits and Pricing

**Free Tier (F0):**
- 20 transactions per 60 seconds (not adjustable)
- 500,000 characters per month free
- Sufficient for development and low-traffic testing

**Standard Tier (S0):**
- 200 TPS default (adjustable to 1,000 TPS)
- $16 per 1 million characters (standard neural voices)
- $30 per 1 million characters (HD voices -- not recommended)
- No monthly character limit

**Cost estimation for CantoMando Blueprint:**

| Scenario | Characters/Month | Cost/Month |
|----------|-----------------|------------|
| 50 students, 20 chars/day each | ~30,000 | $0.48 (or free tier) |
| 200 students, 50 chars/day each | ~300,000 | $4.80 (or free tier with caching) |
| 500 students, 100 chars/day each | ~1,500,000 | $24.00 |

With Redis caching, the effective character count billed to Azure drops dramatically because the same characters/words get requested repeatedly across students. A cache hit rate of 80-90% is realistic for a vocabulary-focused app, bringing even the 500-student scenario under the free tier.

### Caching Strategy

```
Cache Key Format:
  tts:{language}:{voice}:{rate}:{md5(text)}

Examples:
  tts:zh-CN:XiaoxiaoNeural:slow:a1b2c3d4      -> MP3 buffer for "你" at slow rate
  tts:zh-HK:HiuMaanNeural:medium:e5f6g7h8      -> MP3 buffer for "你好" at normal rate
  tts:zh-CN:XiaoxiaoNeural:x-slow:i9j0k1l2     -> MP3 buffer for character-by-character "你好世界"

TTL Policy:
  Individual characters: 7 days (high reuse, small size)
  Words (2-4 chars):     3 days (moderate reuse)
  Sentences (5+ chars):  24 hours (lower reuse, larger size)
  Custom SSML:           1 hour (user-specific, low reuse)
```

Use Upstash Redis (already configured) with `set(key, base64EncodedAudio, { ex: ttlSeconds })`. The base64 encoding adds ~33% overhead but Upstash Redis supports string values natively. For a 6KB MP3 character, the cached value is ~8KB -- well within Upstash limits.

Alternative: Use Redis `SETEX` with binary buffers if Upstash supports it, or store as base64 strings.

---

## 4. Azure Speech SDK vs REST API for TTS in Next.js

### Recommendation: Use REST API (not SDK)

| Factor | REST API | SDK (`microsoft-cognitiveservices-speech-sdk`) |
|--------|----------|-----------------------------------------------|
| Bundle size impact | Zero (uses native `fetch`) | ~50MB npm package |
| Auth complexity | Simple header (`Ocp-Apim-Subscription-Key`) | Requires `SpeechConfig` setup |
| Audio format | Set via header, get raw binary | Requires `AudioConfig` setup |
| Connection reuse | Standard HTTP keep-alive | WebSocket connection pooling |
| Streaming | Response is complete audio | Supports chunk streaming |
| Error handling | HTTP status codes | SDK-specific error events |
| Existing pattern | Matches `src/lib/pronunciation.ts` | Different pattern |
| Server-side Node.js | Works with standard `fetch` | Works but heavy dependency |

For single-character and short-phrase TTS (the primary use case for a reader feature), the REST API returns audio in <300ms. The SDK's streaming advantage only matters for long-form synthesis (paragraphs+), which is not the core use case.

### Server-Side API Route Implementation

```typescript
// src/app/api/tts/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text, language, voice, rate } = await request.json();

  // Validate inputs
  if (!text || text.length > 500) {
    return NextResponse.json({ error: "Invalid text" }, { status: 400 });
  }

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    return NextResponse.json(
      { error: "TTS not configured" },
      { status: 503 }
    );
  }

  // Check Redis cache first
  const cacheKey = buildCacheKey(text, language, voice, rate);
  const cached = await redis.get(cacheKey);
  if (cached) {
    const audioBuffer = Buffer.from(cached as string, "base64");
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // Build SSML
  const voiceName = resolveVoiceName(language, voice);
  const ssml = buildSSML(text, voiceName, language, rate);

  // Call Azure TTS REST API
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
    }
  );

  if (!response.ok) {
    console.error(`Azure TTS error: ${response.status}`);
    return NextResponse.json(
      { error: "TTS synthesis failed" },
      { status: 502 }
    );
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  // Cache in Redis
  const ttl = text.length <= 2 ? 604800 : text.length <= 6 ? 259200 : 86400;
  await redis.set(cacheKey, audioBuffer.toString("base64"), { ex: ttl });

  return new NextResponse(audioBuffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
```

### SSML Builder Helper

```typescript
function buildSSML(
  text: string,
  voiceName: string,
  language: string,
  rate: string = "medium"
): string {
  const lang = language === "cantonese" ? "zh-HK" : "zh-CN";

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">
  <voice name="${voiceName}">
    <prosody rate="${rate}">${escapeXml(text)}</prosody>
  </voice>
</speak>`;
}

function buildCharacterByCharacterSSML(
  characters: string[],
  voiceName: string,
  language: string,
  pauseMs: number = 500
): string {
  const lang = language === "cantonese" ? "zh-HK" : "zh-CN";
  const charElements = characters
    .map((char) => `${escapeXml(char)} <break time="${pauseMs}ms"/>`)
    .join("\n      ");

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">
  <voice name="${voiceName}">
    <prosody rate="slow">
      ${charElements}
    </prosody>
  </voice>
</speak>`;
}

function buildPhonemeSSML(
  text: string,
  phoneme: string, // pinyin or jyutping
  voiceName: string,
  language: string,
  rate: string = "slow"
): string {
  const lang = language === "cantonese" ? "zh-HK" : "zh-CN";

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">
  <voice name="${voiceName}">
    <prosody rate="${rate}">
      <phoneme alphabet="sapi" ph="${escapeXml(phoneme)}">${escapeXml(text)}</phoneme>
    </prosody>
  </voice>
</speak>`;
}

function resolveVoiceName(language: string, preference?: string): string {
  if (preference) return preference;
  return language === "cantonese"
    ? "zh-HK-HiuMaanNeural"
    : "zh-CN-XiaoxiaoNeural";
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
```

### Client-Side Audio Playback Hook

```typescript
// src/hooks/useTTS.ts

import { useCallback, useRef, useState } from "react";

export function useTTS() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map()); // client-side URL cache

  const speak = useCallback(
    async (text: string, options?: {
      language?: string;
      voice?: string;
      rate?: string;
    }) => {
      const cacheKey = `${text}:${options?.language}:${options?.voice}:${options?.rate}`;

      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      // Check client-side cache
      let audioUrl = cacheRef.current.get(cacheKey);

      if (!audioUrl) {
        setIsLoading(true);
        try {
          const response = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              language: options?.language || "mandarin",
              voice: options?.voice,
              rate: options?.rate || "medium",
            }),
          });

          if (!response.ok) throw new Error("TTS failed");

          const blob = await response.blob();
          audioUrl = URL.createObjectURL(blob);
          cacheRef.current.set(cacheKey, audioUrl);
        } catch (error) {
          console.error("TTS error:", error);
          setIsLoading(false);
          return;
        }
        setIsLoading(false);
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setIsPlaying(true);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => setIsPlaying(false);
      audio.play();
    },
    []
  );

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
    }
  }, []);

  return { speak, stop, isPlaying, isLoading };
}
```

### Error Handling and Fallbacks

| Error | Response | Fallback |
|-------|----------|----------|
| Azure key not configured | 503 Service Unavailable | Show tooltip "Audio unavailable" |
| Azure API returns 429 | 429 Too Many Requests | Queue and retry with exponential backoff |
| Azure API returns 400 | 502 Bad Gateway | Log SSML for debugging, show "Audio unavailable" |
| Network timeout (>5s) | 504 Gateway Timeout | AbortController with 5s timeout |
| Redis cache error | Continue without cache | Call Azure directly, log cache failure |

---

## 5. Sentence Read-Aloud vs Individual Characters

### Individual Character (Hover-to-Hear)

Simplest case. Single character with optional phoneme disambiguation:

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="zh-CN-XiaoxiaoNeural">
    <prosody rate="slow">你</prosody>
  </voice>
</speak>
```

For polyphonic characters (characters with multiple pronunciations), use the existing `pinyin-pro` library to determine context-appropriate pinyin and inject it via phoneme tags:

```xml
<!-- 行 in "银行" (bank) vs "行走" (walk) -->
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="zh-CN-XiaoxiaoNeural">
    <phoneme alphabet="sapi" ph="hang 2">行</phoneme>
  </voice>
</speak>
```

### Full Sentence Read-Aloud

For natural sentence reading, let Azure handle prosody naturally (it handles Chinese sentence rhythm well) and only add SSML for rate control:

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
  <voice name="zh-CN-XiaoxiaoNeural">
    <!-- Natural reading at learner-friendly pace -->
    <prosody rate="slow">
      今天天气很好，我们去公园散步吧。
    </prosody>
  </voice>
</speak>
```

For longer passages with multiple sentences, add sentence boundary silence:

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
  <voice name="zh-CN-XiaoxiaoNeural">
    <mstts:silence type="Sentenceboundary" value="500ms"/>
    <mstts:silence type="comma-exact" value="200ms"/>
    <prosody rate="-20%">
      小明喜欢画画。他每天放学后，都会在家里画一幅画。
      有一天，他画了一幅很美的风景画。
    </prosody>
  </voice>
</speak>
```

### Multi-Mode Reading Feature Design

The reader should support three modes:

1. **Character mode (hover-to-hear):** Single character, slow rate, optional phoneme tag. Smallest audio, highest cache hit rate.

2. **Word mode (click-to-hear):** 2-4 character compound word, medium rate. The existing dictionary/word segmentation can determine word boundaries.

3. **Sentence mode (play button):** Full sentence, configurable rate (slow/medium/fast). Natural prosody without character-level breaks.

```typescript
type TTSMode = "character" | "word" | "sentence";

function buildSSMLForMode(
  text: string,
  mode: TTSMode,
  language: string,
  voiceName: string,
  rate: string
): string {
  const lang = language === "cantonese" ? "zh-HK" : "zh-CN";

  switch (mode) {
    case "character":
      return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">
  <voice name="${voiceName}">
    <prosody rate="slow">${escapeXml(text)}</prosody>
  </voice>
</speak>`;

    case "word":
      return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">
  <voice name="${voiceName}">
    <prosody rate="${rate}">${escapeXml(text)}</prosody>
  </voice>
</speak>`;

    case "sentence":
      return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${lang}">
  <voice name="${voiceName}">
    <mstts:silence type="Sentenceboundary" value="400ms"/>
    <prosody rate="${rate}">${escapeXml(text)}</prosody>
  </voice>
</speak>`;
  }
}
```

---

## 6. Pitfalls and Warnings

### Critical: HD Voices Lack SSML Control

HD voices (`DragonHDLatestNeural`, `DragonHDFlashLatestNeural`) do NOT support `<prosody>`, `<break>`, or `<emphasis>`. This is a dealbreaker for a language learning app. Always use standard neural voices (e.g., `zh-CN-XiaoxiaoNeural`).

### Critical: SSML XML Escaping

Chinese text containing special XML characters (`<`, `>`, `&`, quotes) will break SSML parsing. Always escape text content before embedding in SSML. This is especially important for dictionary entries that might contain example sentences with punctuation.

### Critical: Polyphonic Characters

Chinese has hundreds of polyphonic characters (characters with multiple pronunciations depending on context). Without phoneme tags, Azure generally handles common cases well, but uncommon combinations may be mispronounced. Use `pinyin-pro` (already installed) to detect polyphonic characters and inject `<phoneme>` tags.

Common polyphonic characters to watch:
- 行 (hang2 vs xing2)
- 了 (le vs liao3)
- 还 (hai2 vs huan2)
- 得 (de vs dei3 vs de2)
- 地 (di4 vs de)
- 长 (chang2 vs zhang3)

### Moderate: Rate Limiting on Free Tier

The free tier allows only 20 requests per 60 seconds. With multiple students hovering over characters simultaneously, this limit will be reached quickly. Mitigations:
1. Redis cache dramatically reduces Azure calls
2. Client-side `Map` cache prevents re-requesting the same character
3. Debounce hover events (300ms delay before requesting TTS)
4. Upgrade to S0 ($16/million chars) for production

### Moderate: Audio Playback Overlap

Users hovering quickly over multiple characters will trigger multiple audio playbacks overlapping. The `useTTS` hook must stop the current audio before playing a new one. Use a single `Audio` instance ref.

### Minor: Cantonese Voice Quality

The 3 Cantonese voices (zh-HK) have noticeably less variety and potentially less refinement than the 24+ Mandarin voices. For a bilingual app, set expectations accordingly. There are no Cantonese HD voices.

### Minor: `<lang>` Element Incompatibility

The `<lang xml:lang>` element is incompatible with `<prosody>` and `<break>`. If switching languages within a single SSML document (e.g., mixing Chinese and English), you cannot adjust prosody within the `<lang>` block. For mixed-language content, synthesize each language segment separately.

---

## 7. Pricing Summary

| Tier | Neural TTS Cost | Free Allowance | Rate Limit |
|------|-----------------|----------------|------------|
| F0 (Free) | $0 | 500K chars/month | 20 req/60s |
| S0 (Standard) | $16/1M chars | None | 200 TPS (default) |
| S0 HD voices | $30/1M chars | None | 200 TPS (default) |
| S0 Custom voice | $24/1M chars + $52/hr training | None | 200 TPS |

**Recommendation:** Start with F0 (free tier). With Redis caching achieving 80%+ hit rate, the free tier's 500K characters/month supports hundreds of active students. Upgrade to S0 only when rate limiting (20 req/60s) becomes a bottleneck, which Redis caching significantly delays.

---

## 8. Integration with Existing Codebase

### Environment Variables (Already Configured)

```bash
# Already in .env.example -- no new keys needed
AZURE_SPEECH_KEY=your-azure-speech-key
AZURE_SPEECH_REGION=eastus
```

### New Files Needed

```
src/
  app/api/tts/
    route.ts              # TTS API endpoint
  lib/
    tts.ts                # SSML builder, voice resolver, cache logic
  hooks/
    useTTS.ts             # Client-side playback hook
```

### Existing Libraries to Leverage

| Library | Already Installed | Usage for TTS |
|---------|------------------|---------------|
| `pinyin-pro` | v3.28.0 | Generate pinyin for phoneme tags |
| `to-jyutping` | v3.1.1 | Generate jyutping for Cantonese phoneme tags |
| `@upstash/redis` | v1.36.1 | Cache TTS audio responses |
| `@upstash/ratelimit` | v2.0.8 | Rate limit TTS API requests |

No new npm packages need to be installed for TTS.

---

## Sources

### Primary (HIGH Confidence)
- [Azure Speech Language and Voice Support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support) -- Complete voice list for zh-CN, zh-HK
- [Azure TTS REST API Reference](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech) -- Endpoint, headers, output formats, auth
- [SSML Pronunciation Reference](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation) -- Phoneme tags, say-as, custom lexicon
- [SSML Phonetic Alphabets](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-ssml-phonetic-sets) -- Pinyin (zh-CN), Jyutping (zh-HK), tone numbers
- [SSML Voice and Sound](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice) -- Prosody, express-as, emphasis
- [SSML Structure and Events](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-structure) -- Break, silence, paragraph elements
- [HD Voices Documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/high-definition-voices) -- SSML limitations, regional availability
- [Speech Services Quotas and Limits](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits) -- Rate limits, free/standard tiers

### Secondary (MEDIUM Confidence)
- [Azure Speech Pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/) -- $16/M chars neural, $30/M chars HD
- [Latency Reduction Guide](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-lower-speech-synthesis-latency) -- Streaming, pre-connection, format selection
- [Server Best Practices](https://github.com/Azure-Samples/Cognitive-Speech-TTS/wiki/The-best-practice-to-call-TTS-service-in-server-scenario) -- Connection reuse, warm-up
- [Azure Neural TTS Enhanced Prosody Breaks for Chinese](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/azure-ai-neural-tts-enhanced-expressiveness-for-chinese-voices-with-upgraded-pro/3858411) -- 21 zh-CN voices with improved prosody
- [HD Voices GA Announcement (March 2025)](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/march-2025-azure-ai-speech%E2%80%99s-hd-voices-are-generally-available-and-more/4398951)

### Codebase References
- `src/lib/pronunciation.ts` -- Existing Azure Speech REST API pattern (pronunciation scoring)
- `src/app/api/grade-audio/route.ts` -- Existing audio API route pattern
- `.env.example` -- Azure credentials already configured
- `package.json` -- `pinyin-pro` (v3.28.0), `to-jyutping` (v3.1.1), `@upstash/redis` (v1.36.1) already installed
- `.planning/phases/36-pronunciation-scoring/36-RESEARCH.md` -- Prior research on Azure Speech for this project

### Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Voice availability | HIGH | Directly verified from official Azure docs |
| SSML features | HIGH | Verified from official SSML reference docs |
| Pinyin/Jyutping phonemes | HIGH | Verified from Azure phonetic sets documentation |
| REST API pattern | HIGH | Matches existing codebase pattern in pronunciation.ts |
| Pricing | MEDIUM | Verified from Azure pricing page, but pricing can change |
| File size estimates | MEDIUM | Calculated from bitrate x duration; not empirically measured |
| HD voice limitations | HIGH | Explicitly documented in HD voices reference page |
| Cache hit rate estimate (80%+) | LOW | Educated guess based on vocabulary app usage patterns; needs validation |
