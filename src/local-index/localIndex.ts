import type { IndexedDocument, LocalIndexStorage, LocalIndexStats } from "./types";

const STORAGE_KEY = "debateos:local-index-v1";
const SEARCH_CACHE_KEY = "debateos:cache-v1";

/**
 * The local-index module deliberately does NOT import from `@/search-engine`
 * to avoid a circular dep (search-engine depends on provider types). Instead,
 * we directly drop the search cache via its known localStorage key when the
 * index changes — keeping the contract narrow and the layering clean.
 */
function invalidateSearchCache(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(SEARCH_CACHE_KEY);
  } catch {
    // best-effort
  }
}
const MAX_SEARCH_TEXT_LEN = 4000;
const MAX_SNIPPET_LEN = 400;
const MAX_DOCUMENTS = 500;

/**
 * Storage layer for the local-index documents.
 *
 * Uses localStorage for Pass 3; the API surface is intentionally narrow so we
 * can migrate to SQLite (or another persistent store) in a future pass without
 * touching call sites.
 */

function readStorage(): LocalIndexStorage {
  if (typeof localStorage === "undefined") {
    return { version: 1, documents: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, documents: [] };
    const parsed = JSON.parse(raw) as LocalIndexStorage;
    if (parsed.version !== 1 || !Array.isArray(parsed.documents)) {
      return { version: 1, documents: [] };
    }
    return parsed;
  } catch {
    // Corrupted index — don't crash the app; treat as empty.
    return { version: 1, documents: [] };
  }
}

function writeStorage(state: LocalIndexStorage): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded — drop oldest docs and retry once
    try {
      const trimmed: LocalIndexStorage = {
        version: 1,
        documents: state.documents
          .slice()
          .sort((a, b) => b.indexedAt - a.indexedAt)
          .slice(0, Math.max(50, Math.floor(state.documents.length / 2))),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // give up silently — index is best-effort
    }
  }
}

function clampText(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/** Insert or update a document (keyed by URL). */
export function upsertDocument(input: Omit<IndexedDocument, "id" | "indexedAt"> & { indexedAt?: number }): IndexedDocument {
  const state = readStorage();
  const id = `doc-${hashUrl(input.url)}`;
  const doc: IndexedDocument = {
    id,
    url: input.url,
    canonicalUrl: input.canonicalUrl,
    domain: input.domain,
    title: input.title,
    snippet: clampText(input.snippet, MAX_SNIPPET_LEN),
    searchText: clampText(input.searchText, MAX_SEARCH_TEXT_LEN),
    sourceType: input.sourceType,
    credibilityTier: input.credibilityTier,
    sourceRegistryId: input.sourceRegistryId,
    indexedAt: input.indexedAt ?? Date.now(),
    publishedDate: input.publishedDate,
    tags: input.tags ?? [],
  };

  const existingIdx = state.documents.findIndex((d) => d.id === id);
  if (existingIdx >= 0) {
    state.documents[existingIdx] = doc;
  } else {
    state.documents.push(doc);
  }

  // LRU eviction when exceeding max
  if (state.documents.length > MAX_DOCUMENTS) {
    state.documents.sort((a, b) => b.indexedAt - a.indexedAt);
    state.documents = state.documents.slice(0, MAX_DOCUMENTS);
  }

  writeStorage(state);
  return doc;
}

export function listDocuments(): IndexedDocument[] {
  return readStorage().documents;
}

export function getDocument(id: string): IndexedDocument | undefined {
  return readStorage().documents.find((d) => d.id === id);
}

export function removeDocument(id: string): boolean {
  const state = readStorage();
  const before = state.documents.length;
  state.documents = state.documents.filter((d) => d.id !== id);
  if (state.documents.length === before) return false;
  writeStorage(state);
  invalidateSearchCache();
  return true;
}

export function removeDocumentsBySource(sourceRegistryId: string): number {
  const state = readStorage();
  const before = state.documents.length;
  state.documents = state.documents.filter((d) => d.sourceRegistryId !== sourceRegistryId);
  const removed = before - state.documents.length;
  if (removed > 0) {
    writeStorage(state);
    invalidateSearchCache();
  }
  return removed;
}

export function clearAll(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  invalidateSearchCache();
}

export function getStats(): LocalIndexStats {
  const docs = readStorage().documents;
  const domains = new Set(docs.map((d) => d.domain));
  const totalBytes = docs.reduce((n, d) => n + d.searchText.length + d.snippet.length + d.title.length, 0);
  const lastIndexedAt = docs.reduce<number | undefined>((acc, d) => {
    if (!acc || d.indexedAt > acc) return d.indexedAt;
    return acc;
  }, undefined);
  return { documentCount: docs.length, domainCount: domains.size, totalBytes, lastIndexedAt };
}

export function hasDocuments(): boolean {
  return readStorage().documents.length > 0;
}

function hashUrl(url: string): string {
  // FNV-1a 32-bit hash (deterministic, no crypto needed)
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
