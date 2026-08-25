// Cantomando Blueprint LMS - Service Worker
// Smart caching: network-only for dynamic, cache-first for static, network-first for HTML

const CACHE_NAME = "cantomando-v4";

const PRECACHE_URLS = ["/icon-192x192.png", "/icon-512x512.png"];
const NAVIGATION_RETRY_DELAYS_MS = [250, 750];

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function fetchNavigationWithRetry(request) {
  for (let attempt = 0; attempt <= NAVIGATION_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await wait(NAVIGATION_RETRY_DELAYS_MS[attempt - 1]);
    }

    try {
      return await fetch(request);
    } catch {
      // A deployment handoff, Wi-Fi transition, or brief upstream reset can
      // reject one navigation even while the user's connection is healthy.
      // Retry only network failures; real HTTP responses are returned as-is.
    }
  }

  return offlineNavigationResponse();
}

function offlineNavigationResponse() {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CMB Lab is temporarily unreachable</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #09090b; color: #fafafa; }
      main { width: min(32rem, calc(100% - 3rem)); text-align: center; }
      p { color: #a1a1aa; line-height: 1.6; }
      button { margin-top: 1rem; border: 0; border-radius: .5rem; padding: .75rem 1rem; font: inherit; font-weight: 600; cursor: pointer; }
      small { display: block; min-height: 1.5rem; margin-top: .75rem; color: #71717a; }
    </style>
  </head>
  <body>
    <main>
      <h1>CMB Lab is temporarily unreachable</h1>
      <p>Check your internet connection, then try again. Your work has not been deleted.</p>
      <button id="retry" type="button">Try again</button>
      <small id="status" aria-live="polite">We will reconnect automatically.</small>
    </main>
    <script>
      (() => {
        const button = document.getElementById("retry");
        const status = document.getElementById("status");
        let retrying = false;

        async function retry() {
          if (retrying) return;
          retrying = true;
          button.disabled = true;
          status.textContent = "Reconnecting…";

          try {
            const response = await fetch(location.href, {
              cache: "no-store",
              credentials: "same-origin",
            });
            if (response.ok) {
              location.reload();
              return;
            }
          } catch {
            // Stay on the recovery page and try again on the next interval.
          }

          retrying = false;
          button.disabled = false;
          status.textContent = "Still reconnecting. Your work is safe.";
        }

        button.addEventListener("click", retry);
        window.addEventListener("online", retry);
        window.setInterval(retry, 5000);
      })();
    </script>
  </body>
</html>`,
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

// Patterns that must NEVER be cached (always network-only)
const NETWORK_ONLY_PATTERNS = [
  /^\/api\//,
  /^\/sign-in/,
  /^\/sign-up/,
  /^\/dashboard/,
  /^\/courses\//,
  /^\/lessons\//,
];

// Install: precache icon files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: smart caching strategies
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept media or byte-range requests. Re-issuing a partial-content
  // (Range) request through the service worker breaks <video>/<audio> streaming
  // and seeking — the media element hangs on a perpetual loading spinner
  // (notably on Safari/iOS). Let the browser talk to the network directly so
  // native 206/Range handling is preserved. This is what was breaking Course
  // Library video lessons (which stream from /api/course-library/stream/...).
  if (
    request.headers.has("range") ||
    request.destination === "video" ||
    request.destination === "audio" ||
    request.destination === "media"
  ) {
    return;
  }

  // Only handle same-origin requests — never intercept cross-origin
  // (Mux video from stream.mux.com, Clerk from clerk.*.com, etc.)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Authenticated app navigations must always come from the network. Never
  // replay cached HTML from a previous session. If the network fails, always
  // resolve respondWith() with a real Response; returning an empty cache match
  // here causes Chromium/Edge to surface the opaque ERR_FAILED page.
  if (request.mode === "navigate") {
    event.respondWith(fetchNavigationWithRetry(request));
    return;
  }

  // Strategy 1: Network-only for dynamic routes (API, auth, content pages)
  const pathname = url.pathname;
  if (NETWORK_ONLY_PATTERNS.some((pattern) => pattern.test(pathname))) {
    event.respondWith(fetch(request));
    return;
  }

  // Strategy 2: Cache-first for static assets (JS, CSS, images, fonts)
  const destination = request.destination;
  const isImmutableAsset =
    url.pathname.startsWith("/_next/static/") ||
    PRECACHE_URLS.includes(url.pathname);
  if (
    isImmutableAsset &&
    (destination === "style" ||
      destination === "script" ||
      destination === "image" ||
      destination === "font")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => {
          // Only cache successful responses
          if (!response || response.status !== 200) {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        });
      })
    );
    return;
  }
});

// Admin announcements can reach opted-in users even when CMB Lab is not open.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "New CMB Lab announcement";
  const options = {
    body: payload.body || "Open CMB Lab to see the latest update.",
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    tag: payload.tag || "cmb-lab-announcement",
    renotify: true,
    data: { url: payload.url || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data?.url || "/dashboard";
  const targetUrl = new URL(requestedUrl, self.location.origin);
  const safeUrl =
    targetUrl.origin === self.location.origin
      ? targetUrl.href
      : new URL("/dashboard", self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) =>
          client.url.startsWith(self.location.origin),
        );
        if (existing) {
          return existing.focus().then(() => existing.navigate(safeUrl));
        }
        return self.clients.openWindow(safeUrl);
      }),
  );
});
