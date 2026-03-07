# Phase 20: PWA (Progressive Web App) - Research

**Researched:** 2026-01-30
**Domain:** Progressive Web App — manifest, service worker, install prompt, caching strategies
**Confidence:** HIGH

## Summary

PWA implementation for this Next.js 16 App Router LMS requires three distinct pieces: a web app manifest (built-in Next.js support via `app/manifest.ts`), a service worker with smart caching strategies, and a deferred install prompt triggered after first lesson completion.

Next.js has **native built-in support** for generating web app manifests via the App Router's `app/manifest.ts` convention. For the service worker, there are two viable approaches: a **lightweight manual `public/sw.js`** (recommended by Next.js official docs) or **Serwist** (the successor to next-pwa, providing precaching and runtime caching). Given the requirements explicitly state "lesson content never served stale" and the app does NOT need offline support, the manual approach is simpler and avoids the Webpack/Turbopack compatibility issue with Serwist.

The install prompt requires intercepting the `beforeinstallprompt` browser event and deferring it until the student completes their first lesson. This event is only available in Chromium-based browsers (Chrome, Edge, Samsung Internet). iOS has no programmatic install prompt; users must manually use Safari's "Add to Home Screen" via the Share menu. The app should detect iOS and show manual instructions.

**Primary recommendation:** Use Next.js built-in `app/manifest.ts` for the manifest, a manual `public/sw.js` service worker with network-first strategy for API/lesson routes and cache-first for static assets, and a custom React hook/component that captures `beforeinstallprompt` and triggers it after lesson completion.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js (built-in) | 16.1.4 | `app/manifest.ts` for web app manifest | Native App Router support, no dependencies needed |
| Manual `public/sw.js` | N/A | Service worker with fetch event handling | Official Next.js recommended approach; avoids Serwist Webpack requirement |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@serwist/next` + `serwist` | 9.5.0 | Precaching, runtime caching strategies, offline fallback | Only if offline support is needed in the future |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual `sw.js` | Serwist 9.5.0 | Serwist adds precaching and structured caching strategies but requires `--webpack` flag for builds (Next.js 16 defaults to Turbopack). More complexity for a project that explicitly does NOT need offline support. |
| Manual `sw.js` | `next-pwa` | Deprecated — do not use. Serwist is its successor. |

**Installation:**
```bash
# No additional packages needed for the manual approach
# The manifest and service worker are pure Next.js features

# Only if upgrading to Serwist later:
# npm install @serwist/next && npm install -D serwist
```

## Architecture Patterns

### Recommended Project Structure
```
src/app/
├── manifest.ts                    # Web app manifest (Next.js convention)
├── layout.tsx                     # Add viewport meta, theme-color
public/
├── sw.js                          # Service worker (manually authored)
├── icon-192x192.png               # PWA icon (required)
├── icon-512x512.png               # PWA icon (required)
├── apple-touch-icon.png           # iOS home screen icon (180x180)
src/
├── components/
│   └── pwa/
│       ├── ServiceWorkerRegistrar.tsx   # Client component: registers SW
│       └── InstallPrompt.tsx            # Client component: deferred install UI
├── hooks/
│   └── usePWAInstall.ts           # Hook: captures beforeinstallprompt, exposes trigger
```

### Pattern 1: Next.js App Router Manifest (TypeScript)
**What:** Generate the manifest file using Next.js metadata API
**When to use:** Always — this is the built-in approach
**Example:**
```typescript
// Source: https://nextjs.org/docs/app/guides/progressive-web-apps
// File: src/app/manifest.ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cantomando Blueprint LMS',
    short_name: 'Cantomando',
    description: 'Interactive Mandarin & Cantonese learning platform',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#030712',    // gray-950 (matches body bg)
    theme_color: '#030712',         // dark theme
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
```

### Pattern 2: Manual Service Worker with Network-First for API Routes
**What:** A hand-written service worker that uses network-first for dynamic content and cache-first for static assets
**When to use:** When you need installability + smart caching but NOT full offline support
**Example:**
```javascript
// Source: https://nextjs.org/docs/app/guides/progressive-web-apps + MDN Service Worker API
// File: public/sw.js

