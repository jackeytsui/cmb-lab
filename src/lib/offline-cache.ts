const CACHE_NAME = "cmb-audio-offline-v1";

/**
 * Check if a URL is cached for offline playback.
 */
export async function isOfflineCached(url: string): Promise<boolean> {
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(url);
    return !!match;
  } catch {
    return false;
  }
}

/**
 * Save an audio URL to the browser cache for offline playback.
 * Fetches the full audio file and stores it.
 */
export async function saveForOffline(url: string): Promise<boolean> {
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(url);
    if (!response.ok) return false;
    await cache.put(url, response);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a URL from the offline cache.
 */
export async function removeFromOffline(url: string): Promise<boolean> {
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    return cache.delete(url);
  } catch {
    return false;
  }
}

/**
 * Get all cached audio lesson URLs.
 */
export async function getOfflineCachedUrls(): Promise<string[]> {
  if (!("caches" in window)) return [];
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    return keys.map((r) => r.url);
  } catch {
    return [];
  }
}
