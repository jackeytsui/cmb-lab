# CMB Lab Mobile App Roadmap (iOS + Android)

> Status: Phase 1 scaffolded in `mobile/` (Expo SDK 57, React Native). Goal: on testers'
> phones within one week of accounts being ready. Last updated: 2026-07-26.

## Strategy

The web app is mature (v10.0, PWA-ready, mobile-responsive). The fastest credible path to a
native app on both platforms is a **hybrid rollout**:

- **Phase 1 — Native shell (this week):** an Expo app that wraps the deployed web app with
  native niceties (persistent login, mic/camera permission handling, Android back button,
  splash screen, offline screen). 100% feature reuse, testable in days.
- **Phase 2 — Native value-adds (next 4–8 weeks):** push notifications (streak/coach-feedback
  reminders — the single biggest retention win a native app buys), app icon badge, biometric
  unlock, deep links.
- **Phase 3 — Native screens where the web feels non-native:** SRS flashcard review with
  offline deck sync, native video player, home-screen widgets (streak ring). Driven by
  Phase 1 tester feedback — don't rebuild screens nobody complains about.

Both phases ship from the same codebase via EAS Update (over-the-air JS updates without store
review).

## 💳 What you need to pay (Sheldon — only you can do these)

| Item | Cost | When | Notes |
|---|---|---|---|
| **Apple Developer Program** | **US$99/year** | **Enroll Monday morning** | Required for TestFlight + App Store. Individual enrollment approves in ~24–48h; **Organization** enrollment needs a D-U-N-S number and can take 1–2 weeks. For next-week testing, enroll as Individual now (can migrate to Org later) or as Org only if the business already has D-U-N-S. |
| **Google Play Console** | **US$25 one-time** | **Sign up Monday morning** | Identity verification can take a few days. ⚠️ **Personal** accounts must run a closed test with 12 testers for 14 days before they're allowed a production launch; **Organization** accounts (D-U-N-S required) are exempt. This does NOT block next week's testing (internal testing works immediately) — it only affects the public launch date, so choose Organization if you can. |
| Expo EAS (build service) | $0 to start | — | Free tier includes a monthly build quota with queue waits; the paid plan (~$19/mo starter) buys priority queues and more builds. Not needed for week one. Verify current limits at expo.dev/pricing. |

**Total to get testing next week: $124** ($99 Apple + $25 Google). No other new spend.

## 📦 What you need to subscribe to / sign up for (free)

- **Expo account** (expo.dev) — free; needed for EAS builds and OTA updates. Create one team
  account (e.g. dev@thecmblueprint.com) rather than a personal one.
- **Nothing changes for existing services** — Clerk, Neon, Mux, Upstash, Azure Speech, n8n,
  Vercel all serve the mobile shell exactly as they serve the web. No new tiers required.
- Phase 2 push notifications are also free (Expo Push + FCM + APNs, all included).

## 🚀 What we can start running and testing NOW

1. **Today, zero accounts:** `cd mobile && npm install && cp .env.example .env` (set the
   production URL) `&& npx expo start` — scan the QR with the free **Expo Go** app and the
   whole product runs on your phone in the native shell. Anyone on the team can do this today.
2. **Android testers, day 1–2:** `eas build --profile preview --platform android` produces a
   shareable **APK link** — testers install directly, no Play Store, no review, no $25 account
   needed yet. This is the fastest real-device distribution that exists.
3. **iOS testers, as soon as Apple enrollment clears:** build + `eas submit`, then TestFlight
   **internal testers** (up to 100) get it minutes after processing — no Apple review for
   internal testing.

## Week plan (target: testers on both platforms by Friday)

| Day | Who | Action |
|---|---|---|
| Mon AM | Sheldon | Enroll Apple Developer ($99) + Google Play Console ($25) + create Expo account. Send Claude the production domain to bake into config. |
| Mon | Team | Expo Go smoke test on real phones (login, video lesson, audio exercise, Reader). |
| Mon–Tue | Claude/dev | `eas init`, set `EXPO_PUBLIC_APP_URL`, kick off Android preview build → **share APK link with testers**. |
| Tue–Thu | Claude/dev | When Apple clears: iOS build + TestFlight submit; add internal testers by email. |
| Thu–Fri | Testers | Structured pass: login persistence, Mux playback, audio recording exercises, pronunciation scoring, SRS review, celebrations/confetti, external links. |
| Fri | All | Triage feedback → becomes the Phase 2/3 backlog. |

## What Claude can do vs. what only you can do

**Claude (already done ✅ / can do on request):**
- ✅ Scaffolded `mobile/` — WebView shell with Clerk cookie persistence, inline Mux playback,
  mic/camera grants, Android back handling, offline + error screens, external-link handoff.
- ✅ EAS build profiles (`development` / `preview` APK / `production`).
- On request: wire push notifications (Expo Push + a `device_tokens` table + notification
  triggers off existing streak/coach-feedback events), deep links, staging vs prod env split,
  store listing copy, privacy-policy page (both stores require a privacy policy URL —
  App Privacy questionnaire for Apple, Data Safety form for Google), native SRS screen.
- CI: add a GitHub Action to kick EAS builds on tag push.

**Only you (account owner):**
- Pay + enroll Apple Developer and Google Play Console (identity verification is personal).
- Create the Expo account; add payment method if we outgrow free builds.
- Provide final app icon / splash art (1024×1024; placeholder assets are in `mobile/assets/`).
- Approve app name ("CMB Lab") and bundle ID (`com.thecmblueprint.cmblab`) — the bundle ID is
  permanent after the first store upload, so confirm before submitting.
- Add testers' emails in TestFlight / choose Android tester list.

## Store-launch caveats (after testing, for the public release)

- **Apple review** for public App Store release typically takes 1–3 days; pure-WebView apps
  can get flagged under guideline 4.2 (minimum functionality). Phase 2 (push notifications,
  native navigation touches) is the standard and sufficient mitigation — plan to ship the
  public iOS release with Phase 2 included, not the bare shell.
- **Google 12-tester/14-day rule** (personal accounts only) — see table above; start the
  closed test clock early if stuck on a personal account.
- Both stores require: privacy policy URL, data-collection disclosures, screenshots
  (6.7" + 5.5" iPhone, tablet optional; phone + 7"/10" tablet for Play), and an
  account-deletion path (Apple requires in-app account deletion for apps with accounts —
  worth adding a settings entry that hits a deletion request endpoint).

## Out of scope for now (deliberately)

- In-app purchases — enrollment stays webhook-driven from external sales, so no 15–30% store
  cut applies. **Do not link to external checkout from inside the iOS app** without checking
  current App Store rules; safest is to keep purchase flows out of the app entirely.
- Full offline video — Mux DRM/offline is a large project; revisit after Phase 3.
- Handwriting/OCR input — matches existing web scope decision.
