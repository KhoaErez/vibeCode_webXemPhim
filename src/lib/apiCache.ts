/**
 * In-memory API cache with TTL and in-flight request deduplication
 * Helps eliminate repeated network roundtrips to 3rd-party movie APIs
 */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const pendingRequests = new Map<string, Promise<unknown>>();

// Default TTL: 5 minutes (300,000ms)
const DEFAULT_TTL = 5 * 60 * 1000;

export async function fetchWithCache<T>(url: string, ttl: number = DEFAULT_TTL): Promise<T> {
  const now = Date.now();
  const cached = cache.get(url);

  // Return cached data if still fresh
  if (cached && now - cached.timestamp < cached.ttl) {
    return cached.data as T;
  }

  // Deduplicate in-flight requests for the exact same URL
  const existingPromise = pendingRequests.get(url);
  if (existingPromise) {
    return existingPromise as Promise<T>;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      cache.set(url, {
        data,
        timestamp: Date.now(),
        ttl,
      });

      // Cleanup cache if size exceeds 200 items
      if (cache.size > 200) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
      }

      return data as T;
    } finally {
      pendingRequests.delete(url);
    }
  })();

  pendingRequests.set(url, fetchPromise);
  return fetchPromise;
}

export function clearApiCache() {
  cache.clear();
  pendingRequests.clear();
}
