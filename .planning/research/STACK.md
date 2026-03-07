# Technology Stack: Production Readiness

**Project:** CantoMando Blueprint LMS
**Milestone:** Production Readiness Features
**Researched:** 2026-01-30
**Confidence:** HIGH

---

## Existing Stack (DO NOT CHANGE)

Already installed and validated. Listed for integration context only.

| Technology | Version (installed) | Role |
|------------|-------------------|------|
| Next.js | 16.1.4 | Framework |
| React | 19.2.3 | UI |
| Neon Postgres | @neondatabase/serverless 1.0.2 | Database |
| Drizzle ORM | 0.45.1 | ORM |
| Clerk | @clerk/nextjs 6.36.10 | Auth |
| Mux | @mux/mux-player-react 3.10.2 | Video |
| AI SDK | ai 6.0.62 | AI integration |
| XState | 5.25.1 | State machine |
| Tailwind CSS | 4.x | Styling |
| Zod | 4.3.6 | Validation |

---

## New Stack Additions

### 1. Error Monitoring: Sentry

| Package | Version | Purpose |
|---------|---------|---------|
| @sentry/nextjs | ^10.37.0 | Error tracking, performance monitoring, session replay |

**Why Sentry:**
- Official Next.js SDK with wizard-based setup (`npx @sentry/wizard@latest -i nextjs`)
- Automatic capture of unhandled errors on client, server, and edge runtime
- `withSentryConfig` wraps `next.config.ts` for source map upload and build integration
- AI SDK monitoring support (traces Vercel AI SDK calls)
- Sentry + PostHog integration available for linking errors to user sessions
- v10.37.0 confirmed compatible with Next.js 16 (test suite bumped to Next.js 16.0.7)

**Integration with existing stack:**
- Creates `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Wraps `next.config.ts` with `withSentryConfig`
- Clerk user ID can be set as Sentry user context via `Sentry.setUser()`

**What NOT to use:** LogRocket (expensive, overlapping features with Sentry session replay), Bugsnag (smaller ecosystem, less Next.js integration).

**Confidence:** HIGH -- verified via npm registry and Sentry official docs.

---

### 2. E2E Testing: Playwright

| Package | Version | Purpose |
|---------|---------|---------|
| @playwright/test | ^1.57.0 | E2E test framework |

**Why Playwright over Cypress:**
- Native parallel execution (14 min vs 90 min for same suite in enterprise benchmarks)
- Cross-browser: Chromium, Firefox, WebKit (Safari) -- critical since LMS students use phones (Safari)
- Built-in `webServer` config auto-starts Next.js dev server
- GitHub Actions template included out of the box
- Trace viewer for debugging flaky tests
- Experimental Next.js test mode for server-side fetch mocking (`next/experimental/testmode/playwright/msw`)
- 1.57.0 switches to Chrome for Testing builds (closer to real user browsers)

**Why NOT Cypress:**
- No Safari/WebKit support -- dealbreaker for a mobile-first LMS
- No native parallelism (requires paid Dashboard for CI parallelization)
- Slower at scale for large test suites
- Cypress debugging UX is better, but Playwright's trace viewer is sufficient

**Integration with existing stack:**
- `webServer.command` points to `npm run dev` or `npm run build && npm run start`
- Clerk test mode or bypass tokens for authenticated test flows
- Mux player interactions testable via Playwright locators on web components

**Configuration:**
```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

**Confidence:** HIGH -- verified via Playwright official docs and Next.js official testing guide.

---

### 3. PWA Support: Serwist

| Package | Version | Purpose |
|---------|---------|---------|
| @serwist/next | ^9.5.0 | Service worker integration for Next.js |
| serwist | ^9.5.0 | Core service worker toolkit |

**Why Serwist:**
- Official successor to next-pwa (same author, DuCanhGH)
- Works with Next.js 16 and Turbopack (next-pwa requires webpack)
- Recommended by official Next.js PWA documentation
- Precaching, runtime caching, offline fallback pages
- Minimal config: just wrap `next.config.ts` with `withSerwist`

**Why NOT next-pwa:** Unmaintained, requires webpack, does not support Turbopack (Next.js 16 default).

