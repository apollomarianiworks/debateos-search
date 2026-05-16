import type { SearchResult, SourceType } from "@/providers/types";
import type { RankedResult, RankExplanation, QueryIntent, SearchMode } from "./types";
import { scoreCredibility, inferSourceType } from "./credibility";
import { scoreFreshness, freshnessLabel } from "./freshness";
import { tokenize } from "./normalize";

const SOURCE_TYPE_PRIORITY: Record<SourceType, number> = {
  government: 100,
  statistics: 95,
  academic: 90,
  legal: 85,
  factcheck: 80,
  news: 65,
  general: 50,
};

// In research mode, these source types get a flat additive bonus.
const RESEARCH_BOOSTED: ReadonlySet<SourceType> = new Set([
  "government",
  "statistics",
  "academic",
  "legal",
  "factcheck",
]);
const RESEARCH_BONUS = 18;
const RESEARCH_GENERAL_PENALTY = 8;

// Final weights — sum loosely to 1.0 over core dimensions.
// Tuned for debate research: credibility & source priority dominate.
const W_RELEVANCE = 0.30;
const W_CREDIBILITY = 0.27;
const W_SOURCE_PRIORITY = 0.18;
const W_FRESHNESS_BASE = 0.10; // scaled by intent.needsFreshness

const MIN_SNIPPET_LEN = 60;

function computeRelevance(
  result: SearchResult,
  tokens: string[],
  phrases: string[],
  query: string
): { score: number; exactMatchBonus: number } {
  const title = result.title.toLowerCase();
  const snippet = result.snippet.toLowerCase();
  const domain = result.domain.toLowerCase();

  let titleHits = 0;
  let snippetHits = 0;
  let domainHits = 0;

  for (const token of tokens) {
    if (title.includes(token)) titleHits++;
    if (snippet.includes(token)) snippetHits++;
    if (domain.includes(token)) domainHits++;
  }

  const tokenCount = Math.max(1, tokens.length);
  const coverage =
    (titleHits / tokenCount) * 0.55 +
    (snippetHits / tokenCount) * 0.35 +
    (domainHits / tokenCount) * 0.10;

  let relevance = Math.round(coverage * 100);

  let exactMatchBonus = 0;
  for (const phrase of phrases) {
    if (title.includes(phrase)) exactMatchBonus += 18;
    else if (snippet.includes(phrase)) exactMatchBonus += 10;
  }

  if (tokens.length >= 2) {
    const joined = tokens.join(" ");
    if (title.includes(joined)) exactMatchBonus += 12;
    else if (snippet.includes(joined)) exactMatchBonus += 6;
  }

  // Title-equality bonus: title is exactly the query (or query is the entire title)
  // — strongest signal of "this is THE answer". Granted on top of phrase bonus.
  const qLower = query.toLowerCase().trim();
  const tLower = title.trim();
  if (tLower === qLower) {
    exactMatchBonus += 22;
  } else if (tLower.startsWith(qLower + " ") || tLower.startsWith(qLower + ":") || tLower.startsWith(qLower + " —")) {
    exactMatchBonus += 14;
  } else if (tokens.length >= 1 && tokens.every((t) => tLower.includes(t))) {
    // All tokens in title (any order)
    exactMatchBonus += 6;
  }

  exactMatchBonus = Math.min(30, exactMatchBonus);

  if (relevance === 0 && (snippetHits > 0 || titleHits > 0)) {
    relevance = 12;
  }

  return { score: clamp(relevance), exactMatchBonus };
}

function computeQualityPenalty(result: SearchResult, credibility: number): number {
  let penalty = 0;
  if (result.snippet.length < MIN_SNIPPET_LEN) penalty += 8;
  if (result.snippet.length < 20) penalty += 6;
  if (credibility < 30) penalty += 18;
  else if (credibility < 45) penalty += 8;
  if (/^\d+\s+(best|top|amazing|incredible|shocking)/i.test(result.title)) {
    penalty += 6;
  }
  return Math.min(30, penalty);
}

/**
 * Take provider-raw results and produce ranked, enriched results.
 */
export function rankResults(
  rawResults: SearchResult[],
  query: string,
  intent: QueryIntent,
  provider: string,
  mode: SearchMode = "standard"
): RankedResult[] {
  const { tokens, phrases } = tokenize(query);

  const ranked = rawResults.map<RankedResult>((raw) => {
    const refinedType = inferSourceType(raw.domain, raw.sourceType);
    const credibility = scoreCredibility(raw.domain, refinedType);
    const freshness = scoreFreshness(raw.publishedDate, raw.fetchedDate, intent);
    const fLabel = freshnessLabel(raw.publishedDate, raw.fetchedDate);
    const sourceTypePriority = SOURCE_TYPE_PRIORITY[refinedType];

    const { score: relevance, exactMatchBonus } = computeRelevance(raw, tokens, phrases, query);
    const qualityPenalty = computeQualityPenalty(raw, credibility);

    const wFreshness = W_FRESHNESS_BASE * (0.3 + intent.needsFreshness * 1.4);

    const weightedCore =
      relevance * W_RELEVANCE +
      credibility * W_CREDIBILITY +
      sourceTypePriority * W_SOURCE_PRIORITY +
      freshness * wFreshness;

    let researchBonus = 0;
    if (mode === "research") {
      if (RESEARCH_BOOSTED.has(refinedType)) {
        researchBonus = RESEARCH_BONUS;
      } else if (refinedType === "general") {
        researchBonus = -RESEARCH_GENERAL_PENALTY;
      }
    }

    const finalScore = clamp(
      Math.round(weightedCore + exactMatchBonus - qualityPenalty + researchBonus)
    );

    const explanation: RankExplanation = {
      relevance,
      credibility,
      freshness,
      sourceTypePriority,
      exactMatchBonus,
      qualityPenalty,
      researchBonus,
      finalScore,
    };

    return {
      ...raw,
      sourceType: refinedType,
      provider,
      credibilityScore: credibility,
      freshnessScore: freshness,
      freshnessLabel: fLabel,
      finalRankScore: finalScore,
      rankExplanation: explanation,
    };
  });

  ranked.sort((a, b) => {
    if (b.finalRankScore !== a.finalRankScore) return b.finalRankScore - a.finalRankScore;
    if (b.credibilityScore !== a.credibilityScore) return b.credibilityScore - a.credibilityScore;
    return b.freshnessScore - a.freshnessScore;
  });

  return ranked;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
