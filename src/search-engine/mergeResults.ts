import type { RankedResult } from "./types";

/**
 * Merge & deduplicate ranked results from one or more providers.
 *
 * Pass 2: typically only one provider is active at a time, but the structure
 * is in place for Pass 3 (Brave + local custom index).
 *
 * Dedup strategy:
 *   1. Primary key: normalized URL
 *   2. Fallback key: (domain, normalized title)
 *   3. When a duplicate is detected, keep the result with higher finalRankScore
 *      but merge metadata (e.g. fill missing publishedDate from the loser).
 */
export function mergeRankedResults(groups: RankedResult[][]): RankedResult[] {
  const byUrl = new Map<string, RankedResult>();
  const byTitleDomain = new Map<string, RankedResult>();

  const flat = groups.flat();
  for (const incoming of flat) {
    const urlKey = normalizeUrl(incoming.url);
    const titleKey = `${incoming.domain}::${normalizeTitle(incoming.title)}`;

    const existing = byUrl.get(urlKey) ?? byTitleDomain.get(titleKey);

    if (!existing) {
      byUrl.set(urlKey, incoming);
      byTitleDomain.set(titleKey, incoming);
      continue;
    }

    // Pick the higher-ranked, but fill in missing metadata from the loser
    const winner = incoming.finalRankScore > existing.finalRankScore ? incoming : existing;
    const loser = winner === incoming ? existing : incoming;

    const merged: RankedResult = {
      ...winner,
      publishedDate: winner.publishedDate ?? loser.publishedDate,
      fetchedDate: winner.fetchedDate ?? loser.fetchedDate,
      isPaywalled: winner.isPaywalled ?? loser.isPaywalled,
      language: winner.language ?? loser.language,
    };

    byUrl.set(urlKey, merged);
    byTitleDomain.set(titleKey, merged);
  }

  return Array.from(byUrl.values()).sort(
    (a, b) => b.finalRankScore - a.finalRankScore
  );
}

/**
 * Soft per-domain cap to keep one site from monopolizing the result list.
 *
 * Walks the ranked list in score order; for any domain that's already shown
 * `maxPerDomain` times, the next entry from that domain is held back into a
 * "tail" bucket. The tail is appended at the end, preserving score order
 * within itself. Returns a flat list, same length as the input.
 *
 * Defaults: keep up to 3 results per domain in the head section.
 */
export function diversifyByDomain(
  results: RankedResult[],
  maxPerDomain = 3
): RankedResult[] {
  const counts = new Map<string, number>();
  const head: RankedResult[] = [];
  const tail: RankedResult[] = [];
  for (const r of results) {
    const d = r.domain.toLowerCase();
    const seen = counts.get(d) ?? 0;
    if (seen < maxPerDomain) {
      head.push(r);
      counts.set(d, seen + 1);
    } else {
      tail.push(r);
    }
  }
  return [...head, ...tail];
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Strip common tracking params + trailing slashes + fragment
    const stripParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "fbclid", "gclid"];
    for (const p of stripParams) u.searchParams.delete(p);
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[—–‐\-:|·•]/g, " ")
    .trim();
}
