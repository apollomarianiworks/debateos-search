import { CrawlError } from "./types";
import type { FetchUrlResponse } from "./types";

/**
 * Single chokepoint for all crawler HTTP. Goes through the Rust `fetch_url`
 * command (User-Agent, timeout, redirects, SSRF protection, size cap).
 *
 * In a non-Tauri environment (browser dev), throws a CrawlError immediately —
 * crawling requires the desktop shell.
 */
export async function invokeFetchUrl(url: string): Promise<FetchUrlResponse> {
  if (typeof window === "undefined" || !(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    throw new CrawlError(
      "not_tauri",
      "Crawling requires the desktop app (browser dev cannot bypass CORS)."
    );
  }
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<FetchUrlResponse>("fetch_url", { url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/refusing to crawl|unsupported url|invalid url|unsupported content/i.test(message)) {
      throw new CrawlError("validation", message);
    }
    throw new CrawlError("network", message);
  }
}
