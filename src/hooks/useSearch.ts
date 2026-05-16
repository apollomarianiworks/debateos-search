import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/appStore";
import type { SearchVertical, SearchProvider } from "@/providers/types";
import {
  buildVerticalProviders,
  ProviderError,
  isProviderError,
  MockProvider,
  recordProviderError,
  recordProviderSuccess,
  isProviderInCooldown,
  getProviderReliability,
} from "@/providers";
import { LocalIndexProvider, hasDocuments } from "@/local-index";
import {
  normalizeQuery,
  detectIntent,
  planQuery,
  rankResults,
  cacheKey,
  cacheLookup,
  cacheStore,
  computeTtl,
  mergeRankedResults,
  diversifyByDomain,
  resultMatchesOperators,
  variantsForProvider,
} from "@/search-engine";
import type { CacheEntry, RankedResult, SearchMode, QueryIntent, SearchPlan } from "@/search-engine/types";
import type { ResultsMeta } from "@/store/appStore";
import { addQueryToSession, applyPersonalizationBoosts, getPersonalizationProfile } from "@/nextgen/foundation";

interface HybridSearchContext {
  queryTrimmed: string;
  intent: QueryIntent;
  vertical: SearchVertical;
  pageSize: number;
  safeSearch: boolean;
  mode: SearchMode;
  plan: SearchPlan;
}

interface ProviderRun {
  id: string;
  name: string;
  results: RankedResult[];
  totalEstimated: number;
  durationMs: number;
}

interface HybridSearchOutput {
  ranked: RankedResult[];
  totalEstimated: number;
  durationMs: number;
  providersUsed: string[];
  webProviderName: string;
  localResultCount: number;
  webErrorMessage?: string;
}