**Why NOT manual service worker:** Serwist handles precaching manifest generation, cache versioning, and stale-while-revalidate strategies automatically. Rolling your own is error-prone.

**Integration with existing stack:**
- Wraps `next.config.ts` (chains with Sentry's `withSentryConfig`)
- Creates `app/sw.ts` for service worker source
- Outputs `public/sw.js` at build time
- `public/manifest.json` for install prompt

**Caveat:** Serwist does NOT support Turbopack in development. Use `--webpack` flag for local PWA testing. Production builds work fine.

**Configuration:**
```typescript
// next.config.ts
import withSerwistInit from '@serwist/next';
import { withSentryConfig } from '@sentry/nextjs';

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig = { /* existing config */ };

export default withSentryConfig(withSerwist(nextConfig), {
  org: 'your-org',
  project: 'cantomando',
  silent: true,
});
```

**Confidence:** HIGH -- verified via Serwist official docs and Next.js PWA guide.

---

### 4. In-App Notifications: SSE + Database (build custom)

| Package | Version | Purpose |
|---------|---------|---------|
| *No new package needed* | -- | Use Next.js Route Handlers for SSE |

**Why build custom over Knock/Novu:**
- Notification volume is low (course completions, coach feedback, new lessons) -- not real-time chat
- SSE (Server-Sent Events) is trivially implementable in Next.js Route Handlers
- Avoids third-party dependency and cost for a simple feature
- Notification state stored in existing Neon Postgres (new `notifications` table)
- n8n already handles webhook triggers -- it can write to the notifications table directly

**Architecture:**
1. **Database table:** `notifications` (id, user_id, type, title, body, read, created_at)
2. **API route:** `GET /api/notifications/stream` -- SSE endpoint, filters by Clerk user ID
3. **API route:** `POST /api/notifications/mark-read` -- mark notifications as read
4. **Client:** `EventSource` API or a small React hook wrapping it
5. **Trigger:** n8n webhooks INSERT into notifications table; SSE endpoint picks up new rows

**Why NOT Knock:** Knock is excellent for complex multi-channel notifications (email + push + in-app + SMS). Overkill for in-app-only notifications on a language learning app. Monthly cost adds up with no proportional value.

**Why NOT WebSockets:** Unidirectional data flow (server to client) -- SSE is the right tool. WebSockets add unnecessary complexity for one-way notification delivery.

**Confidence:** HIGH -- SSE is a web standard; implementation pattern well-documented for Next.js.

---

### 5. Search: Postgres Full-Text Search (pg_search or tsvector)

| Package | Version | Purpose |
|---------|---------|---------|
| *No new package needed* | -- | Use Neon Postgres built-in FTS |

**Why Postgres FTS over Meilisearch/Algolia:**
- Dataset is small (courses, lessons, vocabulary) -- not millions of documents
- Neon Postgres supports `pg_trgm` and `pg_search` (ParadeDB BM25) extensions
- No additional infrastructure to manage
- Drizzle ORM supports raw SQL for FTS queries
- Zero additional cost

**CRITICAL WARNING -- CJK Language Support:**
`pg_trgm` does NOT support Chinese/Japanese/Korean characters. This is a documented limitation. For a Mandarin/Cantonese learning app, this matters significantly.

**Recommended approach:**
1. **Course/lesson titles and descriptions** (mostly English): Use standard `tsvector`/`tsquery` with GIN indexes. Simple, fast, works perfectly.
2. **Chinese vocabulary search**: Use `pg_search` with ICU tokenizer (Unicode-aware segmentation that handles CJK). Neon supports `pg_search` via ParadeDB partnership.
3. **Pinyin/Jyutping search**: Store romanized forms as separate indexed columns. Standard `tsvector` works fine for romanized text.

**Fallback if pg_search ICU tokenizer proves inadequate for Chinese:**
- Add Meilisearch (self-hosted or Cloud) with built-in CJK support
- Use Postgres as source of truth, sync to Meilisearch via n8n workflow

**Why NOT Meilisearch from the start:** Adding a search service for < 10K documents is over-engineering. Start with Postgres, add Meilisearch only if Chinese search quality is insufficient.

**Why NOT Algolia:** Expensive per-search pricing model. PostHog for analytics already adds a service; avoid service sprawl.

**Confidence:** MEDIUM -- pg_search ICU tokenizer CJK support on Neon needs validation during implementation. tsvector for English content is HIGH confidence.

---

### 6. Analytics: PostHog

| Package | Version | Purpose |
|---------|---------|---------|
| posthog-js | latest | Client-side analytics, session replay |
| posthog-node | latest | Server-side event tracking |

**Why PostHog:**
- Open-source, generous free tier (1M events/month, 5K session recordings free)
- Product analytics + session replay + feature flags in one platform
- Official Next.js integration with `instrumentation-client.ts` setup (Next.js 15.3+ pattern)
- Sentry integration (link errors to user sessions)
- Reverse proxy via Vercel rewrites (avoids ad blockers)
- Web analytics works with anonymous events (cheaper)
- LMS-specific value: track lesson completion funnels, video engagement, drop-off points

**Why NOT Vercel Analytics:** Only tracks Web Vitals and page views. No product analytics, no funnels, no session replay. Too basic for understanding student learning patterns.

**Why NOT Google Analytics:** Privacy concerns, no session replay, complex setup for custom events, no feature flags. PostHog is more developer-friendly.

**Why NOT Mixpanel:** Similar features but PostHog's free tier is more generous (1M vs 20K events). PostHog is open-source.

**Integration with existing stack:**
- Initialize in `instrumentation-client.ts` alongside Sentry
- Identify users via Clerk's `userId` after auth
- Track custom events: `posthog.capture('lesson_completed', { lessonId, score })`
- Reverse proxy through Next.js rewrites in `next.config.ts`

**Cost:** Free for up to 1M events/month. A language learning app with < 1000 students will stay well within free tier.

**Confidence:** HIGH -- verified via PostHog official Next.js docs and pricing page.

---

### 7. CI/CD: GitHub Actions

| Package | Version | Purpose |
|---------|---------|---------|
| *No npm package* | -- | GitHub Actions workflows (.github/workflows/) |

**Pipeline design:**

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit

  test-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
    env:
      SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
```

**Deployment strategy:**
- **Vercel** (recommended): Auto-deploys on push to main. GitHub Actions handles CI (lint, typecheck, test). Vercel handles CD.
- **Alternative (Docker + VPS):** Add Docker build step and SSH deploy. More complex but avoids Vercel lock-in.

**Why Vercel for deployment:**
- Zero-config Next.js deployment (they made Next.js)
- Preview deployments on every PR
- Edge functions, ISR, streaming all work out of the box
- Free tier sufficient for early stage

**Why GitHub Actions for CI:**
- Already using GitHub (git repo exists)
- Free for public repos, 2000 min/month for private
- Playwright has first-class GitHub Actions support with artifact upload

**Confidence:** HIGH -- standard, well-documented pattern.

---

### 8. API Rate Limiting: Upstash

| Package | Version | Purpose |
|---------|---------|---------|
| @upstash/ratelimit | ^2.0.8 | Serverless rate limiting |
| @upstash/redis | latest | Redis client for rate limiting |

**Why Upstash:**
- Only connectionless (HTTP-based) rate limiter -- works in serverless/edge without persistent connections
- Three algorithms: fixed window, sliding window, token bucket
- Caches in-memory while edge function is "hot" (minimizes Redis calls)
- Dynamic rate limits (new in Jan 2026) -- change limits at runtime
- Vercel official template exists for Next.js integration

**Why NOT in-memory rate limiting:** Serverless functions are stateless. In-memory maps reset on every cold start. Useless.

**Why NOT Redis directly:** @upstash/ratelimit handles algorithm implementation, headers (`X-RateLimit-Limit`, `Retry-After`), and caching. Don't reinvent.

**Integration with existing stack:**
- Apply in Next.js middleware for global rate limiting
- Apply per-route in API route handlers for sensitive endpoints
- Use Clerk `userId` as identifier for authenticated users, IP for anonymous
- Differentiate limits: authenticated (100 req/min), anonymous (20 req/min), AI endpoints (10 req/min)

**Cost:** Upstash Redis free tier: 10K commands/day. Rate limiting with caching uses very few commands. Free for this scale.

**Configuration:**
```typescript
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'),
  analytics: true,
  prefix: 'cantomando',
});
```

**Confidence:** HIGH -- verified via npm registry and Upstash official docs.

---

### 9. PDF Certificate Generation: @react-pdf/renderer

| Package | Version | Purpose |
|---------|---------|---------|
| @react-pdf/renderer | ^4.3.2 | Generate PDF certificates with React components |

**Why @react-pdf/renderer:**
- React-first: build PDFs using JSX and CSS-like styles
- Works on both browser and server (can generate in API routes)
- React 19 compatible (since v4.1.0)
- 1.4M weekly downloads, actively maintained (last publish: Dec 2025)
- Certificate templates are naturally component-based (student name, course, date, signature)

**Why NOT jsPDF:**
- Client-side only (requires dynamic import with SSR disabled in Next.js)
- Imperative API (`doc.text(x, y, 'text')`) -- harder to maintain certificate templates
- Fine for simple PDFs but certificates need styled layouts

**Why NOT Puppeteer:**
- Requires headless browser binary (500MB+) -- terrible for serverless
- Slow (spin up browser, render HTML, export PDF)
- Overkill for certificate generation

**Why NOT pdfme:**
- Template-based approach is good for forms, but certificates are simple enough for code-based templates
- Smaller ecosystem

**Integration with existing stack:**
- API Route: `GET /api/certificates/[enrollmentId]` generates PDF on server
- Use Clerk user data + Drizzle course data to populate template
- Stream PDF response with appropriate `Content-Type: application/pdf` header
- Chinese character support: use custom fonts (Noto Sans SC/TC) embedded in PDF

**IMPORTANT: Chinese font embedding:**
@react-pdf/renderer supports custom font registration. You MUST register a CJK font for Chinese characters to render in the certificate:
```typescript
import { Font } from '@react-pdf/renderer';

