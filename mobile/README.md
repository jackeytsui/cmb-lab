# CMB Lab Mobile (iOS + Android)

Native app shell for the CMB Lab LMS, built with [Expo](https://expo.dev) (React Native, SDK 57).

**Phase 1 strategy (current):** the app is a native shell around the deployed web app — it reuses
100% of the existing product (interactive video, Reader, SRS, practice sets) so it can be on
testers' phones in days, not months. Native screens (push notifications, offline decks, native
video player) come in later phases — see `docs/MOBILE-APP-ROADMAP.md` at the repo root.

## Prerequisites

- Node 20+
- An [Expo account](https://expo.dev/signup) (free) for builds
- **Expo Go** app installed on your phone (App Store / Play Store) for instant dev testing

## Run it today (no accounts, no builds)

```bash
cd mobile
npm install
cp .env.example .env      # set EXPO_PUBLIC_APP_URL to the production domain
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS). The app loads the live web
app inside the native shell with persistent login.

> Note: mic/camera behavior inside Expo Go can differ from a real build. Use a preview build
> (below) to test audio recording exercises properly.

## Distribute test builds (EAS)

One-time setup:

```bash
npm install -g eas-cli
eas login
eas init          # links this project to the Expo account
```

### Android — shareable APK (fastest, no store account needed)

```bash
eas build --profile preview --platform android
```

Produces an `.apk` download link. Send the link to testers; they install it directly
(no Play Store, no review, works immediately).

### iOS — TestFlight (requires Apple Developer Program, $99/yr)

```bash
eas build --profile production --platform ios
eas submit --platform ios
```

Then in App Store Connect → TestFlight, add internal testers (up to 100, available minutes
after processing — no Apple review needed for internal testers).

### Environment per build

`EXPO_PUBLIC_APP_URL` is inlined at build time. For EAS builds set it as an EAS environment
variable (`eas env:create`) or in `eas.json` build profile `env` blocks, so preview builds can
point at staging and production builds at the live domain.

## Project layout

- `App.tsx` — the WebView shell: cookie-persistent Clerk login, inline Mux playback,
  mic/camera permission grants, Android back-button navigation, offline/error screens,
  external links open in the system browser.
- `app.json` — app name, bundle IDs (`com.thecmblueprint.cmblab`), permissions, splash.
- `eas.json` — build profiles: `development`, `preview` (internal/APK), `production` (stores).
- `assets/` — placeholder icons/splash. **Replace with CMB-branded assets before store submission**
  (icon: 1024×1024 PNG, no transparency for iOS).
