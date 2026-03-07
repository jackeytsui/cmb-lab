// Cantomando Blueprint LMS - Service Worker
// Smart caching: network-only for dynamic, cache-first for static, network-first for HTML

const CACHE_NAME = "cantomando-v1";

const PRECACHE_URLS = ["/icon-192x192.png", "/icon-512x512.png"];

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

  // Only handle same-origin requests — never intercept cross-origin
  // (Mux video from stream.mux.com, Clerk from clerk.*.com, etc.)
  if (url.origin !== self.location.origin) {
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
  if (
    destination === "style" ||
    destination === "script" ||
    destination === "image" ||
    destination === "font"
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

  // Strategy 3: Network-first for HTML navigations and other requests
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful HTML responses for offline fallback
        if (response && response.status === 200 && request.mode === "navigate") {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed — try cache as fallback
        return caches.match(request);
      })
  );
});