Font.register({
  family: 'NotoSansSC',
  src: '/fonts/NotoSansSC-Regular.ttf',
});
```

**Confidence:** HIGH -- verified via npm registry and react-pdf.org compatibility docs.

---

## Complete Installation Commands

```bash
# Error Monitoring
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs

# E2E Testing
npm install -D @playwright/test
npx playwright install

# PWA
npm install @serwist/next serwist

# Analytics
npm install posthog-js posthog-node

# Rate Limiting
npm install @upstash/ratelimit @upstash/redis

# PDF Certificates
npm install @react-pdf/renderer
```

**Total new production dependencies:** 6 packages
**Total new dev dependencies:** 1 package (@playwright/test)
**No new package needed for:** Notifications (custom SSE), Search (Postgres FTS), CI/CD (GitHub Actions YAML)

---

## Version Compatibility Matrix

| New Package | Works With | Verified |
|-------------|------------|----------|
| @sentry/nextjs 10.37.0 | Next.js 16.x, React 19 | YES -- test suite uses Next.js 16.0.7 |
| @playwright/test 1.57.0 | Any Next.js (external tool) | YES -- framework agnostic |
| @serwist/next 9.5.0 | Next.js 16.x (Turbopack prod, webpack dev) | YES -- active Next.js 16 support |
| posthog-js latest | Next.js 15.3+ (instrumentation-client.ts) | YES -- official Next.js guide |
| @upstash/ratelimit 2.0.8 | Any serverless/edge runtime | YES -- designed for it |
| @react-pdf/renderer 4.3.2 | React 19 (since v4.1.0) | YES -- compatibility page confirms |

---

## External Services Required

| Service | Free Tier | Purpose | Required? |
|---------|-----------|---------|-----------|
| Sentry | 5K errors/month, 1 user | Error monitoring | YES |
| PostHog Cloud | 1M events/month, 5K recordings | Analytics | YES |
| Upstash Redis | 10K commands/day | Rate limiting storage | YES |
| Vercel | Hobby (free) | Deployment | RECOMMENDED |
| GitHub Actions | 2000 min/month (private) | CI pipeline | YES |

**Total additional monthly cost at launch:** $0 (all within free tiers for < 1000 students)

---

## What NOT to Add

| Avoid | Why | What to Do Instead |
|-------|-----|---------------------|
| Knock / Novu | Over-engineered for low-volume in-app notifications | Custom SSE + Postgres table |
| Meilisearch (initially) | Over-engineering for < 10K searchable documents | Postgres FTS, add later if needed |
| Vercel Analytics | Too basic -- no funnels, session replay, or custom events | PostHog |
| next-pwa | Unmaintained, requires webpack, incompatible with Turbopack | Serwist |
| Cypress | No Safari support, no native parallelism | Playwright |
| Puppeteer (for PDFs) | 500MB binary, slow, terrible for serverless | @react-pdf/renderer |
| Socket.IO / WebSockets | Notifications are unidirectional; SSE is simpler and sufficient | Server-Sent Events |
| In-memory rate limiting | Stateless serverless functions lose state on cold start | Upstash Redis |
| Datadog / New Relic | Enterprise pricing, overkill for early-stage LMS | Sentry + PostHog covers errors + analytics |
| Redis self-hosted | Operational burden; Upstash is serverless and free tier is generous | Upstash managed Redis |

---

## Sources

**HIGH Confidence (Official docs, npm registry):**
- [Sentry Next.js SDK](https://docs.sentry.io/platforms/javascript/guides/nextjs/) -- setup, build options, Next.js 16 support
- [@sentry/nextjs npm](https://www.npmjs.com/package/@sentry/nextjs) -- v10.37.0, 2.5M weekly downloads
- [Playwright Next.js Testing](https://nextjs.org/docs/pages/guides/testing/playwright) -- official guide
- [Playwright Release Notes](https://playwright.dev/docs/release-notes) -- v1.57.0 features
- [Serwist Getting Started](https://serwist.pages.dev/docs/next/getting-started) -- v9.5.0, Next.js integration
- [Next.js PWA Guide](https://nextjs.org/docs/app/guides/progressive-web-apps) -- recommends Serwist
- [PostHog Next.js Docs](https://posthog.com/docs/libraries/next-js) -- setup, instrumentation-client.ts
- [PostHog Pricing](https://posthog.com/pricing) -- free tier details
- [@upstash/ratelimit npm](https://www.npmjs.com/package/@upstash/ratelimit) -- v2.0.8, algorithms
- [Upstash Rate Limiting Blog](https://upstash.com/blog/nextjs-ratelimiting) -- Next.js integration guide
- [@react-pdf/renderer npm](https://www.npmjs.com/package/@react-pdf/renderer) -- v4.3.2, React 19 compat
- [react-pdf.org Compatibility](https://react-pdf.org/compatibility) -- React 19 since v4.1.0
- [Neon pg_trgm Docs](https://neon.com/docs/extensions/pg_trgm) -- CJK limitation documented
- [Neon pg_search Docs](https://neon.com/docs/extensions/pg_search) -- BM25, ICU tokenizer

**MEDIUM Confidence (Verified WebSearch):**
- [Playwright vs Cypress Enterprise Guide (2026)](https://devin-rosario.medium.com/playwright-vs-cypress-the-2026-enterprise-testing-guide-ade8b56d3478) -- migration benchmarks
- [Next.js 16 PWA with Serwist](https://blog.logrocket.com/nextjs-16-pwa-offline-support) -- LogRocket guide
- [Postgres FTS on Next.js (Jan 2026)](https://medium.com/@nanocrafts199/using-postgres-full-text-search-on-a-next-js-fullstack-app-8eea4a51979a) -- Drizzle + Neon FTS
- [SSE Notifications in Next.js](https://www.pedroalonso.net/blog/sse-nextjs-real-time-notifications/) -- implementation pattern

**LOW Confidence (needs validation during implementation):**
- pg_search ICU tokenizer effectiveness for Chinese character segmentation on Neon
- Serwist offline support with Next.js 16 dynamic routes (community reports of issues)

---

*Production readiness stack research for: CantoMando Blueprint LMS*
*Researched: 2026-01-30*
