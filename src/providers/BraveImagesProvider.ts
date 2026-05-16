import type {
  SearchProvider,
  SearchOptions,
  SearchResponse,
  ImageResult,
  SearchVertical,
} from "./types";
import { ProviderError } from "./providerErrors";

const ENDPOINT = "https://api.search.brave.com/res/v1/images/search";
const PROVIDER_LABEL = "Brave Images";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

async function platformFetch(url: string, init: RequestInit): Promise<Response> {
  if (isTauri()) {
    const mod = await import("@tauri-apps/plugin-http");
    return mod.fetch(url, init);
  }
  return fetch(url, init);
}

type BraveImageItem = {
  title?: string;
  url?: string;            // page URL
  source?: string;         // image source URL (sometimes)
  thumbnail?: { src?: string };
  properties?: { url?: string; placeholder?: string };
  meta_url?: { hostname?: string };
  page_age?: string;
};

type BraveImagesResponse = {
  results?: BraveImageItem[];
  type?: string;
};

/**
 * Brave Images provider — uses the same Brave API key as web search.
 * If the user's plan doesn't include image search the call will return
 * 401/403 and we surface a clear ProviderError.
 *
 * Currently no fallback image service is wired; for the demo experience the
 * MockProvider returns curated image results when `vertical === "images"`.
 */
export class BraveImagesProvider implements SearchProvider {
  readonly name = PROVIDER_LABEL;
  readonly id = "brave-images";
  readonly isConfigured: boolean;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "images"];
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
        "Brave Images requires the same Brave API key as Web Search."
      );
    }
    if (!isTauri()) {
      throw new ProviderError(
        "network",
        PROVIDER_LABEL,
        "Brave Images must be called from the desktop app (browser dev mode is blocked by CORS)."
      );
    }

    const params = new URLSearchParams({
      q: options.query,
      count: String(options.pageSize ?? 20),
      safesearch: options.safeSearch ? "strict" : "off",
    });

    const start = Date.now();
    let response: Response;
    try {
      response = await platformFetch(`${ENDPOINT}?${params}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": this.apiKey,
        },
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new ProviderError("network", PROVIDER_LABEL, detail);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError(
        "invalid_api_key",
        PROVIDER_LABEL,
        `Brave Images endpoint rejected the key (HTTP ${response.status}). Your subscription may not include image search.`
      );
    }
    if (response.status === 429) {
      throw new ProviderError("rate_limited", PROVIDER_LABEL, "Brave Images rate limit reached.");
    }
    if (!response.ok) {
      throw new ProviderError("server", PROVIDER_LABEL, `HTTP ${response.status} ${response.statusText}`);
    }

    let data: BraveImagesResponse;
    try {
      data = (await response.json()) as BraveImagesResponse;
    } catch {
      throw new ProviderError("server", PROVIDER_LABEL, "Unparseable JSON response.");
    }

    const items = data.results ?? [];
    const results: ImageResult[] = items
      .map((item, idx): ImageResult | null => {
        const pageUrl = item.url ?? "";
        const imageUrl = item.properties?.url ?? item.source ?? item.thumbnail?.src;
        if (!imageUrl) return null;
        const domain = item.meta_url?.hostname?.replace(/^www\./, "").toLowerCase() ?? "";
        return {
          id: `brave-img-${idx}-${Date.now()}`,
          resultType: "image",
          title: item.title ?? "(untitled)",
          url: pageUrl || imageUrl,
          displayUrl: domain || pageUrl,
          snippet: item.title ?? "",
          domain: domain || "",
          sourceType: "general",
          imageUrl,
          thumbnailUrl: item.thumbnail?.src ?? imageUrl,
          publishedDate: item.page_age,
          pageUrl,
        };
      })
      .filter((x): x is ImageResult => x !== null);

    return {
      results,
      totalEstimated: results.length,
      query: options.query,
      provider: PROVIDER_LABEL,
      durationMs: Date.now() - start,
    };
  }
}
