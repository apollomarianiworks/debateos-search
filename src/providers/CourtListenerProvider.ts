import type {
  SearchProvider,
  SearchOptions,
  SearchResponse,
  WebResult,
  SearchVertical,
} from "./types";
import { ProviderError } from "./providerErrors";

const ENDPOINT = "https://www.courtlistener.com/api/rest/v4/search/";
const PROVIDER_LABEL = "CourtListener";

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

interface CLHit {
  caseName?: string;
  absolute_url?: string;
  snippet?: string;
  court?: string;
  dateFiled?: string;
  citation?: string[];
}

interface CLResponse {
  count?: number;
  results?: CLHit[];
}

/**
 * CourtListener (Free Law Project) — case law search. Free tier, optional token.
 * Skeleton: works without a key on basic search but rate-limited; for serious
 * usage a free CourtListener token is recommended.
 */
export class CourtListenerProvider implements SearchProvider {
  readonly name = PROVIDER_LABEL;
  readonly id = "courtlistener";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "government"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const params = new URLSearchParams({
      q: options.query,
      type: "o", // opinions
      order_by: "score desc",
    });

    try {
      const resp = await platformFetch(`${ENDPOINT}?${params}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (resp.status === 429) {
        throw new ProviderError("rate_limited", PROVIDER_LABEL, "CourtListener rate limit reached.");
      }
      if (!resp.ok) {
        throw new ProviderError("server", PROVIDER_LABEL, `HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as CLResponse;
      const hits = (data.results ?? []).slice(0, options.pageSize ?? 8);
      const results: WebResult[] = hits.map((h, idx): WebResult => ({
        id: `cl-${idx}-${Date.now()}`,
        resultType: "web",
        title: h.caseName ?? "(unnamed opinion)",
        url: h.absolute_url ? `https://www.courtlistener.com${h.absolute_url}` : "https://www.courtlistener.com/",
        displayUrl: `courtlistener.com${h.absolute_url ?? ""}`,
        snippet: [h.court, h.dateFiled, h.snippet].filter(Boolean).join(" — ").slice(0, 320),
        domain: "courtlistener.com",
        sourceType: "legal",
        publishedDate: h.dateFiled,
      }));

      return {
        results,
        totalEstimated: data.count ?? results.length,
        query: options.query,
        provider: PROVIDER_LABEL,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const detail = err instanceof Error ? err.message : String(err);
      throw new ProviderError("network", PROVIDER_LABEL, detail);
    }
  }
}
