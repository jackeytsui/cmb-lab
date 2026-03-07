# Phase 14: E2E Testing - Research

**Researched:** 2026-01-30
**Domain:** Playwright E2E testing for Next.js 16 with Clerk auth, Mux video, and Chinese IME
**Confidence:** HIGH (core stack), MEDIUM (Clerk integration), LOW (IME composition)

## Summary

This phase implements end-to-end testing using Playwright for a Next.js 16 LMS application. The research covers five key domains: (1) Playwright configuration for cross-browser testing, (2) Clerk authentication state reuse via `@clerk/testing`, (3) mocking strategies for n8n webhooks and Mux video, (4) Chinese IME composition event workarounds, and (5) GitHub Actions CI integration.

The standard approach is Playwright Test with `@clerk/testing` for auth, `page.route()` for client-side API mocking, and Next.js experimental `testProxy` for server-side fetch mocking. The Clerk integration has first-party support with `clerkSetup()`, `clerk.signIn()`, and `storageState` persistence. Chinese IME testing requires a workaround using `page.evaluate()` to dispatch `CompositionEvent` objects, as Playwright lacks native IME support (issue #5777, still open P3).

**Primary recommendation:** Use Playwright with `@clerk/testing` for auth state reuse, `page.route()` for webhook mocking, and `page.evaluate()` for CompositionEvent simulation.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | latest (1.50+) | E2E test runner | Official Microsoft framework, cross-browser, auto-wait |
| `@clerk/testing` | latest | Clerk auth testing helpers | First-party Clerk package, handles bot detection bypass |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `msw` | 2.x | Mock Service Worker for server-side fetch mocking | Only if `next.onFetch()` is insufficient for server-side mocking |
| `dotenv` | 17.x (already installed) | Load env vars for test config | Loading test credentials from `.env.test` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@clerk/testing` | Manual Clerk login via UI | 5-15s per test, fragile, no bot detection bypass |
| `page.route()` | `msw` + `testProxy` | `page.route()` is simpler for client-side; `testProxy` needed only for SSR fetch mocking |
| Next.js `testProxy` | Direct API route testing | `testProxy` is still experimental; for webhook routes that receive external POSTs, direct fetch calls work fine |

**Installation:**
```bash
npm install -D @playwright/test @clerk/testing
npx playwright install --with-deps chromium webkit
```

## Architecture Patterns

### Recommended Project Structure
```
e2e/
  fixtures/
    auth.ts              # Custom test fixtures with auth helpers
    base.ts              # Base test extending Playwright with Clerk
  pages/
    dashboard.page.ts    # Page Object Model for dashboard
    lesson.page.ts       # Page Object Model for lesson page
    coach.page.ts        # Page Object Model for coach workflow
  helpers/
    composition.ts       # Chinese IME composition event helper
    mux-mock.ts          # Mux video player mocking utilities
    webhook-mock.ts      # n8n webhook response mocking
  tests/
    enrollment.spec.ts   # TEST-02: enrollment webhook flow
    lesson.spec.ts       # TEST-03: student completes lesson
    grading.spec.ts      # TEST-04: AI grading with mocked webhook
    coach.spec.ts        # TEST-05: coach review workflow
    chinese-input.spec.ts # TEST-06: Chinese IME input
  global.setup.ts        # Clerk auth setup + state persistence
playwright.config.ts     # Cross-browser config with projects
playwright/
  .clerk/                # Auth state storage (gitignored)
```

### Pattern 1: Clerk Auth State Reuse (TEST-08)
**What:** Authenticate once in global setup, save storageState, reuse across all tests
**When to use:** Every test that requires a logged-in user
**Example:**
```typescript
// Source: https://clerk.com/docs/guides/development/testing/playwright/test-authenticated-flows
// global.setup.ts
import { clerk, clerkSetup } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'
import path from 'path'

setup.describe.configure({ mode: 'serial' })

setup('global setup', async ({}) => {
  await clerkSetup()
})

const studentAuth = path.join(__dirname, 'playwright/.clerk/student.json')
const coachAuth = path.join(__dirname, 'playwright/.clerk/coach.json')

setup('authenticate student', async ({ page }) => {
  await page.goto('/')
  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      identifier: process.env.E2E_CLERK_STUDENT_EMAIL!,
      password: process.env.E2E_CLERK_STUDENT_PASSWORD!,
    },
  })
  await page.goto('/dashboard')
  await page.waitForSelector('[data-testid="dashboard"]')
  await page.context().storageState({ path: studentAuth })
})

