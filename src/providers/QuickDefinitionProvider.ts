import type {
  SearchProvider,
  SearchOptions,
  SearchResponse,
  WebResult,
  SearchVertical,
} from "./types";
import { ProviderError } from "./providerErrors";
import { platformFetch } from "./http";

const PROVIDER_LABEL = "Quick Definition";

/**
 * QuickDefinitionProvider — returns at most one "definition" result for
 * queries that look like a definition request, fetched live from Wiktionary
 * and Wikipedia REST summary. Zero key, zero config.
 *
 * Recognized intents (case-insensitive):
 *   - "define X" / "definition of X" / "meaning of X"
 *   - "what is X" / "what are X" / "what does X mean"
 *
 * Returns up to one WebResult with `sourceType: "general"` and the
 * provider/domain hint so the Results page can render it visually
 * distinct (handled in the metadata row + a CSS treatment).
 */

const DEFINITION_PATTERNS: Array<{ rx: RegExp; group: number }> = [
  { rx: /^\s*define\s+(.+?)\s*$/i, group: 1 },
  { rx: /^\s*definition\s+of\s+(.+?)\s*$/i, group: 1 },
  { rx: /^\s*meaning\s+of\s+(.+?)\s*$/i, group: 1 },
  { rx: /^\s*what\s+(?:is|are|was|were)\s+(?:a|an|the)?\s*(.+?)\??\s*$/i, group: 1 },
  { rx: /^\s*what\s+does\s+(.+?)\s+mean\??\s*$/i, group: 1 },
];

function extractTerm(query: string): string | null {
  for (const { rx, group } of DEFINITION_PATTERNS) {
    const m = query.match(rx);
    if (m && m[group]) {
      const term = m[group].trim();
      if (term.length > 0 && term.length <= 80) return term;
    }
  }
  return null;
}

interface WiktionaryDefinition {
  partOfSpeech?: string;
  definitions?: Array<{ definition?: string; examples?: string[] }>;
}

interface WiktionaryResponse {
  [language: string]: WiktionaryDefinition[];
}

interface WikiSummaryResponse {
  title?: string;
  description?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

async function fetchWiktionary(term: string): Promise<string | null> {
  // Wiktionary REST: returns an array of definitions grouped by part-of-speech.
  const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(term)}?redirect=true`;
  try {
    const resp = await platformFetch(url, { method: "GET", headers: { Accept: "application/json" } });
    if (!resp.ok) return null;
    const data = (await resp.json()) as WiktionaryResponse;
    const en = data["en"];
    if (!en || en.length === 0) return null;
    const pieces: string[] = [];
    for (const block of en.slice(0, 3)) {
      const pos = block.partOfSpeech ? `(${block.partOfSpeech})` : "";
      const def = block.definitions?.[0]?.definition;
      if (def) {
        // Strip HTML tags from Wiktionary's response
        const cleaned = def.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        if (cleaned) pieces.push(pos ? `${pos} ${cleaned}` : cleaned);
      }
    }
    return pieces.length ? pieces.join(" ") : null;
  } catch {
    return null;
  }
}

async function fetchWikipediaSummary(term: string): Promise<{ extract: string; url: string } | null> {
  const titleCandidate = term.replace(/\s+/g, "_");
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titleCandidate)}?redirect=true`;
  try {
    const resp = await platformFetch(url, { method: "GET", headers: { Accept: "application/json" } });
    if (!resp.ok) return null;
    const data = (await resp.json()) as WikiSummaryResponse;
    if (!data.extract) return null;
    return {
      extract: data.extract.slice(0, 360),
      url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(titleCandidate)}`,
    };
  } catch {
    return null;
  }
}

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

export class QuickDefinitionProvider implements SearchProvider {
  readonly name = PROVIDER_LABEL;
  readonly id = "quick-definition";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "web"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const term = extractTerm(options.query);

    // If the query doesn't look like a definition request, return zero results
    // — this provider is intentionally narrow and only fires on the obvious cases.
    if (!term) {
      return {
        results: [],
        totalEstimated: 0,
        query: options.query,
        provider: PROVIDER_LABEL,
        durationMs: Date.now() - start,
      };
    }

    if (!isTauri()) {
      throw new ProviderError(
        "network",
        PROVIDER_LABEL,
        "Definition lookups require the desktop app (browser dev mode is blocked by CORS)."
      );
    }

    // Run both lookups in parallel; whichever returns content first wins for
    // the snippet. Wiktionary is preferred for terms, Wikipedia summary for
    // proper nouns and bigger concepts.
    const [wiktionary, wikipedia] = await Promise.all([
      fetchWiktionary(term),
      fetchWikipediaSummary(term),
    ]);

    const definition = wiktionary ?? wikipedia?.extract;
    if (!definition) {
      return {
        results: [],
        totalEstimated: 0,
        query: options.query,
        provider: PROVIDER_LABEL,
        durationMs: Date.now() - start,
      };
    }

    const sourceDomain = wiktionary ? "en.wiktionary.org" : "en.wikipedia.org";
    const sourceUrl = wiktionary
      ? `https://en.wiktionary.org/wiki/${encodeURIComponent(term)}`
      : wikipedia?.url ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(term.replace(/\s+/g, "_"))}`;

    const result: WebResult = {
      id: `quickdef-${term.toLowerCase().replace(/\s+/g, "-").slice(0, 60)}`,
      resultType: "web",
      // Title is the term itself so the card reads "Capitalism" not "Wikipedia: Capitalism"
      title: term.replace(/\b\w/g, (c) => c.toUpperCase()),
      url: sourceUrl,
      displayUrl: sourceUrl.replace(/^https?:\/\//, ""),
      snippet: definition,
      domain: sourceDomain,
      sourceType: "general",
    };

    return {
      results: [result],
      totalEstimated: 1,
      query: options.query,
      provider: PROVIDER_LABEL,
      durationMs: Date.now() - start,
    };
  }
}
