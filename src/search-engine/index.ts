export type {
  QueryIntent,
  RankExplanation,
  RankedResult,
  CacheEntry,
  CacheStatus,
  CacheLookupResult,
  SearchPipelineInput,
  SearchMode,
  SearchPlan,
} from "./types";

export { normalizeQuery, tokenize, detectIntent, extractDomain } from "./normalize";
export { planQuery, intentForPlan } from "./queryPlanner";
export { reasonAboutQuery, variantsForProvider } from "./queryReasoning";
export type { QueryReasoning, QueryVariant } from "./queryReasoning";
export { parseSearchOperators, resultMatchesOperators, operatorHint } from "./searchOperators";
export { scoreCredibility, inferSourceType } from "./credibility";
export { scoreFreshness, freshnessLabel } from "./freshness";
export { rankResults, RANKING_VERSION } from "./ranking";
export { mergeRankedResults, diversifyByDomain } from "./mergeResults";
export { buildSmartOverview } from "./smartOverview";
export { citationFor, evidencePackMarkdown, resultsAsJson, resultsAsMarkdown } from "./citations";
export {
  cacheKey,
  computeTtl,
  lookup as cacheLookup,
  store as cacheStore,
  clearAll as cacheClearAll,
  ageLabel,
} from "./cache";
