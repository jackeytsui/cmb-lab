---
phase: 20-pwa
plan: 01
title: "PWA Foundation"
status: complete
duration: "4min"
completed: "2026-01-30"
subsystem: pwa
tags: [pwa, manifest, service-worker, caching, icons]
dependency_graph:
  requires: []
  provides: ["web-app-manifest", "service-worker", "pwa-icons", "security-headers"]
  affects: ["20-02"]
tech_stack:
  added: []
  patterns: ["MetadataRoute.Manifest", "service-worker-caching", "cache-first", "network-only", "network-first"]
key_files:
  created:
    - src/app/manifest.ts
    - public/sw.js
    - public/icon-192x192.png
    - public/icon-512x512.png
    - public/apple-touch-icon.png
    - src/components/pwa/ServiceWorkerRegistrar.tsx
  modified:
    - src/app/layout.tsx
    - next.config.ts
decisions:
  - id: PWA-01
    decision: "Three-tier caching strategy: network-only for dynamic, cache-first for static, network-first for HTML"
  - id: PWA-02
    decision: "Cross-origin requests never intercepted (Mux video, Clerk auth pass through)"
  - id: PWA-03
    decision: "SW served with no-cache headers to ensure updates propagate immediately"
metrics:
  tasks: 3
  commits: 3
---

# Phase 20 Plan 01: PWA Foundation Summary

**One-liner:** Web app manifest with MetadataRoute.Manifest, service worker with three-tier smart caching, placeholder icons, and security headers.

## What Was Done

### Task 1: Web App Manifest, Icons, and Layout Meta
- Created `src/app/manifest.ts` using Next.js built-in MetadataRoute.Manifest type
- Generated three placeholder PNG icons (192x192, 512x512, 180x180 apple-touch) with CM branding
- Added `Viewport` export with theme color (#030712) and device-width settings
- Added `appleWebApp` metadata (capable, black-translucent status bar, title)

### Task 2: Service Worker with Smart Caching
- Created `public/sw.js` with three caching strategies:
  - **Network-only:** /api/*, /sign-in, /sign-up, /dashboard, /courses/*, /lessons/* (never cached)
  - **Cache-first:** JS, CSS, images, fonts (cached after first load for performance)
  - **Network-first:** HTML navigations (network preferred, cache fallback for offline)
- Cross-origin requests (Mux video, Clerk auth) are never intercepted
- Install event precaches icon files; activate event cleans old caches
- Updated `next.config.ts` with sw.js no-cache headers and security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)

### Task 3: ServiceWorkerRegistrar Component
- Created `src/components/pwa/ServiceWorkerRegistrar.tsx` as a client component
- Registers /sw.js with scope "/" and updateViaCache "none"
- Renders nothing (returns null) -- pure side-effect component
- Wired into root layout.tsx after ChatWidget

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | c8c88ea | feat(20-01): add PWA manifest, placeholder icons, and layout meta |
| 2 | 8f962bb | feat(20-01): add service worker with smart caching strategies |
| 3 | 1ba380e | feat(20-01): add ServiceWorkerRegistrar and wire into root layout |

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| PWA-01 | Three-tier caching (network-only / cache-first / network-first) | Dynamic content must stay fresh; static assets benefit from caching; HTML needs offline fallback |
| PWA-02 | Cross-origin requests never intercepted | Mux video streaming and Clerk auth must not be affected by SW |
| PWA-03 | SW served with no-cache headers | Ensures browser always checks for updated service worker |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript compilation passes with zero errors
- manifest.ts exports valid MetadataRoute.Manifest with name, icons, standalone display
- sw.js contains install, activate, and fetch event listeners with all three strategies
- All three icon files exist in public/
- layout.tsx has Viewport export, appleWebApp metadata, and ServiceWorkerRegistrar
- next.config.ts has headers for sw.js and security headers
- Note: `npm run build` fails due to pre-existing Clerk publishableKey issue (not related to PWA changes)

## Next Phase Readiness

Plan 20-02 (install prompt and offline page) can proceed. The manifest, service worker, and registration infrastructure are all in place.