setup('authenticate coach', async ({ page }) => {
  await page.goto('/')
  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      identifier: process.env.E2E_CLERK_COACH_EMAIL!,
      password: process.env.E2E_CLERK_COACH_PASSWORD!,
    },
  })
  await page.goto('/coach')
  await page.waitForSelector('[data-testid="coach-dashboard"]')
  await page.context().storageState({ path: coachAuth })
})
```

### Pattern 2: Cross-Browser Project Config (TEST-01)
**What:** Playwright projects for Chrome, Safari, and mobile viewport
**When to use:** playwright.config.ts
**Example:**
```typescript
// Source: https://playwright.dev/docs/auth
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'on-failure' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.clerk/student.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: 'playwright/.clerk/student.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 14'],
        storageState: 'playwright/.clerk/student.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'coach-tests',
      testMatch: /coach\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.clerk/coach.json',
      },
      dependencies: ['setup'],
    },
  ],
})
```

### Pattern 3: Webhook Mocking (TEST-02, TEST-04)
**What:** Mock external API calls and test webhook endpoints directly
**When to use:** Testing enrollment webhook and n8n AI grading responses
**Example:**
```typescript
// For TEST-02: Call the enrollment webhook API route directly
test('enrollment webhook creates student with course access', async ({ request }) => {
  const response = await request.post('/api/webhooks/enroll', {
    headers: {
      'x-webhook-secret': process.env.ENROLLMENT_WEBHOOK_SECRET!,
      'Content-Type': 'application/json',
    },
    data: {
      email: 'test-student@example.com',
      name: 'Test Student',
      courseId: 'test-course-id',
      accessTier: 'full',
    },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  expect(body.success).toBe(true)
  expect(body.accessTier).toBe('full')
})

// For TEST-04: Mock n8n webhook response for AI grading
test('AI grading returns feedback', async ({ page }) => {
  // Intercept the grading API call that would normally hit n8n
  await page.route('**/api/grade', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        score: 85,
        feedback: 'Great pronunciation of the tones.',
        corrections: [],
      }),
    })
  })

  await page.goto('/lessons/test-lesson-id')
  // ... interact with lesson, submit for grading
})
```

### Pattern 4: Chinese IME Composition (TEST-06)
**What:** Simulate Chinese IME input via CompositionEvent dispatch
**When to use:** Testing Chinese text input fields with IME handling
**Example:**
```typescript
// Source: https://github.com/microsoft/playwright/issues/5777
// e2e/helpers/composition.ts
export async function typeChineseText(
  page: import('@playwright/test').Page,
  selector: string,
  finalText: string,
  intermediateSteps: string[] = []
) {
  const element = page.locator(selector)
  await element.click()

  // Simulate IME composition sequence
  await element.evaluate((el, { steps, final }) => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }))

    for (const step of steps) {
      el.dispatchEvent(new CompositionEvent('compositionupdate', { data: step }))
      // Also fire input event with isComposing: true
      el.dispatchEvent(new InputEvent('input', {
        data: step,
        inputType: 'insertCompositionText',
        isComposing: true,
      }))
    }

    el.dispatchEvent(new CompositionEvent('compositionend', { data: final }))
    el.dispatchEvent(new InputEvent('input', {
      data: final,
      inputType: 'insertCompositionText',
      isComposing: false,
    }))

    // Set the actual value
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set
      nativeInputValueSetter?.call(el, final)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, { steps: intermediateSteps, final: finalText })
}

