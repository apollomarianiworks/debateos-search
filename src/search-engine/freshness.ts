import type { QueryIntent } from "./types";

/**
 * Score how fresh a result is for the given query intent.
 * Returns 0-100. Higher is fresher.
 *
 * Curves are stair-stepped (not exponential decay) so scores are
 * easy to reason about in the UI.
 */
export function scoreFreshness(
  publishedDate: string | undefined,
  fetchedDate: string | undefined,
  intent: QueryIntent
): number {
  const dateStr = publishedDate ?? fetchedDate;

  if (!dateStr) {
    // No date info — neutral, slightly suppressed for current-intent queries
    if (intent.needsFreshness >= 0.85) return 28;
    if (intent.needsFreshness >= 0.6) return 42;
    return 55;
  }

  const ts = Date.parse(dateStr);
  if (Number.isNaN(ts)) return 50;

  const ageDays = (Date.now() - ts) / 86_400_000;

  if (intent.needsFreshness >= 0.85) {
    // News / breaking — sharp decay
    if (ageDays <= 1) return 100;
    if (ageDays <= 3) return 92;
    if (ageDays <= 7) return 84;
    if (ageDays <= 14) return 70;
    if (ageDays <= 30) return 55;
    if (ageDays <= 90) return 32;
    if (ageDays <= 180) return 18;
    if (ageDays <= 365) return 10;
    return 4;
  }

  if (intent.needsFreshness >= 0.6) {
    // Stats / data — recent but tolerant
    if (ageDays <= 7) return 100;
    if (ageDays <= 30) return 92;
    if (ageDays <= 90) return 80;
    if (ageDays <= 180) return 68;
    if (ageDays <= 365) return 55;
    if (ageDays <= 730) return 38;
    if (ageDays <= 1825) return 22;
    return 12;
  }

  if (intent.needsFreshness <= 0.3) {
    // Historical / conceptual — only severely old content suffers
    if (ageDays <= 365) return 90;
    if (ageDays <= 1825) return 78;
    if (ageDays <= 3650) return 65;
    return 50;
  }

  // Balanced default
  if (ageDays <= 30) return 95;
  if (ageDays <= 180) return 82;
  if (ageDays <= 365) return 70;
  if (ageDays <= 1095) return 55;
  if (ageDays <= 1825) return 40;
  return 25;
}

export function freshnessLabel(publishedDate?: string, fetchedDate?: string): string | undefined {
  const dateStr = publishedDate ?? fetchedDate;
  if (!dateStr) return undefined;
  const ts = Date.parse(dateStr);
  if (Number.isNaN(ts)) return undefined;

  const ageDays = (Date.now() - ts) / 86_400_000;
  if (ageDays < 1) return "today";
  if (ageDays < 7) return "this week";
  if (ageDays < 30) return "this month";
  if (ageDays < 90) return "this quarter";
  if (ageDays < 365) return "this year";
  if (ageDays < 1095) return `${Math.round(ageDays / 365)} years ago`;
  return "older";
}
