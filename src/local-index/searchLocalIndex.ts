import type { SearchResult } from "@/providers/types";
import type { IndexedDocument } from "./types";
import { listDocuments } from "./localIndex";
import { tokenize } from "./tokenizer";

interface ScoredDoc {
  doc: IndexedDocument;
  hits: number;
  titleHits: number;
}

/**
 * Search the local index for documents matching the query.
 *
 * Uses a simple in-memory scan with token-frequency scoring. With ≤500 docs
 * × short query tokens this is well under a millisecond. When we migrate to
 * SQLite/FTS later, this function becomes a thin wrapper.
 */
export function searchLocalIndex(query: string, limit = 25): SearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const docs = listDocuments();
  if (docs.length === 0) return [];

  const scored: ScoredDoc[] = [];

  for (const doc of docs) {
    const titleLower = doc.title.toLowerCase();
    const textLower = doc.searchText.toLowerCase();

    let hits = 0;
    let titleHits = 0;
    for (const t of tokens) {
      if (titleLower.includes(t)) {
        titleHits++;
        hits++;
      } else if (textLower.includes(t)) {
        hits++;
      }
    }

    if (hits > 0) {
      scored.push({ doc, hits, titleHits });
    }
  }

  // Primary sort: hit count (favoring title matches), then most-recently-indexed.
  scored.sort((a, b) => {
    const aScore = a.hits + a.titleHits * 2;
    const bScore = b.hits + b.titleHits * 2;
    if (bScore !== aScore) return bScore - aScore;
    return b.doc.indexedAt - a.doc.indexedAt;
  });

  return scored.slice(0, limit).map(({ doc }) => docToSearchResult(doc));
}

function docToSearchResult(doc: IndexedDocument): SearchResult {
  return {
    id: doc.id,
    resultType: "web",
    title: doc.title,
    url: doc.canonicalUrl ?? doc.url,
    displayUrl: doc.url,
    snippet: doc.snippet,
    domain: doc.domain,
    sourceType: doc.sourceType,
    publishedDate: doc.publishedDate,
    fetchedDate: new Date(doc.indexedAt).toISOString(),
  };
}
