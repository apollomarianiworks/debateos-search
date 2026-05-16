import type { SearchProvider, SearchVertical } from "./types";
import { BraveProvider } from "./BraveProvider";
import { BraveImagesProvider } from "./BraveImagesProvider";
import { WikipediaProvider } from "./WikipediaProvider";
import { ArxivProvider } from "./ArxivProvider";
import { CourtListenerProvider } from "./CourtListenerProvider";
import type { QueryIntent } from "@/search-engine/types";
import type { ProviderCatalogEntry } from "./providerStatus";
import {
  CensusProvider,
  CdcDataProvider,
  CrossrefProvider,
  DataGovProvider,
  FederalRegisterProvider,
  GdeltProvider,
  InternetArchiveProvider,
  OpenAlexProvider,
  OpenLibraryProvider,
  SemanticScholarProvider,
  WikidataProvider,
  WorldBankProvider,
} from "./publicApiProviders";

export type ProviderId = "mock" | "brave";

export interface ProviderConfig {
  preferred: ProviderId;
  braveApiKey: string;
}

export interface BuildResult {
  provider: SearchProvider;
  fallbackUsed: boolean;
  reason?: string;
}

/**
 * Choose the primary web provider given user settings, with graceful degradation.
 */
export function buildProvider(config: ProviderConfig): BuildResult {
  if (config.preferred === "brave") {
    if (config.braveApiKey && config.braveApiKey.trim().length > 0) {
      return { provider: new BraveProvider(config.braveApiKey), fallbackUsed: false };
    }
    return {
      provider: new WikipediaProvider(),
      fallbackUsed: true,
      reason: "Brave Search is selected but no API key is set. Searching public no-key sources instead.",
    };
  }
  return { provider: new WikipediaProvider(), fallbackUsed: false };
}

export function buildBraveProvider(apiKey: string): BraveProvider {
  return new BraveProvider(apiKey);
}

/**
 * Pick the set of providers to run for a given vertical. Returns an ordered
 * list — the first entry is the "primary" web provider whose failure (alone)
 * justifies a stronger user-facing error.
 *
 * Providers that need a key but don't have one are simply omitted (they would
 * throw a missing_api_key error otherwise). The pipeline tolerates an empty
 * list by falling back to the primary web provider only.
 */
export function buildVerticalProviders(
  vertical: SearchVertical,
  config: ProviderConfig,
  intent?: QueryIntent,
  query = ""
): { primary: BuildResult; extras: SearchProvider[] } {
  const primary = buildProvider(config);
  const extras: SearchProvider[] = [];
  const add = (...providers: SearchProvider[]) => {
    for (const provider of providers) {
      if (provider.id === primary.provider.id) continue;
      if (extras.some((existing) => existing.id === provider.id)) continue;
      extras.push(provider);
    }
  };

  switch (vertical) {
    case "all":
      add(...providersForAll(config, intent, query));
      break;
    case "web":
      add(new WikidataProvider(), new InternetArchiveProvider());
      break;
    case "images": {
      if (config.braveApiKey) {
        add(new BraveImagesProvider(config.braveApiKey));
      }
      add(new WikipediaProvider({ imagesOnly: true }), new InternetArchiveProvider());
      break;
    }
    case "people":
      add(new WikipediaProvider({ personHint: true }), new WikidataProvider(), new OpenLibraryProvider(), new OpenAlexProvider());
      break;
    case "academic":
      add(new ArxivProvider(), new OpenAlexProvider(), new CrossrefProvider(), new SemanticScholarProvider(), new WikipediaProvider());
      break;
    case "government":
      add(new DataGovProvider(), new CensusProvider(), new FederalRegisterProvider(), new CourtListenerProvider(), new WorldBankProvider(), new CdcDataProvider());
      break;
    case "stats":
      add(new DataGovProvider(), new WorldBankProvider(), new CensusProvider(), new CdcDataProvider(), new OpenAlexProvider());
      break;
    case "news":
      if (config.braveApiKey) add(new BraveProvider(config.braveApiKey));
      add(new GdeltProvider(), new FederalRegisterProvider());
      break;
    case "factcheck":
      if (config.braveApiKey) add(new BraveProvider(config.braveApiKey));
      add(new GdeltProvider(), new WikidataProvider());
      break;
  }

  return { primary, extras };
}

function providersForAll(
  config: ProviderConfig,
  intent: QueryIntent | undefined,
  query: string
): SearchProvider[] {
  const providers: SearchProvider[] = [
    new WikidataProvider(),
  ];

  if (intent?.isPerson || intent?.isDefinition) {
    providers.push(new WikipediaProvider({ personHint: intent.isPerson }), new OpenLibraryProvider());
  }

  if (intent?.isAcademic || looksAcademic(query)) {
    providers.push(new ArxivProvider(), new OpenAlexProvider(), new CrossrefProvider(), new SemanticScholarProvider());
  }

  if (intent?.isStats || intent?.isGovernment || looksDataQuery(query)) {
    providers.push(new DataGovProvider(), new WorldBankProvider(), new CensusProvider(), new CdcDataProvider());
  }

  if (intent?.isLegal) {
    providers.push(new CourtListenerProvider(), new FederalRegisterProvider());
  }

  if (looksBookQuery(query)) {
    providers.push(new OpenLibraryProvider(), new InternetArchiveProvider());
  }

  if (intent?.isCurrent) {
    if (config.braveApiKey) providers.push(new BraveProvider(config.braveApiKey));
    providers.push(new GdeltProvider());
  }

  if (intent?.isImage) {
    if (config.braveApiKey) providers.push(new BraveImagesProvider(config.braveApiKey));
    providers.push(new WikipediaProvider({ imagesOnly: true }), new InternetArchiveProvider());
  }

  if (!intent?.isAcademic && !intent?.isStats && !intent?.isGovernment && !intent?.isLegal && !intent?.isCurrent && !intent?.isImage) {
    providers.push(new OpenAlexProvider(), new CrossrefProvider(), new DataGovProvider(), new GdeltProvider());
  }

  return providers;
}

