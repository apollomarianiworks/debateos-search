import type { CacheEntry, CacheLookupResult, QueryIntent } from "./types";

const STORAGE_KEY = "debateos:cache-v1";
const MAX_ENTRIES = 50;

interface CacheBlob {
  version: 1;
  entries: Record<string, CacheEntry>;
}

function readBlob(): CacheBlob {
  if (typeof localStorage === "undefined") {
    return { version: 1, entries: {} };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, entries: {} };
    const parsed = JSON.parse(raw) as CacheBlob;
    if (parsed.version !== 1 || typeof parsed.entries !== "object") {
      return { version: 1, entries: {} };
    }
    return parsed;
  } catch {
    return { version: 1, entries: {} };
  }
}

function writeBlob(blob: CacheBlob): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  } catch {
    // localStorage quota exceeded or unavailable — silently drop. Cache is best-effort.
  }
}

/**
 * Compute TTL (ms) based on query intent.
 * News / breaking queries get short TTLs; historical queries get long ones.
 */
export function computeTtl(intent: QueryIntent): number {
  if (intent.isCurrent || intent.needsFreshness >= 0.85) {
    return 15 * 60 * 1000;        // 15 min
  }
  if (intent.isStats || intent.needsFreshness >= 0.6) {
    return 60 * 60 * 1000;        // 1 hour
  }
  if (intent.isHistorical || intent.needsFreshness <= 0.3) {
    return 6 * 60 * 60 * 1000;    // 6 hours
  }
  return 30 * 60 * 1000;          // 30 min default
}

export function cacheKey(provider: string, normalizedQuery: string, safeSearch: boolean): string {
  return `${provider}::${normalizedQuery}::${safeSearch ? "s" : "u"}`;
}

export function lookup(key: string): CacheLookupResult {
  const blob = readBlob();
  const entry = blob.entries[key];
  if (!entry) {
    return { entry: null, status: "miss", ageMs: 0 };
  }

  const ageMs = Date.now() - entry.timestamp;
  if (ageMs >= entry.ttl) {
    return { entry, status: "expired", ageMs };
  }
  if (ageMs >= entry.ttl / 2) {
    return { entry, status: "stale", ageMs };
  }
  return { entry, status: "fresh", ageMs };
}

export function store(entry: CacheEntry): void {
  const blob = readBlob();
  blob.entries[entry.key] = entry;

  // LRU eviction
  const keys = Object.keys(blob.entries);
  if (keys.length > MAX_ENTRIES) {
    keys
      .map((k) => ({ k, ts: blob.entries[k].timestamp }))
      .sort((a, b) => a.ts - b.ts)
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach(({ k }) => delete blob.entries[k]);
  }

  writeBlob(blob);
}

export function clearAll(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Format relative age for the UI (e.g. "Cached 2 min ago").
 */
export function ageLabel(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