const CACHE_NAME = 'cantomando-v1';

// Static assets to precache on install
const PRECACHE_ASSETS = [
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Install: precache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API/lesson/auth routes, cache-first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NEVER cache API routes, auth, or lesson content
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/sign-in') ||
    url.pathname.startsWith('/sign-up') ||
    url.pathname.includes('/lessons/') ||
    url.pathname.includes('/courses/') ||
    url.pathname.includes('/dashboard')
  ) {
    // Network-only for dynamic routes
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for static assets (JS, CSS, images, fonts)
  if (
    event.request.destination === 'style' ||
    event.request.destination === 'script' ||
    event.request.destination === 'image' ||
    event.request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Default: network-first (for HTML navigations)
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
```

### Pattern 3: Deferred Install Prompt After First Lesson Completion
**What:** Capture the `beforeinstallprompt` event and trigger it after a specific user action
**When to use:** When you want the install prompt at a specific engagement milestone
**Example:**
```typescript
// File: src/hooks/usePWAInstall.ts
'use client';

import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS (no beforeinstallprompt support)
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Capture the deferred prompt (Chromium browsers only)
    const handler = (e: Event) => {
      e.preventDefault(); // Prevent browser's default install UI
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null); // Can only call prompt() once
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    return outcome === 'accepted';
  }, [deferredPrompt]);

  return {
    canPrompt: !!deferredPrompt,
    isInstalled,
    isIOS,
    triggerInstall,
  };
}
```

### Pattern 4: Service Worker Registration Component
**What:** A client component that registers the service worker on mount
**When to use:** Always — placed in root layout
**Example:**
```typescript
// File: src/components/pwa/ServiceWorkerRegistrar.tsx
'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
    }
  }, []);

  return null;
}
```

### Pattern 5: iOS Manual Install Instructions
**What:** Since iOS does not fire `beforeinstallprompt`, show manual instructions
**When to use:** When detecting iOS in standalone-eligible context
**Example:**
```typescript
// Inside InstallPrompt component
if (isIOS && !isInstalled) {
  return (
    <div>
      <p>To install this app on your iPhone:</p>
      <ol>
        <li>Tap the Share button in Safari</li>
        <li>Scroll down and tap "Add to Home Screen"</li>
      </ol>
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Caching lesson content:** The requirements explicitly state lesson content must NEVER be stale. Use network-only for `/api/progress/`, `/api/` routes, and lesson pages.
- **Showing install prompt immediately:** Requirements say "after student completes first lesson." Using `beforeinstallprompt` without deferral violates this.
- **Using `next-pwa`:** Deprecated. Do not use.
- **Caching Clerk auth routes:** Authentication tokens and session data must NEVER be cached by the service worker.
- **Relying on Serwist with Turbopack:** Serwist requires `--webpack` flag. Adds build complexity for a project that doesn't need offline support.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Web manifest | JSON file in public/ | `app/manifest.ts` (Next.js built-in) | TypeScript type safety, dynamic values, auto-linked in HTML |
| PWA icon generation | Manual resizing | [realfavicongenerator.net](https://realfavicongenerator.net/) or similar tool | Generates all required sizes, splash screens, and meta tags |
| Base64 VAPID key conversion | Custom decoder | `urlBase64ToUint8Array` utility (standard pattern) | Edge cases in base64url encoding |
| Offline fallback page (if needed later) | Complex routing | Serwist `fallbacks.entries` | Handles document/image/font fallbacks cleanly |

**Key insight:** For a project that requires installability and fresh content (not offline support), a manual service worker is significantly simpler than a library-based approach. The service worker only needs to handle `fetch` events with the right strategy per route type.

## Common Pitfalls

### Pitfall 1: Service Worker Caching Stale Lesson Content
**What goes wrong:** Students see outdated lesson content because the service worker returns a cached response
**Why it happens:** Default caching strategies (cache-first, stale-while-revalidate) serve cached content for HTML and API routes
**How to avoid:** Use network-only for ALL dynamic routes: `/api/*`, `/lessons/*`, `/courses/*`, `/dashboard`. Only cache-first for truly static assets (JS bundles, CSS, images, fonts)
**Warning signs:** Students report seeing old lesson data after content updates

### Pitfall 2: Clerk Authentication Broken by Service Worker
**What goes wrong:** Authentication fails because the service worker intercepts and caches Clerk's auth requests
**Why it happens:** Service worker's `fetch` handler intercepts ALL requests including auth tokens, session checks, and redirects
**How to avoid:** Explicitly exclude ALL Clerk-related paths from caching: `/sign-in`, `/sign-up`, `/api/clerk`, `clerk.*.com` domains. Use network-only for these.
**Warning signs:** Users stuck in sign-in loops, "unauthorized" errors after signing in

### Pitfall 3: `beforeinstallprompt` Not Firing
**What goes wrong:** The install prompt never appears despite meeting PWA criteria
**Why it happens:** Multiple causes: (1) Already installed, (2) User dismissed recently, (3) iOS (never fires), (4) Missing manifest fields, (5) No fetch handler in service worker, (6) Not HTTPS
**How to avoid:** Check all criteria: valid manifest with name/icons/start_url/display, registered service worker with fetch handler, served over HTTPS. Test in Chrome DevTools > Application > Manifest
**Warning signs:** No `beforeinstallprompt` event in DevTools console, Lighthouse PWA audit failures

### Pitfall 4: iOS PWA Limitations
**What goes wrong:** Features work on Android/Chrome but not on iOS Safari
**Why it happens:** iOS does not support `beforeinstallprompt`, has a 50MB cache limit, only supports `standalone` display mode (not `fullscreen` or `minimal-ui`), and push notifications require iOS 16.4+ with the app installed to the home screen
**How to avoid:** Detect iOS and show manual install instructions. Test on real iOS devices. Use `standalone` display mode. Keep cache sizes well under 50MB.
**Warning signs:** No install prompt on iOS, broken layout in standalone mode, push notifications not working

### Pitfall 5: Service Worker Update Stuck
**What goes wrong:** New service worker version deployed but users keep seeing old cached assets
**Why it happens:** Service worker lifecycle: new SW installs but waits until all tabs are closed before activating
**How to avoid:** Use `skipWaiting()` in install event and `clients.claim()` in activate event. Set `Cache-Control: no-cache, no-store, must-revalidate` header on `sw.js` in Next.js config.
**Warning signs:** Users report old UI after deployment, cache version mismatch in DevTools

### Pitfall 6: Mux Video Player Interference
**What goes wrong:** Mux video streaming breaks when service worker intercepts video chunk requests
**Why it happens:** Service worker `fetch` handler intercepts Mux CDN requests for video segments
**How to avoid:** Only handle same-origin requests in the service worker. Skip cross-origin requests entirely (Mux streams from `stream.mux.com`). Check `event.request.url` origin before handling.
**Warning signs:** Videos buffer indefinitely, 206 Partial Content responses fail

## Code Examples

### Complete `next.config.ts` with Security Headers
```typescript
// Source: https://nextjs.org/docs/app/guides/progressive-web-apps
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

### Layout with PWA Meta Tags
```typescript
// Source: https://nextjs.org/docs/app/guides/progressive-web-apps
// File: src/app/layout.tsx
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  themeColor: '#030712',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Cantomando Blueprint LMS",
  description: "Interactive language learning platform",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Cantomando',
  },
};
```

### Triggering Install After First Lesson Completion
```typescript
// Integration point: where lesson completion is detected
// The useProgress hook already returns `lessonComplete` boolean
// File: src/components/pwa/InstallPrompt.tsx
'use client';

import { useEffect, useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export function InstallPrompt() {
  const { canPrompt, isInstalled, isIOS, triggerInstall } = usePWAInstall();
  const [showPrompt, setShowPrompt] = useState(false);

  // Listen for lesson completion event
  useEffect(() => {
    const handler = () => setShowPrompt(true);
    window.addEventListener('lesson-first-complete', handler);
    return () => window.removeEventListener('lesson-first-complete', handler);
  }, []);

  if (isInstalled || !showPrompt) return null;

  if (isIOS) {
    return (
      <div className="...">
        <p>Install Cantomando for quick access!</p>
        <p>Tap Share, then "Add to Home Screen"</p>
      </div>
    );
  }

  if (!canPrompt) return null;

  return (
    <button onClick={triggerInstall}>
      Install Cantomando App
    </button>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `next-pwa` (Workbox wrapper) | Serwist (`@serwist/next`) or manual SW | 2024 (next-pwa deprecated) | next-pwa is unmaintained; Serwist is the community successor |
| Static `manifest.json` in `public/` | `app/manifest.ts` TypeScript function | Next.js 13+ (App Router) | Type-safe, dynamic manifest values, auto-linked |
| Webpack-only builds | Turbopack default in Next.js 16 | 2025 (Next.js 15.3+) | Serwist requires `--webpack` flag; manual SW works with both |
| No iOS PWA install support | iOS 16.4+ supports PWA install from Safari + other browsers | 2023 | PWAs installable from Safari Share menu on modern iOS |

**Deprecated/outdated:**
- `next-pwa`: Deprecated, unmaintained. Serwist is the successor.
- `manifest.json` in `public/`: Still works but `app/manifest.ts` is the Next.js standard.
- `workbox-webpack-plugin` directly: Use Serwist instead if you need Workbox-style caching.

## Open Questions

1. **PWA Icons**
   - What we know: Need at least 192x192 and 512x512 PNG icons. Apple Touch Icon should be 180x180.
   - What's unclear: The project currently only has SVG placeholder icons (globe.svg, file.svg, etc.). Real app icons need to be designed.
   - Recommendation: Use a placeholder icon generated from the app name during implementation; replace with final branding icons later.

2. **Push Notifications Scope**
   - What we know: Phase 20 requirements (PWA-01 through PWA-05) do NOT mention push notifications. The existing notification system (Phase 11) uses in-app notifications.
   - What's unclear: Whether push notifications should be added as part of PWA or deferred.
   - Recommendation: Out of scope for Phase 20. The service worker should handle push events only if/when needed later. Focus on installability and caching.

3. **Serwist vs Manual SW Long-Term**
   - What we know: Manual SW is simpler for current requirements. Serwist adds power for offline support.
   - What's unclear: Whether offline support will be needed in the future.
   - Recommendation: Start with manual SW. The architecture allows easy migration to Serwist later by replacing `public/sw.js` with a compiled `app/sw.ts`.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/nextjs` — PWA manifest, service worker registration, security headers
- Context7 `/websites/serwist_pages_dev` — Serwist setup, defaultCache, NetworkFirst strategy, Next.js integration
- [Next.js Official PWA Guide](https://nextjs.org/docs/app/guides/progressive-web-apps) — Complete manifest + SW + push notification patterns

### Secondary (MEDIUM confidence)
- [MDN `beforeinstallprompt` event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event) — Event API, browser support
- [web.dev Installation Prompt](https://web.dev/learn/pwa/installation-prompt) — Deferred prompt pattern
- [Serwist Getting Started](https://serwist.pages.dev/docs/next/getting-started) — Installation, config, SW template
- [Serwist NetworkFirst Docs](https://serwist.pages.dev/docs/serwist/runtime-caching/caching-strategies/network-first) — Runtime caching strategy
- [npmjs.com @serwist/next](https://www.npmjs.com/package/@serwist/next) — Version 9.5.0 confirmed
- [iOS PWA Limitations](https://firt.dev/notes/pwa-ios/) — iOS-specific constraints and workarounds

### Tertiary (LOW confidence)
- [LogRocket: Next.js 16 PWA](https://blog.logrocket.com/nextjs-16-pwa-offline-support) — Community tutorial, Turbopack note
- [GitHub serwist/serwist #54](https://github.com/serwist/serwist/issues/54) — Turbopack support status

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Next.js built-in manifest confirmed via Context7 + official docs; manual SW approach is the official Next.js recommendation
- Architecture: HIGH — Patterns verified against official Next.js PWA guide and MDN service worker docs
- Pitfalls: HIGH — Clerk/auth caching, iOS limitations, and Mux video interference are well-documented concerns; stale content prevention verified against Serwist caching strategy docs

**Research date:** 2026-01-30
**Valid until:** 2026-03-30 (stable domain, slow-moving PWA standards)
