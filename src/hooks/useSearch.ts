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
} from "@/providers";
import { LocalIndexProvider, hasDocuments } from "@/local-index";
import {
  normalizeQuery,
  detectIntent,
  rankResults,
  cacheKey,
  cacheLookup,
  cacheStore,
  computeTtl,
  mergeRankedResults,
} from "@/search-engine";
import type { CacheEntry, RankedResult, SearchMode, QueryIntent } from "@/search-engine/types";
import type { ResultsMeta } from "@/store/appStore";

interface HybridSearchContext {
  queryTrimmed: string;
  intent: QueryIntent;
  vertical: SearchVertical;
  pageSize: number;
  safeSearch: boolean;
  mode: SearchMode;
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

      const normalized = normalizeQuery(queryTrimmed);
      const intent = detectIntent(queryTrimmed);

      const { primary, extras } = buildVerticalProviders(vertical, {
        preferred: settings.activeProvider,
        braveApiKey: settings.braveApiKey,
      }, intent, queryTrimmed);

      // Cache key includes vertical and mode so different verticals don't collide.
      const key = cacheKey(
        `${primary.provider.id}+${vertical}+${settings.searchMode}`,
        normalized,
        settings.safeSearch
      );
      const cached = cacheLookup(key);

      if (cached.entry && cached.status !== "expired") {
        setResults({
          results: cached.entry.results,
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
          },
        });
        setLoading(false);

        if (cached.status === "stale") {
          void refreshInBackground(primary.provider, extras, primary.fallbackUsed, primary.reason, {
            queryTrimmed,
            intent,
            vertical,
            pageSize: settings.resultsPerPage,
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
        pageSize: settings.resultsPerPage,
        safeSearch: settings.safeSearch,
        mode: settings.searchMode,
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
            results: cached.entry.results,
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
      p.search({
        query: ctx.queryTrimmed,
        vertical: ctx.vertical,
        pageSize: ctx.pageSize,
        safeSearch: ctx.safeSearch,
      }).then((response) => ({
        id: p.id,
        name: response.provider,
        results: rankResults(response.results, ctx.queryTrimmed, ctx.intent, response.provider, ctx.mode),
        totalEstimated: response.totalEstimated,
        durationMs: response.durationMs,
      })).then((run) => {
        recordProviderSuccess(p.id, run.name, run.results.length);
        return run;
      }).catch((err) => {
        recordProviderError(p.id, p.name, err);
        throw err;
      });

    const tasks: Promise<ProviderRun>[] = [runProvider(primaryProvider)];
    for (const e of extras) tasks.push(runProvider(e));
    if (includeLocal) tasks.push(runProvider(new LocalIndexProvider()));

    const settled = await Promise.allSettled(tasks);
    const successful = settled
      .filter((s): s is PromiseFulfilledResult<ProviderRun> => s.status === "fulfilled")
      .map((s) => s.value);

    const primarySettled = settled[0];
    let webErrorMessage: string | undefined;
    if (primarySettled.status === "rejected") {
      if (successful.length === 0) throw primarySettled.reason;
      webErrorMessage = friendlyError(primarySettled.reason);
    }

    const merged = mergeRankedResults(successful.map((s) => s.results));
    const resultLimit = Math.max(15, Math.min(30, ctx.pageSize * 2));
    const filtered = filterByVertical(merged, ctx.vertical).slice(0, resultLimit);

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