function looksAcademic(query: string): boolean {
  return /\b(paper|papers|study|studies|research|doi|citation|journal|author|institution)\b/i.test(query);
}

function looksDataQuery(query: string): boolean {
  return /\b(data|dataset|statistics|rate|rates|indicator|census|cdc|bls|fred|world bank|crime|health|economy)\b/i.test(query);
}

function looksBookQuery(query: string): boolean {
  return /\b(book|books|author|authors|novel|library|archive|publication)\b/i.test(query);
}

export function getProviderCatalog(config: ProviderConfig): ProviderCatalogEntry[] {
  const hasBrave = config.braveApiKey.trim().length > 0;
  return [
    { id: "wikipedia", name: "Wikipedia", keyRequired: false, enabled: true, verticals: ["all", "web", "people", "images"], sourcePacks: ["people", "images-media"] },
    { id: "wikidata", name: "Wikidata", keyRequired: false, enabled: true, verticals: ["all", "people", "web"], sourcePacks: ["people"] },
    { id: "arxiv", name: "arXiv", keyRequired: false, enabled: true, verticals: ["all", "academic"], sourcePacks: ["academic"] },
    { id: "openalex", name: "OpenAlex", keyRequired: false, enabled: true, verticals: ["all", "academic", "people", "stats"], sourcePacks: ["academic", "health", "economics", "education"] },
    { id: "crossref", name: "Crossref", keyRequired: false, enabled: true, verticals: ["all", "academic"], sourcePacks: ["academic", "health", "economics"] },
    { id: "semantic-scholar", name: "Semantic Scholar", keyRequired: false, enabled: true, verticals: ["all", "academic"], sourcePacks: ["academic", "health", "education"], note: "Unauthenticated use is rate-limited." },
    { id: "data-gov", name: "Data.gov", keyRequired: false, enabled: true, verticals: ["all", "stats", "government"], sourcePacks: ["government", "statistics", "crime", "education"] },
    { id: "world-bank", name: "World Bank", keyRequired: false, enabled: true, verticals: ["all", "stats", "government"], sourcePacks: ["statistics", "economics", "international"] },
    { id: "census", name: "Census API", keyRequired: false, enabled: true, verticals: ["all", "stats", "government"], sourcePacks: ["statistics", "government"] },
    { id: "cdc-data", name: "CDC Data", keyRequired: false, enabled: true, verticals: ["all", "stats", "government"], sourcePacks: ["health", "statistics"] },
    { id: "courtlistener", name: "CourtListener", keyRequired: false, enabled: true, verticals: ["all", "government"], sourcePacks: ["legal", "crime"] },
    { id: "federal-register", name: "Federal Register", keyRequired: false, enabled: true, verticals: ["all", "government", "news"], sourcePacks: ["government", "legal"] },
    { id: "open-library", name: "Open Library", keyRequired: false, enabled: true, verticals: ["all", "web", "people"], sourcePacks: ["people", "images-media"] },
    { id: "internet-archive", name: "Internet Archive", keyRequired: false, enabled: true, verticals: ["all", "web", "images"], sourcePacks: ["images-media", "people"] },
    { id: "gdelt", name: "GDELT", keyRequired: false, enabled: true, verticals: ["all", "news", "factcheck"], sourcePacks: ["factchecking", "international"] },
    { id: "brave", name: "Brave Search", keyRequired: true, enabled: hasBrave, verticals: ["all", "web", "news", "factcheck"], sourcePacks: ["factchecking"], note: hasBrave ? undefined : "Add a Brave API key for live general web/news search." },
    { id: "brave-images", name: "Brave Images", keyRequired: true, enabled: hasBrave, verticals: ["images"], sourcePacks: ["images-media"], note: hasBrave ? undefined : "Uses the same Brave API key." },
    { id: "fred", name: "FRED", keyRequired: true, enabled: false, verticals: ["stats"], sourcePacks: ["statistics", "economics"], note: "Skeleton only: FRED series search requires an API key." },
    { id: "fbi-crime-data", name: "FBI Crime Data", keyRequired: true, enabled: false, verticals: ["stats", "government"], sourcePacks: ["crime"], note: "Skeleton only: wire in an API key before live calls." },
    { id: "bls", name: "BLS Public API", keyRequired: true, enabled: false, verticals: ["stats", "government"], sourcePacks: ["statistics", "economics"], note: "Skeleton only: public requests are limited; key support should be added before fan-out." },
  ];
}
