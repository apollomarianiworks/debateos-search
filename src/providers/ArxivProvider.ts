import type {
  SearchProvider,
  SearchOptions,
  SearchResponse,
  WebResult,
  SearchVertical,
} from "./types";
import { ProviderError } from "./providerErrors";

const ENDPOINT = "https://export.arxiv.org/api/query";
const PROVIDER_LABEL = "arXiv";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

async function platformFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (isTauri()) {
    const mod = await import("@tauri-apps/plugin-http");
    return mod.fetch(url, init);
  }
  return fetch(url, init);
}

/**
 * arXiv preprint server provider. Free, no key. Returns Atom XML.
 * Parsed with DOMParser to keep dependency surface zero.
 */
export class ArxivProvider implements SearchProvider {
  readonly name = PROVIDER_LABEL;
  readonly id = "arxiv";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "academic"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const params = new URLSearchParams({
      search_query: `all:${options.query}`,
      max_results: String(Math.max(1, Math.min(15, options.pageSize ?? 6))),
      sortBy: "relevance",
      sortOrder: "descending",
    });

    let xml: string;
    try {
      const resp = await platformFetch(`${ENDPOINT}?${params}`, { method: "GET" });
      if (!resp.ok) {
        throw new ProviderError("server", PROVIDER_LABEL, `HTTP ${resp.status}`);
      }
      xml = await resp.text();
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const detail = err instanceof Error ? err.message : String(err);
      throw new ProviderError("network", PROVIDER_LABEL, detail);
    }

    const results = parseArxivAtom(xml);
    return {
      results,
      totalEstimated: results.length,
      query: options.query,
      provider: PROVIDER_LABEL,
      durationMs: Date.now() - start,
    };
  }
}

function parseArxivAtom(xml: string): WebResult[] {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const entries = Array.from(doc.getElementsByTagName("entry"));
  return entries.map((entry, idx): WebResult => {
    const title = entry.getElementsByTagName("title")[0]?.textContent?.trim() ?? "(untitled)";
    const summary = entry.getElementsByTagName("summary")[0]?.textContent?.trim() ?? "";
    const link = Array.from(entry.getElementsByTagName("link")).find(
      (l) => l.getAttribute("rel") === "alternate"
    )?.getAttribute("href") ?? "";
    const published = entry.getElementsByTagName("published")[0]?.textContent ?? undefined;

    return {
      id: `arxiv-${idx}-${Date.now()}`,
      resultType: "web",
      title: title.replace(/\s+/g, " "),
      url: link,
      displayUrl: link.replace(/^https?:\/\//, ""),
      snippet: summary.replace(/\s+/g, " ").slice(0, 360),
      domain: "arxiv.org",
      sourceType: "academic",
      publishedDate: published,
    };
  });
}
