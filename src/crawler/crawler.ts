import type { CrawlOutcome } from "./types";
import { CrawlError } from "./types";
import { invokeFetchUrl } from "./crawlerTransport";
import { extractPage } from "./extractPage";
import { checkRobots } from "./robots";

interface CrawlOptions {
  /** If true, respect robots.txt; otherwise skip the check. Default true. */
  respectRobots?: boolean;
  /** Per-request delay used when batching. Caller is responsible for pacing in batches. */
  minIntervalMs?: number;
}

const DEFAULT_RESPECT_ROBOTS = true;

/**
 * Fetch + extract a single URL through the Tauri-side HTTP transport.
 * Throws CrawlError on any failure; caller is expected to surface the message.
 */
export async function crawlOne(url: string, options: CrawlOptions = {}): Promise<CrawlOutcome> {
  const respectRobots = options.respectRobots ?? DEFAULT_RESPECT_ROBOTS;

  if (respectRobots) {
    const robotsCheck = await checkRobots(url);
    if (!robotsCheck.allowed) {
      throw new CrawlError("robots_blocked", robotsCheck.reason ?? "Blocked by robots.txt");
    }
  }

  const response = await invokeFetchUrl(url);

  if (response.status >= 400) {
    throw new CrawlError("http_error", `Server responded ${response.status}`);
  }

  const ct = response.content_type.toLowerCase();
  if (ct && !ct.includes("html") && !ct.includes("xml")) {
    throw new CrawlError("non_html", `Content type "${response.content_type}" is not HTML`);
  }

  const page = extractPage(response.body, response.final_url);

  return {
    url,
    finalUrl: response.final_url,
    page,
    fetchedAt: Date.now(),
    truncated: response.truncated,
  };
}

/**
 * Crawl a small batch with rate limiting. One request at a time, sequential.
 * Errors per-URL are returned alongside successes so the UI can summarize.
 */
export async function crawlBatch(
  urls: string[],
  options: CrawlOptions = {}
): Promise<Array<{ url: string; ok: true; outcome: CrawlOutcome } | { url: string; ok: false; error: string }>> {
  const interval = Math.max(0, options.minIntervalMs ?? 1500);
  const results: Array<{ url: string; ok: true; outcome: CrawlOutcome } | { url: string; ok: false; error: string }> = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (i > 0 && interval > 0) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    try {
      const outcome = await crawlOne(url, options);
      results.push({ url, ok: true, outcome });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown crawl error";
      results.push({ url, ok: false, error: msg });
    }
  }

  return results;
}