// Usage in test:
test('Chinese text input works with IME composition', async ({ page }) => {
  await page.goto('/lessons/test-lesson')
  await typeChineseText(
    page,
    '[data-testid="chinese-input"]',
    '你好世界',
    ['n', 'ni', '你', '你h', '你ha', '你hao', '你好']
  )
  await expect(page.locator('[data-testid="chinese-input"]')).toHaveValue('你好世界')
})
```

### Pattern 5: Mux Video Player Mocking (TEST-03)
**What:** Mock or stub Mux video player for lesson completion testing
**When to use:** Testing video progress tracking without actual video streaming
**Example:**
```typescript
// Mock Mux API requests and simulate video progress
test('student completes lesson with video progress', async ({ page }) => {
  // Block actual Mux video streaming
  await page.route('**/stream.mux.com/**', route => route.abort())
  await page.route('**/image.mux.com/**', route => route.fulfill({
    status: 200,
    contentType: 'image/jpeg',
    body: Buffer.alloc(100), // Minimal placeholder
  }))

  await page.goto('/lessons/test-lesson-id')

  // Simulate video progress by calling the progress API directly
  // or by dispatching events on the mux-player element
  await page.evaluate(() => {
    const player = document.querySelector('mux-player')
    if (player) {
      // Dispatch timeupdate events to simulate watching
      player.dispatchEvent(new CustomEvent('timeupdate', {
        detail: { currentTime: 300, duration: 600 }
      }))
    }
  })

  // Alternatively, call progress API directly
  await page.request.post('/api/progress/test-lesson-id', {
    data: { videoProgress: 90, completed: true },
  })

  // Verify lesson shows as completed
  await expect(page.locator('[data-testid="lesson-complete"]')).toBeVisible()
})
```

### Anti-Patterns to Avoid
- **Logging in via Clerk UI in every test:** Use `@clerk/testing` with storageState persistence instead. Each UI login takes 5-15 seconds.
- **Testing against real Mux streams:** Mock Mux network requests and simulate video events. Real streams are slow and flaky.
- **Testing against real n8n webhooks:** Mock the grading API response with `page.route()`. Real webhooks add external dependency.
- **Using `page.fill()` for Chinese text:** This bypasses composition events entirely. Use the `page.evaluate()` + CompositionEvent workaround.
- **Running `npm run dev` in CI without build:** Use `npm run build && npm run start` for CI to match production behavior.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth state management | Custom cookie/token injection | `@clerk/testing` with `clerkSetup()` + `clerk.signIn()` | Handles Clerk bot detection, testing tokens, session management |
| Cross-browser config | Manual browser launch scripts | Playwright `projects` with `devices` presets | Built-in device emulation, viewport, userAgent |
| CI workflow | Custom bash scripts | Playwright GitHub Actions pattern | Built-in report upload, browser caching, retry logic |
| API mocking | Custom mock server | `page.route()` for client-side, `next.onFetch()` for SSR | Native Playwright/Next.js integration, per-test isolation |
| Test retries | Custom retry logic | Playwright `retries` config option | Built-in retry with traces on failure |

**Key insight:** Playwright and `@clerk/testing` handle the hardest parts (browser management, auth bypass, network interception). Focus test code on asserting business logic, not infrastructure.

## Common Pitfalls

### Pitfall 1: Clerk Bot Detection Blocking Tests
**What goes wrong:** Tests fail with auth errors because Clerk's bot detection blocks automated browser requests.
**Why it happens:** Playwright runs headless browsers that Clerk identifies as bots by default.
**How to avoid:** Always call `clerkSetup()` in global setup and `setupClerkTestingToken()` in tests that don't use `clerk.signIn()`. The `@clerk/testing` package injects testing tokens that bypass bot detection.
**Warning signs:** 403 errors, "Unable to sign in" errors, or blank auth pages in test runs.

### Pitfall 2: storageState Not Persisting Clerk Session
**What goes wrong:** Tests start unauthenticated despite storageState being configured.
**Why it happens:** Clerk uses session tokens that may expire or require additional session storage beyond cookies.
**How to avoid:** After `clerk.signIn()`, navigate to a protected page and verify auth before saving `storageState`. Create the `playwright/.clerk/` directory and add it to `.gitignore`. Verify the saved JSON file contains Clerk session cookies.
**Warning signs:** Tests pass in setup but fail in subsequent projects with "sign in required" redirects.

### Pitfall 3: Flaky Tests from Race Conditions with Next.js Server
**What goes wrong:** Tests intermittently fail because the Next.js dev server isn't ready or pages haven't fully hydrated.
**Why it happens:** Next.js RSC hydration can take variable time, especially with data loading.
**How to avoid:** Use Playwright's `webServer` config with proper `url` and `timeout`. In tests, use `page.waitForSelector()` or `expect(locator).toBeVisible()` rather than fixed `page.waitForTimeout()` delays.
**Warning signs:** Tests pass locally but fail in CI, or pass on retry.

### Pitfall 4: CompositionEvent Not Triggering React State Updates
**What goes wrong:** Dispatching CompositionEvent via `evaluate()` doesn't trigger React's synthetic event handlers.
**Why it happens:** React uses its own event system. Simply dispatching DOM events may not bubble through React's event delegation properly.
**How to avoid:** After dispatching composition events, also set the input's value using the native value setter (bypassing React's synthetic property) and dispatch a `change` event with `{ bubbles: true }`. Test against the actual DOM value, not React state.
**Warning signs:** CompositionEvent fires but input value doesn't update in React component state.

### Pitfall 5: CI Timeout from Dev Server Start
**What goes wrong:** GitHub Actions workflow times out waiting for the Next.js server to start.
**Why it happens:** `npm run dev` in CI is slow due to JIT compilation. Cold starts can take 60+ seconds.
**How to avoid:** In CI, use `npm run build && npm run start` instead of `npm run dev`. Set `webServer.timeout` to at least 120000ms. Use the `reuseExistingServer: !process.env.CI` pattern.
**Warning signs:** "Timeout waiting for server" errors in CI, tests pass locally.

### Pitfall 6: Different Auth Requirements for Different Test Roles
**What goes wrong:** Coach tests fail because they use student auth state, or admin tests use wrong role.
**Why it happens:** All tests share one storageState by default.
**How to avoid:** Create separate Playwright projects for each role (student, coach, admin), each with its own storageState file. Use the `testMatch` pattern to route tests to the correct project.
**Warning signs:** Permission denied errors, wrong dashboard showing up.

## Code Examples

### npm scripts for package.json
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:chromium": "playwright test --project=chromium"
  }
}
```