export function useSearch() {
  const navigate = useNavigate();
  const {
    settings,
    setQuery,
    setActiveVertical,
    setResults,
    setLoading,
    setRefreshing,
    setError,
    rememberQuery,
    addHistoryEntry,
  } = useAppStore();

  const runSearch = useCallback(
    async (rawQuery: string, vertical: SearchVertical = "all") => {
      const queryTrimmed = rawQuery.trim();
      if (!queryTrimmed) return;

      setLoading(true);
      setError(null);
      setQuery(queryTrimmed);
      setActiveVertical(vertical);
      rememberQuery(queryTrimmed);

      navigate(`/results?q=${encodeURIComponent(queryTrimmed)}&v=${vertical}`);

      const plan = planQuery(queryTrimmed, vertical);
      addQueryToSession(queryTrimmed, plan);
      const searchQuery = plan.reasoning.cleaned || plan.operators.cleanQuery;
      const normalized = normalizeQuery(queryTrimmed);
      const intent = detectIntent(searchQuery);

      const { primary, extras } = buildVerticalProviders(vertical, {
        preferred: settings.activeProvider,
        braveApiKey: settings.braveApiKey,
      }, intent, searchQuery, plan.providerIds);

      // Cache key includes vertical and mode so different verticals don't collide.
      const key = cacheKey(
        `${primary.provider.id}+${vertical}+${settings.searchMode}`,
        normalized,
        settings.safeSearch
      );
      const cached = cacheLookup(key);

      if (cached.entry && cached.status !== "expired") {
        setResults({
          results: markCached(cached.entry.results),
          meta: {
            provider: primary.provider.name,
            providersUsed: [primary.provider.id],
            fallbackUsed: primary.fallbackUsed,
            fallbackReason: primary.reason,
            cacheStatus: cached.status,
            cacheAgeMs: cached.ageMs,
            durationMs: cached.entry.durationMs,
            totalEstimated: cached.entry.totalEstimated,
            localResultCount: cached.entry.results.filter((r) => r.provider === "Local Index").length,
            queryPlan: plan,
          },
        });
        setLoading(false);

        if (cached.status === "stale") {
          void refreshInBackground(primary.provider, extras, primary.fallbackUsed, primary.reason, {
            queryTrimmed,
            intent,
            vertical,
            pageSize: Math.max(20, plan.pageSize, settings.resultsPerPage),
            plan,
            safeSearch: settings.safeSearch,
            mode: settings.searchMode,
          }, key, normalized);
        }
        return;
      }

      const ctx: HybridSearchContext = {
        queryTrimmed,
        intent,
        vertical,
        pageSize: Math.max(20, plan.pageSize, settings.resultsPerPage),
        safeSearch: settings.safeSearch,
        mode: settings.searchMode,
        plan,
      };

      try {
        const hybrid = await runHybridSearch(primary.provider, extras, ctx);

        try {
          const entry: CacheEntry = {
            key,
            query: queryTrimmed,
            normalizedQuery: normalized,
            provider: primary.provider.id,
            timestamp: Date.now(),
            ttl: computeTtl(intent),
            intent,
            results: hybrid.ranked,
            totalEstimated: hybrid.totalEstimated,
            durationMs: hybrid.durationMs,
          };
          cacheStore(entry);
        } catch {
          // cache failure should not break the search
        }

        const meta: ResultsMeta = {
          provider: hybrid.webProviderName,
          providersUsed: hybrid.providersUsed,
          fallbackUsed: primary.fallbackUsed,
          fallbackReason: primary.reason,
          webErrorMessage: hybrid.webErrorMessage,
          cacheStatus: "miss",
          cacheAgeMs: 0,
          durationMs: hybrid.durationMs,
          totalEstimated: hybrid.totalEstimated,
          localResultCount: hybrid.localResultCount,
          queryPlan: plan,
        };
        setResults({ results: hybrid.ranked, meta });
        if (hybrid.webErrorMessage) {
          setError(hybrid.webErrorMessage);
        }

        addHistoryEntry({
          id: Date.now(),
          query: queryTrimmed,
          timestamp: Date.now(),
          resultCount: hybrid.ranked.length,
        });
      } catch (err) {
        if (cached.entry) {
          setResults({
            results: markCached(cached.entry.results),
            meta: {
              provider: primary.provider.name,
              providersUsed: [primary.provider.id],
              fallbackUsed: primary.fallbackUsed,
              fallbackReason: primary.reason,
              cacheStatus: "expired",
              cacheAgeMs: cached.ageMs,
              durationMs: cached.entry.durationMs,
              totalEstimated: cached.entry.totalEstimated,
              localResultCount: cached.entry.results.filter((r) => r.provider === "Local Index").length,
              queryPlan: plan,
            },
          });
          setError(friendlyError(err) + " Showing previously cached results.");
        } else if (isProviderError(err) && err.canFallback) {
          await runMockFallback(ctx, err);
        } else {
          setError(friendlyError(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [
      settings,
      navigate,
      setQuery,
      setActiveVertical,
      setResults,
      setLoading,
      setError,
      rememberQuery,
      addHistoryEntry,
    ]
  );

  const changeVertical = useCallback(
    (vertical: SearchVertical) => {
      const { query } = useAppStore.getState();
      if (query) {
        // Re-run search for the new vertical (providers + ranking can differ)
        void runSearch(query, vertical);
      } else {
        setActiveVertical(vertical);
      }
    },
    [runSearch, setActiveVertical]
  );

  /**
   * Hybrid pipeline: run the primary web provider AND any vertical extras
   * AND the local index in parallel, rank each independently, then merge.
   */
  async function runHybridSearch(
    primaryProvider: SearchProvider,
    extras: SearchProvider[],
    ctx: HybridSearchContext
  ): Promise<HybridSearchOutput> {
    const start = Date.now();
    const includeLocal = hasDocuments();

    const runProvider = (p: SearchProvider): Promise<ProviderRun> =>
      runProviderFanout(p, ctx).then((run) => {
        recordProviderSuccess(p.id, run.name, run.results.length);
        return run;
      }).catch((err) => {
        recordProviderError(p.id, p.name, err);
        throw err;
      });

    const runProviderFanout = async (p: SearchProvider, ctx: HybridSearchContext): Promise<ProviderRun> => {
      const variants = variantsForProvider(ctx.plan.reasoning, p.id);
      const pageSize = Math.max(4, Math.ceil(ctx.pageSize / Math.max(1, variants.length)));
      const settled: PromiseSettledResult<{ provider: string; results: RankedResult[]; totalEstimated: number; durationMs: number }>[] = [];
      for (const variant of variants) {
        if (settled.length > 0) await delayMs(variantDelayMs(p.id));
        try {
          const response = await p.search({
            query: variant.query,
            operators: ctx.plan.operators,
            plan: ctx.plan,
            vertical: ctx.vertical,
            pageSize,
            safeSearch: ctx.safeSearch,
          });
          const ranked = rankResults(response.results, variant.query, ctx.intent, response.provider, ctx.mode)
            .map((result) => applyVariantBoost(result, variant.label, variant.boost));
          settled.push({
            status: "fulfilled",
            value: {
              provider: response.provider,
              results: ranked,
              totalEstimated: response.totalEstimated,
              durationMs: response.durationMs,
            },
          });
        } catch (reason) {
          settled.push({ status: "rejected", reason });
          if (isProviderInCooldown(p.id)) break;
        }
      }
      const successful = settled
        .filter((s): s is PromiseFulfilledResult<{ provider: string; results: RankedResult[]; totalEstimated: number; durationMs: number }> => s.status === "fulfilled")
        .map((s) => s.value);
      if (successful.length === 0) {
        const firstError = settled.find((s): s is PromiseRejectedResult => s.status === "rejected")?.reason;
        throw firstError ?? new Error(`${p.name} returned no variant results.`);
      }
      return {
        id: p.id,
        name: successful[0]?.provider ?? p.name,
        results: mergeRankedResults(successful.map((s) => s.results)),
        totalEstimated: successful.reduce((n, s) => n + s.totalEstimated, 0),
        durationMs: Math.max(...successful.map((s) => s.durationMs)),
      };
    };

    // Sort extras by long-term reliability (best first) so the bounded-
    // parallelism runner picks them up in the order most likely to return.
    // Providers currently in cooldown are skipped entirely — they get to
    // recover without us pestering them every search.
    const liveExtras = extras
      .filter((p) => !isProviderInCooldown(p.id))
      .sort((a, b) => getProviderReliability(b.id) - getProviderReliability(a.id));

    // Primary always runs (the user explicitly picked it); local index is
    // free and instant, so it always runs too. Extras compete for the
    // remaining concurrency slots.
    const ordered: SearchProvider[] = [primaryProvider, ...liveExtras];
    if (includeLocal) ordered.push(new LocalIndexProvider());

    // Bounded-parallelism runner: at most 4 outbound provider calls
    // in-flight at any moment. Stops the prior "blast 20+ requests at
    // once" behavior that triggered rate limits.
    const settled = await runWithConcurrencyLimit(ordered, 4, runProvider);
    const successful = settled
      .filter((s): s is PromiseFulfilledResult<ProviderRun> => s.status === "fulfilled")
      .map((s) => s.value);

    const primarySettled = settled[0];
    let webErrorMessage: string | undefined;
    if (primarySettled.status === "rejected") {
      if (successful.length === 0) throw primarySettled.reason;
      webErrorMessage = friendlyError(primarySettled.reason);
    }

    const merged = applyPersonalizationBoosts(
      applyPlanBoosts(mergeRankedResults(successful.map((s) => s.results)), ctx.plan),
      getPersonalizationProfile()
    );
    // Domain diversification keeps any one site from taking the top-N spots;
    // bumped slightly higher for the "all" vertical where we want breadth.
    const maxPerDomain = ctx.vertical === "all" ? 3 : 5;
    const answerable = merged.filter((result) => isAnswerableMatch(result, ctx.plan.reasoning.cleaned));
    const answerableOrFallback = answerable.length >= 3 ? answerable : merged;
    const diversified = diversifyByDomain(answerableOrFallback, maxPerDomain);
    const operatorFiltered = diversified.filter((result) => resultMatchesOperators(result, ctx.plan.operators));
    const resultLimit = Math.max(60, ctx.pageSize * 4);
    const filtered = filterByVertical(operatorFiltered, ctx.vertical).slice(0, resultLimit);

    const primaryHit = successful.find((s) => s.id === primaryProvider.id);
    const localHit = successful.find((s) => s.id === "local");

    const providersUsed = successful.map((s) => s.id);

    return {
      ranked: filtered,
      totalEstimated: successful.reduce((n, s) => n + s.totalEstimated, 0),
      durationMs: Date.now() - start,
      providersUsed,
      webProviderName: primaryHit?.name ?? primaryProvider.name,
      localResultCount: localHit?.results.length ?? 0,
      webErrorMessage,
    };
  }

  async function refreshInBackground(
    primaryProvider: SearchProvider,
    extras: SearchProvider[],
    fallbackUsed: boolean,
    reason: string | undefined,
    ctx: HybridSearchContext,
    key: string,
    normalized: string
  ) {
    setRefreshing(true);
    try {
      const hybrid = await runHybridSearch(primaryProvider, extras, ctx);
      const entry: CacheEntry = {
        key,
        query: ctx.queryTrimmed,
        normalizedQuery: normalized,
        provider: primaryProvider.id,
        timestamp: Date.now(),
        ttl: computeTtl(ctx.intent),
        intent: ctx.intent,
        results: hybrid.ranked,
        totalEstimated: hybrid.totalEstimated,
        durationMs: hybrid.durationMs,
      };
      cacheStore(entry);
      setResults({
        results: hybrid.ranked,
        meta: {
          provider: hybrid.webProviderName,
          providersUsed: hybrid.providersUsed,
          fallbackUsed,
          fallbackReason: reason,
          webErrorMessage: hybrid.webErrorMessage,
          cacheStatus: "miss",
          cacheAgeMs: 0,
          durationMs: hybrid.durationMs,
          totalEstimated: hybrid.totalEstimated,
          localResultCount: hybrid.localResultCount,
          queryPlan: ctx.plan,
        },
      });
    } catch {
      // silent — user already sees stale data
    } finally {
      setRefreshing(false);
    }
  }

  async function runMockFallback(ctx: HybridSearchContext, sourceErr: unknown): Promise<void> {
    try {
      const mock = new MockProvider();
      const hybrid = await runHybridSearch(mock, [], ctx);
      setResults({
        results: hybrid.ranked,
        meta: {
          provider: hybrid.webProviderName,
          providersUsed: hybrid.providersUsed,
          fallbackUsed: true,
          fallbackReason: friendlyError(sourceErr),
          cacheStatus: "miss",
          cacheAgeMs: 0,
          durationMs: hybrid.durationMs,
          totalEstimated: hybrid.totalEstimated,
          localResultCount: hybrid.localResultCount,
          queryPlan: ctx.plan,
        },
      });
      addHistoryEntry({
        id: Date.now(),
        query: ctx.queryTrimmed,
        timestamp: Date.now(),
        resultCount: hybrid.ranked.length,
      });
      setError(friendlyError(sourceErr));
    } catch (mockErr) {
      setError(friendlyError(mockErr));
    }
  }

  return { runSearch, changeVertical };
}

function variantDelayMs(providerId: string): number {
  if (providerId === "nominatim") return 1100;
  if (providerId === "semantic-scholar" || providerId === "gdelt") return 450;
  return 120;
}

function delayMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Filter a merged ranked-result list by vertical.
 * "all" passes everything through. Others narrow by resultType or sourceType.
 */
export function filterByVertical(
  results: RankedResult[],
  vertical: SearchVertical
): RankedResult[] {
  if (vertical === "all") return results;
  return results.filter((r) => {
    switch (vertical) {
      case "web":
        return r.resultType === "web" || r.resultType === "news";
      case "images":
        return r.resultType === "image";
      case "people":
        return r.resultType === "person" ||
          (r.resultType === "web" && r.provider === "Wikipedia");
      case "stats":
        return r.resultType === "stat" ||
          r.resultType === "dataset" ||
          r.resultType === "chart" ||
          r.sourceType === "statistics";
      case "academic":
        return r.sourceType === "academic" || r.provider === "arXiv";
      case "government":
        return r.sourceType === "government" ||
          r.sourceType === "legal" ||
          r.sourceType === "statistics";
      case "news":
        return r.resultType === "news" || r.sourceType === "news";
      case "factcheck":
        return r.sourceType === "factcheck";
      default:
        return true;
    }
  });
}

function friendlyError(err: unknown): string {
  if (err instanceof ProviderError) return err.friendlyMessage;
  if (err instanceof Error) return err.message;
  return "Search failed.";
}

function markCached(results: RankedResult[]): RankedResult[] {
  return results.map((result) => ({
    ...result,
    resultOrigin: result.provider === "Local Index" ? "indexed" : "cached",
  }));
}

function applyPlanBoosts(results: RankedResult[], plan: SearchPlan): RankedResult[] {
  return results
    .map((result) => {
      let boost = 0;
      const reasons = [...result.matchReasons];
      if (plan.routedDomains.some((domain) => result.domain === domain || result.domain.endsWith(`.${domain}`))) {
        boost += 10;
        reasons.push("source-router match");
      }
      if (result.sourceRegistryId && plan.routedSourceIds.includes(result.sourceRegistryId)) {
        boost += 8;
        reasons.push("registered source match");
      }
      if (plan.operators.site && result.domain.endsWith(plan.operators.site)) boost += 12;
      if (plan.operators.source && result.sourceType === plan.operators.source) boost += 8;
      if (boost === 0) return result;
      const finalRankScore = Math.min(100, result.finalRankScore + boost);
      return {
        ...result,
        finalRankScore,
        rankExplanation: { ...result.rankExplanation, finalScore: finalRankScore },
        matchReasons: Array.from(new Set(reasons)).slice(0, 5),
      };
    })
    .sort((a, b) => b.finalRankScore - a.finalRankScore);
}

function applyVariantBoost(
  result: RankedResult,
  label: RankedResult["queryVariantLabel"],
  boost: number
): RankedResult {
  if (!boost) return { ...result, queryVariantLabel: label };
  const finalRankScore = Math.min(100, result.finalRankScore + boost);
  return {
    ...result,
    queryVariantLabel: label,
    finalRankScore,
    rankExplanation: { ...result.rankExplanation, finalScore: finalRankScore },
    matchReasons: Array.from(new Set([...result.matchReasons, `${label} query variant`])).slice(0, 5),
  };
}

const MATCH_STOPWORDS = new Set([
  "what", "who", "when", "where", "why", "how", "that", "this", "with", "from",
  "about", "statistics", "stats", "data", "official", "government", "evidence",
  "research", "study", "last", "year", "people",
]);

const MATCH_EXPANSIONS: Record<string, string[]> = {
  killings: ["death", "deaths", "fatal", "fatality", "fatalities", "shooting", "shootings"],
  killing: ["death", "fatality", "shooting"],
  police: ["officer", "officers", "law enforcement"],
  black: ["african american", "race"],
  crime: ["homicide", "murder", "violent"],
  voting: ["suffrage", "election"],
};

function isAnswerableMatch(result: RankedResult, query: string): boolean {
  if (result.rankExplanation.exactMatchBonus > 0) return true;
  if (result.provider === "Quick Definition") return true;
  if (result.resultType === "person" && result.rankExplanation.relevance >= 10) return true;

  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !MATCH_STOPWORDS.has(token));
  if (tokens.length <= 1) return result.rankExplanation.relevance >= 8;

  const haystack = `${result.title} ${result.snippet} ${result.domain} ${result.url}`.toLowerCase();
  let hits = 0;
  for (const token of tokens) {
    const variants = [token, ...(MATCH_EXPANSIONS[token] ?? [])];
    if (variants.some((variant) => haystack.includes(variant))) hits++;
  }
  const needed = Math.min(2, tokens.length);
  return hits >= needed || result.rankExplanation.relevance >= 22;
}


/**
 * Run an array of items through a worker function with at most `limit`
 * promises in-flight. Preserves index order in the returned settled array
 * so the primary provider stays at index 0 for the caller's benefit.
 */
async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  async function runOne(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        out[idx] = { status: "fulfilled", value: await worker(items[idx]) };
      } catch (err) {
        out[idx] = { status: "rejected", reason: err };
      }
    }
  }

  const lanes = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: lanes }, () => runOne()));
  return out;
}
