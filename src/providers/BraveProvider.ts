import type {
  SearchOptions,
  SearchProvider,
  SearchResponse,
  SearchResult,
  SourceType,
} from "./types";
import { ProviderError } from "./providerErrors";

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const PROVIDER_LABEL = "Brave Search";

type BraveWebResult = {
  title?: string;
  url?: string;
  description?: string;
  page_age?: string;
  age?: string;
  language?: string;
  meta_url?: { hostname?: string; path?: string };
  profile?: { name?: string };
  subtype?: string;
  thumbnail?: { src?: string };
};

type BraveResponse = {
  web?: { results?: BraveWebResult[]; total_count?: number };
};

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

/**
 * Cross-platform fetch.
 *
 *   - In Tauri: use plugin-http (bypasses webview CORS rules + honors the
 *     scoped permission allow-list in `capabilities/default.json`).
 *   - In browser dev: native fetch (CORS-blocked by Brave; surfaced as an
 *     informative network error so the user understands why).
 *
 * NOTE: We intentionally do NOT try/catch the plugin-http call. If it fails
 * (scope mismatch, plugin not registered, key rejected), we want the real
 * error message to propagate so the user can actually fix the problem.
 */
async function platformFetch(url: string, init: RequestInit): Promise<Response> {
  if (isTauri()) {
    const mod = await import("@tauri-apps/plugin-http");
    return await mod.fetch(url, init);
  }
  return fetch(url, init);
}

function rawDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function guessSourceType(domain: string, subtype?: string): SourceType {
  if (subtype === "news") return "news";
  if (/\.gov(\.[a-z]+)?$|\.mil$/.test(domain)) return "government";
  if (/\.edu$|\.ac\.uk$/.test(domain)) return "academic";
  return "general";
}

export class BraveProvider implements SearchProvider {
  readonly name = PROVIDER_LABEL;
  readonly id = "brave";
  readonly isConfigured: boolean;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey?.trim() ?? "";
    this.isConfigured = this.apiKey.length > 0;
  }

  async search(options: SearchOptions): Promise<SearchResponse> {
    if (!this.isConfigured) {
      throw new ProviderError(
        "missing_api_key",
        PROVIDER_LABEL,
        "Brave API key is missing."
      );
    }

    if (!isTauri()) {
      // Browser dev mode — native fetch will CORS-fail. Surface that clearly
      // instead of pretending it's a generic network blip.
      throw new ProviderError(
        "network",
        PROVIDER_LABEL,
        "Brave Search must be called from the desktop app (browser dev mode is blocked by CORS)."
      );
    }

    const params = new URLSearchParams({
      q: options.query,
      count: String(options.pageSize ?? 10),
      offset: String(((options.page ?? 1) - 1) * (options.pageSize ?? 10)),
      safesearch: options.safeSearch ? "moderate" : "off",
    });

    const start = Date.now();
    let response: Response;
    try {
      response = await platformFetch(`${BRAVE_ENDPOINT}?${params}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          // NOTE: deliberately not sending Accept-Encoding — Tauri's reqwest
          // backend handles compression and an explicit header can confuse it.
          "X-Subscription-Token": this.apiKey,
        },
      });
    } catch (err) {
      // The plugin-http error message tells us EXACTLY what's wrong — pass it through.
      const detail = err instanceof Error ? err.message : String(err);
      throw new ProviderError("network", PROVIDER_LABEL, detail);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError(
        "invalid_api_key",
        PROVIDER_LABEL,
        `Brave Search rejected the API key (HTTP ${response.status}).`
      );
    }
    if (response.status === 429) {
      throw new ProviderError(
        "rate_limited",
        PROVIDER_LABEL,
        "Brave Search rate limit reached."
      );
    }
    if (!response.ok) {
      // Try to pull a useful detail from the body
      let bodyHint = "";
      try {
        const text = await response.text();
        if (text) bodyHint = `: ${text.slice(0, 200)}`;
      } catch {
        // ignore
      }
      throw new ProviderError(
        "server",
        PROVIDER_LABEL,
        `HTTP ${response.status} ${response.statusText}${bodyHint}`
      );
    }

    let data: BraveResponse;
    try {
      data = (await response.json()) as BraveResponse;
    } catch (err) {
      const detail = err instanceof Error ? err.message : "JSON parse failed";
      throw new ProviderError("server", PROVIDER_LABEL, `Unparseable response: ${detail}`);
    }

    const webResults = data.web?.results ?? [];
    const results: SearchResult[] = webResults.map((item, idx) => {
      const url = item.url ?? "";
      const domain =
        item.meta_url?.hostname?.replace(/^www\./, "").toLowerCase() ?? rawDomain(url);
      const sourceType = guessSourceType(domain, item.subtype);
      const displayPath = item.meta_url?.path ? `${domain}${item.meta_url.path}` : url;

      return {
        id: `brave-${idx}-${Date.now()}`,
        resultType: sourceType === "news" ? "news" : "web",
        title: item.title ?? "(untitled)",
        url,
        displayUrl: displayPath.replace(/\/+$/, ""),
        snippet: stripHtml(item.description ?? ""),
        domain,
        sourceType,
        publishedDate: item.page_age,
        language: item.language,
      };
    });

    return {
      results,
      totalEstimated: data.web?.total_count ?? results.length,
      query: options.query,
      provider: PROVIDER_LABEL,
      durationMs: Date.now() - start,
    };
  }

  /** Lightweight credential check — same code path as `search()` deliberately. */
  async testKey(): Promise<void> {
    await this.search({ query: "test", pageSize: 1, safeSearch: true });
  }
}

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
