import type { Source } from "./types";
import { markIndexed } from "./sourceRegistry";
import { crawlOne, CrawlError } from "@/crawler";
import { upsertDocument } from "@/local-index";
import { cacheClearAll } from "@/search-engine";

export interface IndexSourceResult {
  ok: boolean;
  message: string;
  docId?: string;
}

/**
 * Crawl + extract + index a single registered source.
 * Updates the source's `lastIndexedAt` / `lastError` regardless of outcome.
 * Invalidates the search cache on success so newly indexed content shows up
 * in subsequent searches without waiting for TTL.
 */
export async function indexSource(source: Source): Promise<IndexSourceResult> {
  try {
    const outcome = await crawlOne(source.url, { respectRobots: true });
    const doc = upsertDocument({
      url: outcome.finalUrl,
      canonicalUrl: outcome.page.canonicalUrl,
      domain: source.domain,
      title: outcome.page.title,
      snippet: outcome.page.snippet,
      searchText: outcome.page.bodyText,
      sourceType: source.sourceType,
      credibilityTier: source.credibilityTier,
      sourceRegistryId: source.id,
      publishedDate: outcome.page.publishedDate,
      tags: source.tags,
    });

    markIndexed(source.id, Date.now());
    // The local index changed — cached search results may now be stale.
    cacheClearAll();
    return {
      ok: true,
      message: `Indexed “${doc.title.slice(0, 60)}”`,
      docId: doc.id,
    };
  } catch (err) {
    const message = err instanceof CrawlError
      ? err.message
      : err instanceof Error
        ? err.message
        : "Unknown error";
    markIndexed(source.id, Date.now(), message);
    return { ok: false, message };
  }
}