### GitHub Actions CI Workflow (TEST-07)
```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on:
  pull_request:
    branches: [main]

jobs:
  e2e:
    timeout-minutes: 30
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium webkit

      - name: Build Next.js
        run: npm run build
        env:
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.CLERK_PUBLISHABLE_KEY }}
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          # Add other required env vars

      - name: Run E2E tests
        run: npx playwright test
        env:
          CLERK_PUBLISHABLE_KEY: ${{ secrets.CLERK_PUBLISHABLE_KEY }}
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
          E2E_CLERK_STUDENT_EMAIL: ${{ secrets.E2E_CLERK_STUDENT_EMAIL }}
          E2E_CLERK_STUDENT_PASSWORD: ${{ secrets.E2E_CLERK_STUDENT_PASSWORD }}
          E2E_CLERK_COACH_EMAIL: ${{ secrets.E2E_CLERK_COACH_EMAIL }}
          E2E_CLERK_COACH_PASSWORD: ${{ secrets.E2E_CLERK_COACH_PASSWORD }}
          ENROLLMENT_WEBHOOK_SECRET: ${{ secrets.ENROLLMENT_WEBHOOK_SECRET }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

### .env.test (local testing)
```bash
# Clerk testing credentials
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
E2E_CLERK_STUDENT_EMAIL=test-student@example.com
E2E_CLERK_STUDENT_PASSWORD=test-password
E2E_CLERK_COACH_EMAIL=test-coach@example.com
E2E_CLERK_COACH_PASSWORD=test-password

# Webhook secrets
ENROLLMENT_WEBHOOK_SECRET=test-secret

# Database
DATABASE_URL=postgresql://...
```

### Page Object Model Example
```typescript
// e2e/pages/lesson.page.ts
import { Page, Locator, expect } from '@playwright/test'

export class LessonPage {
  readonly page: Page
  readonly videoPlayer: Locator
  readonly interactionArea: Locator
  readonly submitButton: Locator
  readonly completionBadge: Locator
  readonly chineseInput: Locator

  constructor(page: Page) {
    this.page = page
    this.videoPlayer = page.locator('mux-player')
    this.interactionArea = page.locator('[data-testid="interaction-area"]')
    this.submitButton = page.locator('[data-testid="submit-answer"]')
    this.completionBadge = page.locator('[data-testid="lesson-complete"]')
    this.chineseInput = page.locator('[data-testid="chinese-input"]')
  }

  async goto(lessonId: string) {
    await this.page.goto(`/lessons/${lessonId}`)
    await this.page.waitForLoadState('networkidle')
  }

  async submitAnswer(answer: string) {
    await this.interactionArea.fill(answer)
    await this.submitButton.click()
  }

