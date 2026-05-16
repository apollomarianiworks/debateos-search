import type { SourceType } from "@/providers/types";

/**
 * Curated tier-based credibility map. Entries override TLD-based scoring.
 * Scores are 0-100. Use sparingly — prefer rule-based scoring for most domains.
 */

// Tier 1: Official statistical agencies, top scientific journals (95)
const TIER_1: Record<string, number> = {
  // U.S. federal statistics & health
  "bls.gov": 98,
  "census.gov": 98,
  "cdc.gov": 97,
  "nih.gov": 97,
  "nist.gov": 96,
  "cbo.gov": 96,
  "gao.gov": 96,
  "fda.gov": 95,
  "epa.gov": 94,
  "energy.gov": 93,
  "treasury.gov": 93,
  "federalreserve.gov": 95,
  "ssa.gov": 93,
  "bjs.ojp.gov": 95,
  "nij.ojp.gov": 94,
  // International institutions
  "imf.org": 93,
  "worldbank.org": 93,
  "oecd.org": 92,
  "un.org": 90,
  "who.int": 92,
  "europa.eu": 90,
  "ec.europa.eu": 90,
  "iea.org": 91,
  "fao.org": 91,
  // Peer-reviewed publishers
  "nature.com": 95,
  "science.org": 95,
  "sciencedirect.com": 88,
  "nejm.org": 95,
  "thelancet.com": 95,
  "bmj.com": 92,
  "pnas.org": 93,
  "cell.com": 92,
  "jamanetwork.com": 92,
  "plos.org": 88,
  "arxiv.org": 78,
  "ssrn.com": 72,
};

// Tier 2: Top academic/research institutions, top think tanks (85)
const TIER_2: Record<string, number> = {
  "harvard.edu": 90,
  "mit.edu": 90,
  "stanford.edu": 90,
  "yale.edu": 88,
  "princeton.edu": 88,
  "columbia.edu": 87,
  "berkeley.edu": 88,
  "uchicago.edu": 87,
  "ox.ac.uk": 90,
  "cam.ac.uk": 90,
  "lse.ac.uk": 87,
  "rand.org": 88,
  "brookings.edu": 86,
  "pewresearch.org": 88,
  "kff.org": 87,
  "epi.org": 80,
  "aei.org": 78,
  "heritage.org": 76,
  "cato.org": 78,
  "urban.org": 84,
  "nber.org": 86,
  "fas.org": 82,
};

// Tier 3: Major fact-checkers (high credibility, narrower scope)
const TIER_3_FACTCHECK: Record<string, number> = {
  "politifact.com": 86,
  "factcheck.org": 88,
  "snopes.com": 80,
  "fullfact.org": 86,
  "apnews.com/hub/ap-fact-check": 88,
  "reuters.com/fact-check": 88,
  "leadstories.com": 70,
  "afp.com/en/afp-services/fact-check": 84,
  "washingtonpost.com/news/fact-checker": 82,
  "deathpenaltyinfo.org": 82,
  "opensecrets.org": 85,
};

// Tier 4: Established wire services & quality newspapers (70-78)
const TIER_4_NEWS: Record<string, number> = {
  "reuters.com": 84,
  "apnews.com": 84,
  "bbc.com": 80,
  "bbc.co.uk": 80,
  "npr.org": 76,
  "pbs.org": 78,
  "nytimes.com": 76,
  "washingtonpost.com": 75,
  "wsj.com": 78,
  "ft.com": 80,
  "theguardian.com": 72,
  "economist.com": 80,
  "bloomberg.com": 76,
  "axios.com": 70,
  "propublica.org": 84,
  "theatlantic.com": 70,
  "newyorker.com": 70,
  "vox.com": 64,
  "politico.com": 70,
  "thehill.com": 64,
  "abcnews.go.com": 68,
  "cbsnews.com": 68,
  "nbcnews.com": 68,
  "cnn.com": 64,
  "foxnews.com": 58,
  "usatoday.com": 66,
  "latimes.com": 70,
};

// Tier 5: User-generated content / forums (35-50)
const TIER_5_UGC: Record<string, number> = {
  "reddit.com": 42,
  "quora.com": 38,
  "stackexchange.com": 60,
  "stackoverflow.com": 70,
  "medium.com": 45,
  "substack.com": 45,
  "tumblr.com": 30,
  "x.com": 30,
  "twitter.com": 30,
  "facebook.com": 30,
  "tiktok.com": 25,
  "instagram.com": 28,
  "youtube.com": 45,
};

// Tier 6: Known content farms / low quality (15-30)
const TIER_6_LOW: Record<string, number> = {
  "ehow.com": 25,
  "answers.com": 25,
  "wikihow.com": 40,
  "buzzfeed.com": 35,
  "dailymail.co.uk": 32,
  "thesun.co.uk": 30,
  "nypost.com": 40,
  "infowars.com": 5,
  "naturalnews.com": 8,
  "breitbart.com": 25,
  "rt.com": 18,
  "sputniknews.com": 15,
};

