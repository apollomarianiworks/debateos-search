import type {
  SearchResult,
  SourceType,
  SearchVertical,
  ResultCategory,
  ResultType,
} from "@/providers/types";

export interface QueryIntent {
  isCurrent: boolean;
  isStats: boolean;
  isHistorical: boolean;
  isPerson: boolean;
  isImage: boolean;
  isAcademic: boolean;
  isLegal: boolean;
  isGovernment: boolean;
  isFactCheck: boolean;
  isDefinition: boolean;
  /** 0 = historical/conceptual (freshness barely matters), 1 = breaking news */
  needsFreshness: number;
  /** Best guess of the vertical the user wants. UI may apply it as a hint. */
  suggestedVertical: SearchVertical;
}

/** Search emphasis. "research" boosts trusted source types in ranking. */
export type SearchMode = "standard" | "research";

export interface RankExplanation {
  relevance: number;
  credibility: number;
  freshness: number;
  sourceTypePriority: number;
  exactMatchBonus: number;
  qualityPenalty: number;
  researchBonus: number;
  finalScore: number;
}

/**
 * RankedResult is a discriminated union mirroring SearchResult, with the
 * ranking enrichment added on top of every variant. Narrowing on
 * `resultType` works the same way it does on `SearchResult`.
 */
export type RankedResult = SearchResult & {
  credibilityScore: number;
  freshnessScore: number;
  freshnessLabel?: string;
  finalRankScore: number;
  rankExplanation: RankExplanation;
  provider: string;
};

export interface CacheEntry {
  key: string;
  query: string;
  normalizedQuery: string;
  provider: string;
  timestamp: number;
  ttl: number;
  intent: QueryIntent;
  results: RankedResult[];
  totalEstimated: number;
  durationMs: number;
}

export type CacheStatus = "fresh" | "stale" | "expired" | "miss";

export interface CacheLookupResult {
  entry: CacheEntry | null;
  status: CacheStatus;
  ageMs: number;
}

export interface SearchPipelineInput {
  rawResults: SearchResult[];
  query: string;
  provider: string;
}

export type { SearchResult, SourceType, ResultCategory, SearchVertical, ResultType };
