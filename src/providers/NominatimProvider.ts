import type {
  SearchProvider,
  SearchOptions,
  SearchResponse,
  WebResult,
  SearchVertical,
} from "./types";
import { ProviderError } from "./providerErrors";
import { platformFetch, clampLimit } from "./http";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const PROVIDER_LABEL = "OpenStreetMap";

/**
 * Nominatim — OpenStreetMap's geocoding service. Free, no key. Respects
 * Nominatim's usage policy by sending a descriptive User-Agent and limiting
 * to a handful of results per query.
 *
 * https://operations.osmfoundation.org/policies/nominatim/
 */

interface NominatimHit {
  place_id?: number;
  licence?: string;
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  display_name?: string;
  class?: string;
  type?: string;
  importance?: number;
  addresstype?: string;
}

export class NominatimProvider implements SearchProvider {
  readonly name = PROVIDER_LABEL;
  readonly id = "nominatim";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "web"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const url = new URL(ENDPOINT);
    url.searchParams.set("q", options.query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(clampLimit(options.pageSize, 3, 8)));
    url.searchParams.set("addressdetails", "0");

    let data: NominatimHit[];
    try {
      const resp = await platformFetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          // Required by Nominatim usage policy
          "User-Agent": "DebateOSSearch/0.1 (https://github.com/apollomarianiworks/debateos-search)",
        },
      });
      if (resp.status === 429) {
        throw new ProviderError("rate_limited", PROVIDER_LABEL, "Nominatim rate limit reached.");
      }
      if (!resp.ok) {
        throw new ProviderError("server", PROVIDER_LABEL, `HTTP ${resp.status}`);
      }
      data = (await resp.json()) as NominatimHit[];
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const detail = err instanceof Error ? err.message : String(err);
      throw new ProviderError("network", PROVIDER_LABEL, detail);
    }

    const results: WebResult[] = data.map((hit, idx): WebResult => {
      const lat = hit.lat ?? "0";
      const lon = hit.lon ?? "0";
      const osmUrl = hit.osm_type && hit.osm_id
        ? `https://www.openstreetmap.org/${hit.osm_type}/${hit.osm_id}`
        : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`;
      const typeLabel = [hit.class, hit.type].filter(Boolean).join("/");
      const snippet = [hit.display_name, typeLabel ? `(${typeLabel})` : "", `lat ${lat}, lon ${lon}`]
        .filter(Boolean)
        .join(" — ");

      return {
        id: `nominatim-${hit.place_id ?? idx}`,
        resultType: "web",
        title: hit.display_name?.split(",")[0]?.trim() || "(unnamed place)",
        url: osmUrl,
        displayUrl: osmUrl.replace(/^https?:\/\//, ""),
        snippet: snippet.slice(0, 320),
        domain: "openstreetmap.org",
        sourceType: "general",
      };
    });

    return {
      results,
      totalEstimated: results.length,
      query: options.query,
      provider: PROVIDER_LABEL,
      durationMs: Date.now() - start,
    };
  }
}