const HIGH_TIER_REFERENCE: Record<string, number> = {
  "wikipedia.org": 68,
  "en.wikipedia.org": 68,
  "britannica.com": 80,
  "merriam-webster.com": 80,
  "scholar.google.com": 78,
};

// Combined lookup. Last write wins; ordering doesn't matter since keys are unique.
const DOMAIN_OVERRIDES: Record<string, number> = {
  ...TIER_6_LOW,
  ...TIER_5_UGC,
  ...HIGH_TIER_REFERENCE,
  ...TIER_4_NEWS,
  ...TIER_3_FACTCHECK,
  ...TIER_2,
  ...TIER_1,
};

const TLD_BASE: Array<[RegExp, number]> = [
  // U.S. federal/state government
  [/\.gov(\.[a-z]+)?$/, 92],
  [/\.mil$/, 90],
  // International government TLDs
  [/\.gov\.uk$/, 90],
  [/\.gc\.ca$/, 90],
  [/\.gov\.au$/, 90],
  // Academia
  [/\.edu$/, 78],
  [/\.ac\.uk$/, 80],
  [/\.ac\.[a-z]{2,3}$/, 76],
  // Non-profits / orgs
  [/\.org$/, 60],
  // Default neutral
];

const LOW_QUALITY_PATTERNS = [
  /-blog\./,
  /\.blogspot\./,
  /\.wordpress\./,
  /\.weebly\./,
  /\.wix\./,
];

function lookupExact(domain: string): number | null {
  if (DOMAIN_OVERRIDES[domain] != null) return DOMAIN_OVERRIDES[domain];

  // Match suffix (e.g. blog.brookings.edu → brookings.edu)
  const parts = domain.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const suffix = parts.slice(i).join(".");
    if (DOMAIN_OVERRIDES[suffix] != null) {
      // Subdomain — slight penalty
      return Math.max(40, DOMAIN_OVERRIDES[suffix] - 5);
    }
  }
  return null;
}

function tldScore(domain: string): number | null {
  for (const [rx, score] of TLD_BASE) {
    if (rx.test(domain)) return score;
  }
  return null;
}

/**
 * Compute credibility score (0-100) for a domain.
 *
 * Heuristic order:
 *   1. Exact curated lookup
 *   2. Suffix lookup (subdomain of curated)
 *   3. TLD-based base score (.gov, .edu, .org)
 *   4. Low-quality pattern penalty
 *   5. Neutral default (55) for unknown
 */
export function scoreCredibility(domain: string, sourceType: SourceType): number {
  const lower = domain.toLowerCase();

  const exact = lookupExact(lower);
  if (exact != null) return clamp(exact);

  let score: number | null = tldScore(lower);

  if (score == null) {
    if (LOW_QUALITY_PATTERNS.some((p) => p.test(lower))) {
      score = 38;
    } else {
      score = 55; // neutral unknown
    }
  }

  // Small adjustment based on declared source type when domain is unknown
  if (score === 55) {
    if (sourceType === "factcheck") score = 65;
    else if (sourceType === "academic") score = 65;
    else if (sourceType === "statistics") score = 68;
    else if (sourceType === "government") score = 80;
  }

  return clamp(score);
}

/**
 * Infer or refine a source type from the domain.
 * Provider-supplied sourceType is honored unless the domain strongly disagrees.
 */
export function inferSourceType(domain: string, fallback: SourceType): SourceType {
  const lower = domain.toLowerCase();

  if (/\.gov(\.[a-z]+)?$|\.mil$|\.gc\.ca$|\.gov\.uk$|\.gov\.au$/.test(lower)) {
    if (/bls|census|cdc|bjs|nij/.test(lower)) return "statistics";
    return "government";
  }
  if (/\.edu$|\.ac\.uk$|\.ac\.[a-z]{2,3}$/.test(lower)) return "academic";

  if (/(politifact|factcheck|snopes|fullfact|leadstories|fact-check)/.test(lower)) {
    return "factcheck";
  }
  if (/(bls|census|cdc|nih|cbo|imf|worldbank|oecd|pewresearch)/.test(lower)) {
    return "statistics";
  }
  if (/(rand|brookings|kff|nber|epi|urban|aei|cato|heritage)/.test(lower)) {
    return "academic";
  }
  if (
    /(reuters|apnews|bbc|npr|nytimes|washingtonpost|wsj|theguardian|bloomberg|economist|ft|cnn|foxnews|nbcnews|cbsnews|abcnews|usatoday|axios|politico|propublica|theatlantic)/.test(lower)
  ) {
    return "news";
  }
  if (/(law|legal|courtlistener|supremecourt|justia|findlaw|congress)/.test(lower)) {
    return "legal";
  }

  return fallback;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
