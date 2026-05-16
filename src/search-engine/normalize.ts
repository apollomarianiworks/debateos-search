import type { QueryIntent } from "./types";
import type { SearchVertical } from "@/providers/types";

/** Normalize a query for caching, deduping, and term-matching. */
export function normalizeQuery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "")
    .trim();
}

export function tokenize(query: string): { tokens: string[]; phrases: string[] } {
  const phrases: string[] = [];
  const stripped = query.replace(/"([^"]+)"/g, (_, p1) => {
    phrases.push(p1.toLowerCase().trim());
    return " ";
  });
  const tokens = stripped
    .toLowerCase()
    .split(/[\s,;.!?()[\]{}]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return { tokens, phrases };
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "is", "are", "was", "were",
  "of", "in", "on", "at", "to", "for", "by", "with", "from", "as",
  "it", "this", "that", "these", "those",
]);

// ───── Intent signals ──────────────────────────────────────────────────────

const CURRENT_PATTERNS = [
  /\b(today|now|tonight|currently|presently|latest|breaking)\b/i,
  /\b(this (?:year|month|week|quarter))\b/i,
  /\b(news|update|updates)\b/i,
  /\b20(2[4-9]|[3-9]\d)\b/,
];

const STATS_PATTERNS = [
  /\b(statistics?|stats|data|datasets?|figures?|numbers)\b/i,
  /\b(rate|rates|percentage|percent|ratio|share)\b/i,
  /\b(how (?:many|much|often))\b/i,
  /\b(trends?|growth|decline|breakdown)\b/i,
  /\b(census|survey|poll|polling)\b/i,
  /\b(unemployment|inflation|gdp|cpi|ppi)\b/i,
  /\b(crime rate|incarceration|homicide|murder)\b/i,
];

const HISTORICAL_PATTERNS = [
  /\b(history|historical|origin|origins|founded|background)\b/i,
  /\b(century|ancient|medieval|colonial|war)\b/i,
];

const DEFINITION_PATTERNS = [
  /^(what (?:is|are|was|were)|define|definition of|meaning of)\b/i,
  /\b(meaning|definition)\b\s*$/i,
];

const PERSON_PATTERNS = [
  /^(who (?:is|was|are|were)|biography of|bio of)\b/i,
  /\b(biography|biographies|profile of|life of)\b/i,
];

const IMAGE_PATTERNS = [
  /\b(pictures? of|images? of|photos? of|photographs? of|image of)\b/i,
  /\b(picture|images?|photos?|wallpapers?|gallery)\b\s*$/i,
];

const CHART_PATTERNS = [
  /\b(chart|charts|graph|graphs|bar (?:chart|graph)|line (?:chart|graph)|pie chart|visualization)\b/i,
];

const ACADEMIC_PATTERNS = [
  /\b(study|studies|research|paper|papers|journal|peer.?reviewed|preprint)\b/i,
  /\b(meta.analysis|systematic review|literature review)\b/i,
  /\b(arxiv|pubmed|jstor|google scholar)\b/i,
];

const LEGAL_PATTERNS = [
  /\b(court (?:case|cases|ruling|decision)|supreme court|appellate)\b/i,
  /\b(v\.|vs\.|plaintiff|defendant|opinion|statute|jurisdiction)\b/i,
  /\b(constitution(?:al)?|amendment|legislation|bill)\b/i,
];

const GOV_PATTERNS = [
  /\b(government|federal|state|agency|department|congress|senate)\b/i,
  /\b(\.gov|gao|cbo|epa|fda|fcc|fbi|cdc|bls|census bureau)\b/i,
];

const FACTCHECK_PATTERNS = [
  /\b(fact.?check|fact.?checks|debunk|verify|verified|misinformation|hoax)\b/i,
  /\b(is it true|did .* really)\b/i,
];

const NEWS_PATTERNS = [
  /\b(breaking|headline|coverage|reported|reuters|associated press)\b/i,
];

function matches(query: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(query));
}

/**
 * Compute richer intent signals plus a suggested vertical.
 * The vertical hint is a *suggestion* — the UI may show it as the default
 * selection but the user can switch.
 */
export function detectIntent(query: string): QueryIntent {
  const isCurrent = matches(query, CURRENT_PATTERNS);
  const isStats = matches(query, STATS_PATTERNS);
  const isHistorical = matches(query, HISTORICAL_PATTERNS);
  const isPerson = matches(query, PERSON_PATTERNS);
  const isImage = matches(query, IMAGE_PATTERNS);
  const isAcademic = matches(query, ACADEMIC_PATTERNS);
  const isLegal = matches(query, LEGAL_PATTERNS);
  const isGovernment = matches(query, GOV_PATTERNS);
  const isFactCheck = matches(query, FACTCHECK_PATTERNS);
  const isDefinition = matches(query, DEFINITION_PATTERNS);
  const isChart = matches(query, CHART_PATTERNS);
  const isNews = matches(query, NEWS_PATTERNS);

  let needsFreshness = 0.5;
  if (isCurrent || isNews) needsFreshness = 0.95;
  else if (isStats && !isHistorical) needsFreshness = 0.75;
  else if (isHistorical && !isCurrent) needsFreshness = 0.2;
  else if (isPerson || isDefinition) needsFreshness = 0.3;

  // Suggested vertical: precedence reflects how specific the signal is.
  let suggestedVertical: SearchVertical = "all";
  if (isImage) suggestedVertical = "images";
  else if (isPerson) suggestedVertical = "people";
  else if (isChart || isStats) suggestedVertical = "stats";
  else if (isFactCheck) suggestedVertical = "factcheck";
  else if (isAcademic) suggestedVertical = "academic";
  else if (isLegal) suggestedVertical = "government";
  else if (isGovernment) suggestedVertical = "government";
  else if (isCurrent || isNews) suggestedVertical = "news";

  return {
    isCurrent,
    isStats,
    isHistorical,
    isPerson,
    isImage,
    isAcademic,
    isLegal,
    isGovernment,
    isFactCheck,
    isDefinition,
    needsFreshness,
    suggestedVertical,
  };
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
