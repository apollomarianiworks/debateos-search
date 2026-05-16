import type {
  SearchProvider,
  SearchOptions,
  SearchResponse,
  SearchResult,
  PersonResult,
  WebResult,
  ImageResult,
  SearchVertical,
} from "./types";
import { ProviderError } from "./providerErrors";

const PROVIDER_LABEL = "Wikipedia";
const WIKI_ORIGIN = "https://en.wikipedia.org";

/**
 * Wikipedia search provider — free, no API key. Uses MediaWiki's Action API
 * with `origin=*` so it works from both Tauri webview and browser dev.
 *
 * Returns a small handful of results per query. For "people" / "definition"
 * intents the top result is upgraded to a PersonResult (with thumbnail).
 */

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

interface WikiSearchHit {
  ns: number;
  title: string;
  pageid: number;
  size?: number;
  snippet?: string;
  timestamp?: string;
}

interface WikiSearchResponse {
  query?: { search?: WikiSearchHit[] };
}

interface WikiSummaryResponse {
  title?: string;
  description?: string;
  extract?: string;
  thumbnail?: { source?: string; width?: number; height?: number };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
  type?: string;
}

function stripWikiSnippet(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/<\/?span[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikePersonDescription(desc: string): boolean {
  // Wikipedia descriptions for people typically begin with nationality + occupation,
  // e.g. "American physicist", "British politician (born 1948)".
  return /^(?:[A-Z][a-z]+(?:-[A-Z][a-z]+)?\s+)?(?:[a-z-]+\s+)?(?:physicist|chemist|biologist|mathematician|economist|politician|president|prime minister|senator|representative|governor|judge|justice|writer|author|novelist|poet|playwright|journalist|actor|actress|director|producer|musician|singer|composer|painter|sculptor|architect|philosopher|theologian|historian|sociologist|psychologist|engineer|scientist|inventor|entrepreneur|businessperson|businessman|businesswoman|ceo|founder|activist|reformer|revolutionary|general|admiral|monarch|king|queen|emperor|empress|athlete|player|coach|footballer)/i
    .test(desc);
}

interface ConstructorOpts {
  /** If true, prefer image-shaped results (thumbnail-first). */
  imagesOnly?: boolean;
  /** If true, the caller wants a person-style top result. */
  personHint?: boolean;
}

export class WikipediaProvider implements SearchProvider {
  readonly name = PROVIDER_LABEL;
  readonly id = "wikipedia";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = [
    "all", "web", "people", "academic", "images",
  ];

  private readonly imagesOnly: boolean;
  private readonly personHint: boolean;

  constructor(opts: ConstructorOpts = {}) {
    this.imagesOnly = Boolean(opts.imagesOnly);
    this.personHint = Boolean(opts.personHint);
  }

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const limit = Math.max(1, Math.min(8, options.pageSize ?? 6));

    // Step 1: full-text search for top hits
    const searchUrl = new URL(`${WIKI_ORIGIN}/w/api.php`);
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srsearch", options.query);
    searchUrl.searchParams.set("srlimit", String(limit));
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");

    let searchData: WikiSearchResponse;
    try {
      const resp = await platformFetch(searchUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) {
        throw new ProviderError(
          "server",
          PROVIDER_LABEL,
          `HTTP ${resp.status} ${resp.statusText}`
        );
      }
      searchData = (await resp.json()) as WikiSearchResponse;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const detail = err instanceof Error ? err.message : String(err);
      throw new ProviderError("network", PROVIDER_LABEL, detail);
    }

    const hits = searchData.query?.search ?? [];
    if (hits.length === 0) {
      return {
        results: [],
        totalEstimated: 0,
        query: options.query,
        provider: PROVIDER_LABEL,
        durationMs: Date.now() - start,
      };
    }

    // Step 2: fetch summary for the top hit (gives us description + thumbnail)
    const topSummary = await this.fetchSummary(hits[0].title).catch(() => null);

    const results: SearchResult[] = [];

    // Top result — upgrade to PersonResult or ImageResult when appropriate
    const top = hits[0];
    const topPageUrl = `${WIKI_ORIGIN}/wiki/${encodeURIComponent(top.title.replace(/ /g, "_"))}`;
    const topSnippet = topSummary?.extract
      ? topSummary.extract.slice(0, 320)
      : stripWikiSnippet(top.snippet) || topSummary?.description || top.title;

    const description = topSummary?.description ?? "";
    const isPerson = this.personHint || looksLikePersonDescription(description);

    if (this.imagesOnly && topSummary?.thumbnail?.source) {
      const img: ImageResult = {
        id: `wiki-img-${top.pageid}`,
        resultType: "image",
        title: topSummary.title ?? top.title,
        url: topPageUrl,
        displayUrl: `en.wikipedia.org/wiki/${top.title}`,
        snippet: topSnippet,
        domain: "en.wikipedia.org",
        sourceType: "general",
        imageUrl: topSummary.originalimage?.source ?? topSummary.thumbnail.source,
        thumbnailUrl: topSummary.thumbnail.source,
        width: topSummary.thumbnail.width,
        height: topSummary.thumbnail.height,
        pageUrl: topPageUrl,
      };
      results.push(img);
    } else if (isPerson && topSummary) {
      const person: PersonResult = {
        id: `wiki-person-${top.pageid}`,
        resultType: "person",
        title: topSummary.title ?? top.title,
        url: topPageUrl,
        displayUrl: `en.wikipedia.org/wiki/${top.title}`,
        snippet: topSnippet,
        domain: "en.wikipedia.org",
        sourceType: "general",
        imageUrl: topSummary.thumbnail?.source,
        occupation: description || undefined,
      };
      results.push(person);
    } else {
      const web: WebResult = {
        id: `wiki-${top.pageid}`,
        resultType: "web",
        title: topSummary?.title ?? top.title,
        url: topPageUrl,
        displayUrl: `en.wikipedia.org/wiki/${top.title}`,
        snippet: topSnippet,
        domain: "en.wikipedia.org",
        sourceType: "general",
      };
      results.push(web);
    }

    // Remaining hits as plain web results
    for (let i = 1; i < hits.length; i++) {
      const h = hits[i];
      const pageUrl = `${WIKI_ORIGIN}/wiki/${encodeURIComponent(h.title.replace(/ /g, "_"))}`;
      results.push({
        id: `wiki-${h.pageid}`,
        resultType: "web",
        title: h.title,
        url: pageUrl,
        displayUrl: `en.wikipedia.org/wiki/${h.title}`,
        snippet: stripWikiSnippet(h.snippet) || h.title,
        domain: "en.wikipedia.org",
        sourceType: "general",
      });
    }

    return {
      results,
      totalEstimated: results.length,
      query: options.query,
      provider: PROVIDER_LABEL,
      durationMs: Date.now() - start,
    };
  }

  private async fetchSummary(title: string): Promise<WikiSummaryResponse | null> {
    const url = `${WIKI_ORIGIN}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=true`;
    try {
      const resp = await platformFetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) return null;
      return (await resp.json()) as WikiSummaryResponse;
    } catch {
      return null;
    }
  }
}