  async expectCompleted() {
    await expect(this.completionBadge).toBeVisible()
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual Clerk login in each test | `@clerk/testing` with `clerk.signIn()` + storageState | 2024+ | 60-80% faster test execution |
| Cypress for Next.js E2E | Playwright (recommended by Next.js docs) | 2023+ | Better cross-browser, faster, built-in auto-wait |
| Custom mock server for API testing | `page.route()` + Next.js `testProxy` | 2024+ | Per-test isolation, no separate process |
| Full IME simulation | `page.evaluate()` + CompositionEvent dispatch | Still a workaround | No native IME support in Playwright yet |

**Deprecated/outdated:**
- `@clerk/testing/cypress`: Cypress is not the recommended framework for Next.js anymore
- `next/experimental/testmode/playwright`: Still experimental as of Next.js 16, use only if SSR mocking is required
- `page.type()` for CJK input: Does not trigger composition events

## Open Questions

1. **Mux Player Custom Element Event Interface**
   - What we know: Mux Player is a web component (`<mux-player>`) with custom events
   - What's unclear: Exact event names and payloads for progress tracking (timeupdate vs custom events), and whether `dispatchEvent` works on the shadow DOM internals
   - Recommendation: During implementation, inspect the Mux player element in dev tools to identify the correct events. May need to mock at the API level (`/api/progress/`) rather than simulating player events

2. **Next.js 16 testProxy Compatibility**
   - What we know: `testProxy` exists in Next.js experimental, works with MSW
   - What's unclear: Whether it's fully stable in Next.js 16.1.4, and whether it conflicts with Clerk's testing token injection
   - Recommendation: Start with `page.route()` for client-side mocking. Only adopt `testProxy` if server-side fetch mocking is explicitly needed for a test case

3. **Clerk Test User Provisioning**
   - What we know: Tests need pre-existing Clerk users with specific roles
   - What's unclear: Whether test users should be created in Clerk dashboard manually or provisioned via Clerk API in test setup
   - Recommendation: Create dedicated test users in the Clerk development instance dashboard. Store credentials in `.env.test` and GitHub Secrets. Do not auto-provision users in tests to avoid flakiness

4. **Database State for E2E Tests**
   - What we know: Tests need courses, lessons, and interactions to exist in the database
   - What's unclear: Whether to use the existing seed script, a separate test fixture, or Neon branch isolation
   - Recommendation: Use the existing `db:seed` script to populate test data. For CI, use a dedicated Neon branch or test database. Consider a `beforeAll` that verifies required test data exists

## Sources

### Primary (HIGH confidence)
- [Next.js Playwright Testing Guide](https://nextjs.org/docs/pages/guides/testing/playwright) - Configuration, webServer setup
- [Playwright Authentication Docs](https://playwright.dev/docs/auth) - storageState, project dependencies, multi-role patterns
- [Clerk Playwright Testing Overview](https://clerk.com/docs/guides/development/testing/playwright/overview) - `@clerk/testing` setup, `clerkSetup()`
- [Clerk Test Authenticated Flows](https://clerk.com/docs/guides/development/testing/playwright/test-authenticated-flows) - Auth state reuse, `clerk.signIn()`, storageState persistence (Updated Jan 14, 2026)
- [Clerk Test Helpers](https://clerk.com/docs/guides/development/testing/playwright/test-helpers) - `setupClerkTestingToken()`, API reference
- [Playwright CI Setup](https://playwright.dev/docs/ci-intro) - GitHub Actions workflow
- [Playwright Mock APIs](https://playwright.dev/docs/mock) - `page.route()` interception

### Secondary (MEDIUM confidence)
- [Next.js testProxy README](https://github.com/vercel/next.js/blob/canary/packages/next/src/experimental/testmode/playwright/README.md) - Experimental SSR mocking with `next.onFetch()`
- [Momentic: Fetch Mocking with Playwright in Next.js](https://momentic.ai/blog/fetch-mocking-with-playwright-next-js) - testProxy + MSW setup patterns

### Tertiary (LOW confidence)
- [Playwright IME Issue #5777](https://github.com/microsoft/playwright/issues/5777) - CompositionEvent API status (still open P3, no native support)
- CompositionEvent workaround via `page.evaluate()` - Community pattern, not officially documented

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Playwright and `@clerk/testing` are well-documented first-party solutions
- Architecture: HIGH - Playwright project structure and Clerk auth patterns are well-established
- Webhook mocking: HIGH - `page.route()` is core Playwright API, well-documented
- Chinese IME: LOW - Workaround via `page.evaluate()` + CompositionEvent, not natively supported
- Mux video mocking: MEDIUM - Standard network interception, but player event simulation is uncertain
- CI workflow: HIGH - Standard Playwright GitHub Actions pattern

**Research date:** 2026-01-30
**Valid until:** 2026-03-01 (Playwright and Clerk are stable; IME status may change)
