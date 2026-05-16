import type { SearchResult, SourceType } from "@/providers/types";
import type { RankedResult, RankExplanation, QueryIntent, SearchMode } from "./types";
import { scoreCredibility, inferSourceType } from "./credibility";
import { scoreFreshness, freshnessLabel } from "./freshness";
import { tokenize } from "./normalize";

/**
 * Bump whenever the ranking algorithm changes in a way that would make
 * previously cached `finalRankScore` values misleading. The cache layer
 * mixes this into its storage key so old entries become unreachable and
 * get recomputed on the next search.
 *
 *   v1 — initial ranking
 *   v2 — title-exact + diversification (introduced in prior pass)
 *   v3 — homepage + empty-snippet penalties + answerability gate
 */
export const RANKING_VERSION = 3;

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
): { score: number; exactMatchBonus: number; reasons: string[] } {
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

  const reasons: string[] = [];
  if (titleHits > 0) reasons.push(`${titleHits} query term${titleHits === 1 ? "" : "s"} in title`);
  if (snippetHits > 0) reasons.push(`${snippetHits} term${snippetHits === 1 ? "" : "s"} in snippet`);
  if (domainHits > 0) reasons.push("domain matches query");

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
    if (title.includes(phrase) || snippet.includes(phrase)) reasons.push(`exact phrase "${phrase}"`);
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
    reasons.push("title exactly matches the query");
  } else if (tLower.startsWith(qLower + " ") || tLower.startsWith(qLower + ":") || tLower.startsWith(qLower + " —")) {
    exactMatchBonus += 14;
    reasons.push("title starts with the query");
  } else if (tokens.length >= 1 && tokens.every((t) => tLower.includes(t))) {
    // All tokens in title (any order)
    exactMatchBonus += 6;
    reasons.push("all query terms appear in the title");
  }

  exactMatchBonus = Math.min(30, exactMatchBonus);

  if (relevance === 0 && (snippetHits > 0 || titleHits > 0)) {
    relevance = 12;
  }

  return { score: clamp(relevance), exactMatchBonus, reasons };
}

function computeQualityPenalty(result: SearchResult, credibility: number, intent: QueryIntent, query: string): number {
  let penalty = 0;
  if (result.snippet.length < MIN_SNIPPET_LEN) penalty += 8;
  if (result.snippet.length < 20) penalty += 6;

  // Empty / near-empty snippet on a specific query is almost always noise.
  const wantsSpecifics = intent.isStats || intent.isLegal || intent.isCurrent || /\b(19|20)\d{2}\b/.test(query);
  if (result.snippet.trim().length < 30 && wantsSpecifics) penalty += 10;

  // Bare homepage results — already detected. Bigger penalty when the query
  // clearly asked for specifics: a top-level org URL doesn't answer "homicide
  // rates by race in america" no matter how authoritative the org is.
  if (isGenericHomepage(result)) {
    penalty += wantsSpecifics ? 20 : 10;
  }

  if (credibility < 30) penalty += 18;
  else if (credibility < 45) penalty += 8;

  if (/^\d+\s+(best|top|amazing|incredible|shocking)/i.test(result.title)) {
    penalty += 6;
  }

  // "Just the org name" titles like "U.S. Census Bureau" with no specifics
  // and a homepage URL combo are the classic noise pattern.
  if (isGenericHomepage(result) && result.title.split(/\s+/).length <= 4) {
    penalty += 4;
  }

  return Math.min(40, penalty);
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
  const parsed = tokenize(query);
  const tokens = expandSemanticTokens(parsed.tokens);
  const phrases = parsed.phrases;

  const ranked = rawResults.map<RankedResult>((raw) => {
    const refinedType = inferSourceType(raw.domain, raw.sourceType);
    const credibility = scoreCredibility(raw.domain, refinedType);
    const freshness = scoreFreshness(raw.publishedDate, raw.fetchedDate, intent);
    const fLabel = freshnessLabel(raw.publishedDate, raw.fetchedDate);
    const sourceTypePriority = SOURCE_TYPE_PRIORITY[refinedType];

    const { score: relevance, exactMatchBonus, reasons } = computeRelevance(raw, tokens, phrases, query);
    const qualityPenalty = computeQualityPenalty(raw, credibility, intent, query);
    const intentSourceBoost = computeIntentSourceBoost(refinedType, raw.resultType, intent);

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
      Math.round(weightedCore + exactMatchBonus + intentSourceBoost - qualityPenalty + researchBonus)
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
      matchReasons: buildMatchReasons(reasons, refinedType, provider, credibility),
      resultOrigin: provider === "Local Index" ? "indexed" : "live",
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

function buildMatchReasons(base: string[], sourceType: SourceType, provider: string, credibility: number): string[] {
  const reasons = [...base];
  if (sourceType !== "general") reasons.push(`${sourceType} source`);
  if (provider === "Local Index") reasons.push("from your local source index");
  if (credibility >= 80) reasons.push("high credibility source");
  return reasons.slice(0, 4);
}

function computeIntentSourceBoost(sourceType: SourceType, resultType: SearchResult["resultType"], intent: QueryIntent): number {
  let boost = 0;
  if (intent.isStats && (sourceType === "statistics" || resultType === "dataset" || resultType === "stat")) boost += 14;
  if (intent.isLegal && sourceType === "legal") boost += 12;
  if (intent.isAcademic && sourceType === "academic") boost += 10;
  if (intent.isGovernment && (sourceType === "government" || sourceType === "statistics")) boost += 8;
  if (intent.isFactCheck && (sourceType === "factcheck" || sourceType === "news")) boost += 8;
  return boost;
}

function isGenericHomepage(result: SearchResult): boolean {
  try {
    const url = new URL(result.url);
    const path = url.pathname.replace(/\/+$/, "");
    return path === "" || path === "/" || /^home$/i.test(result.title.trim());
  } catch {
    return false;
  }
}

const SEMANTIC_EXPANSIONS: Record<string, string[]> = {
  stats: ["statistics", "data"],
  statistics: ["stats", "data", "dataset"],
  data: ["statistics", "dataset"],
  police: ["law", "enforcement"],
  killings: ["deaths", "fatalities"],
  crime: ["homicide", "murder", "violent"],
  women: ["female", "gender"],
  voting: ["suffrage", "election"],
  controversy: ["debate", "criticism"],
  history: ["timeline", "background"],
  claim: ["fact", "verify", "evidence"],
};

function expandSemanticTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens.flatMap((token) => [token, ...(SEMANTIC_EXPANSIONS[token] ?? [])])));
}
