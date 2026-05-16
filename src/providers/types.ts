/**
 * Search verticals. A vertical controls BOTH which providers to call AND how
 * to render results. Don't confuse with `SourceType`, which is provider-level
 * metadata about a single result's origin.
 */
export type SearchVertical =
  | "all"
  | "web"
  | "images"
  | "people"
  | "stats"
  | "academic"
  | "government"
  | "news"
  | "factcheck";

/** Backwards-compat alias for callers that still pass the old "category" name. */
export type ResultCategory = SearchVertical;

export type SourceType =
  | "government"
  | "academic"
  | "news"
  | "legal"
  | "statistics"
  | "factcheck"
  | "general";

/** Discriminator. Every result carries one. */
export type ResultType =
  | "web"
  | "news"
  | "image"
  | "person"
  | "stat"
  | "dataset"
  | "chart";

/** Fields shared by every result type. */
export interface BaseSearchResult {
  id: string;
  resultType: ResultType;
  title: string;
  url: string;
  displayUrl: string;
  /** Short human-readable description. Always present, even on Image results (alt-text / caption). */
  snippet: string;
  domain: string;
  sourceType: SourceType;
  publishedDate?: string;
  fetchedDate?: string;
  isPaywalled?: boolean;
  language?: string;
}

export interface WebResult extends BaseSearchResult {
  resultType: "web" | "news";
}

export interface ImageResult extends BaseSearchResult {
  resultType: "image";
  imageUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  pageUrl?: string;
}

export interface PersonResult extends BaseSearchResult {
  resultType: "person";
  imageUrl?: string;
  /** "American physicist", "British politician", etc. */
  occupation?: string;
  birthDate?: string;
  deathDate?: string;
  nationality?: string;
  knownFor?: string;
  wikidataId?: string;
}

export interface StatResult extends BaseSearchResult {
  resultType: "stat";
  /** Pre-formatted display value, e.g. "$13,493" or "48,204 deaths". */
  value: string;
  /** Human-readable metric name, e.g. "Healthcare spending per capita". */
  metric: string;
  unit?: string;
  year?: string;
  /** Trend hint, optional. */
  trend?: "up" | "down" | "flat";
}

export interface DatasetResult extends BaseSearchResult {
  resultType: "dataset";
  organization?: string;
  formats?: string[];
  updatedDate?: string;
  rowCount?: number;
}

export interface ChartResult extends BaseSearchResult {
  resultType: "chart";
  chartType?: "bar" | "line" | "pie" | "scatter" | "other";
  chartImageUrl?: string;
  dataSource?: string;
}

/** Discriminated union — narrow on `resultType`. */
export type SearchResult =
  | WebResult
  | ImageResult
  | PersonResult
  | StatResult
  | DatasetResult
  | ChartResult;

export interface SearchOptions {
  query: string;
  /** Vertical hint — providers may use this to bias their output. */
  vertical?: SearchVertical;
  /** @deprecated — use `vertical`. Old callers may still pass this. */
  category?: SearchVertical;
  page?: number;
  pageSize?: number;
  safeSearch?: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  totalEstimated: number;
  query: string;
  provider: string;
  durationMs: number;
}

export interface SearchProvider {
  readonly name: string;
  readonly id: string;
  readonly isConfigured: boolean;
  /** Which verticals this provider produces useful results for. */
  readonly verticals?: ReadonlyArray<SearchVertical>;
  search(options: SearchOptions): Promise<SearchResponse>;
}
