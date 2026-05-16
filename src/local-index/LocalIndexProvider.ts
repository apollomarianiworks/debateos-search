import type { SearchProvider, SearchOptions, SearchResponse } from "@/providers/types";
import { searchLocalIndex } from "./searchLocalIndex";
import { hasDocuments } from "./localIndex";

/**
 * Bridges the local document index to the SearchProvider interface so the
 * hybrid search pipeline can consume it alongside web providers.
 */
export class LocalIndexProvider implements SearchProvider {
  readonly name = "Local Index";
  readonly id = "local";
  readonly isConfigured = true;

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();

    // Returning instantly is fine — the search is in-memory. Provider is no-op when empty.
    const results = hasDocuments()
      ? searchLocalIndex(options.query, options.pageSize ?? 25)
      : [];

    return {
      results,
      totalEstimated: results.length,
      query: options.query,
      provider: this.name,
      durationMs: Date.now() - start,
    };
  }
}
