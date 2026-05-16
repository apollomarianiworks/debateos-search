import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { SearchBar } from "@/components/SearchBar";
import { VerticalTabs } from "@/components/VerticalTabs";
import { ResultCardSwitch } from "@/components/cards/ResultCardSwitch";
import { ResultSkeletons } from "@/components/LoadingSkeletons";
import { ResearchModeToggle } from "@/components/ResearchModeToggle";
import { useSearch } from "@/hooks/useSearch";
import { useSettings } from "@/hooks/useSettings";
import { useAppStore } from "@/store/appStore";
import { ageLabel } from "@/search-engine/cache";
import type { SearchVertical } from "@/providers/types";

function EmptyResults({ query, vertical }: { query: string; vertical: SearchVertical }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <div className="empty-state__title">
        {vertical === "all" ? "No results found" : `No ${vertical} results`}
      </div>
      <div className="empty-state__body">
        No results for <strong>&ldquo;{query}&rdquo;</strong>
        {vertical !== "all" && <> in the <strong>{vertical}</strong> tab</>}.
        Try a different tab or broaden your search terms.
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: "error" | "info"; children: React.ReactNode }) {
  return (
    <div className={tone === "error" ? "error-banner" : "info-banner"} style={{ margin: "16px 0" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

function CacheBadge({ status, ageMs }: { status: string; ageMs: number }) {
  if (status === "miss") return <span className="provider-tag provider-tag--live">Live</span>;
  if (status === "expired") return <span className="provider-tag provider-tag--stale">Cached · {ageLabel(ageMs)} (offline)</span>;
  if (status === "stale") return <span className="provider-tag provider-tag--stale">Cached · {ageLabel(ageMs)} · refreshing</span>;
  return <span className="provider-tag">Cached · {ageLabel(ageMs)}</span>;
}

const PROVIDER_LABELS: Record<string, string> = {
  wikipedia: "Wikipedia",
  wikidata: "Wikidata",
  arxiv: "arXiv",
  openalex: "OpenAlex",
  crossref: "Crossref",
  "semantic-scholar": "Semantic Scholar",
  "data-gov": "Data.gov",
  "world-bank": "World Bank",
  census: "Census",
  "cdc-data": "CDC Data",
  courtlistener: "CourtListener",
  "federal-register": "Federal Register",
  "open-library": "Open Library",
  "internet-archive": "Internet Archive",
  gdelt: "GDELT",
  "brave-images": "Brave Images",
  local: "Local Index",
};

export function Results() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { runSearch, changeVertical } = useSearch();
  const { settings, saveSettings } = useSettings();

  const { results, isLoading, isRefreshing, error, meta, activeVertical, query, hasSearched } =
    useAppStore();

  const urlQuery = searchParams.get("q") ?? "";
  const urlVertical = (searchParams.get("v") ?? searchParams.get("cat") ?? "all") as SearchVertical;

  useEffect(() => {
    if (urlQuery && urlQuery !== query) {
      runSearch(urlQuery, urlVertical);
    }
  }, [urlQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleResults = useMemo(() => results, [results]);

  function handleModeChange(nextMode: "standard" | "research") {
    if (nextMode === settings.searchMode) return;
    void saveSettings({ searchMode: nextMode });
    if (query) runSearch(query, activeVertical);
  }

  const isImageGrid = activeVertical === "images";

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="topbar__logo">DebateOS</Link>
        <div className="topbar__search">
          <SearchBar
            initialValue={query || urlQuery}
            onSearch={(q) => runSearch(q, activeVertical)}
          />
        </div>
        <nav className="topbar__nav">
          <button className="nav-link-btn" onClick={() => navigate("/sources")}>Sources</button>
          <button className="nav-link-btn" onClick={() => navigate("/settings")}>Settings</button>
        </nav>
      </header>

      <div className="tabs-bar">
        <VerticalTabs active={activeVertical} onChange={changeVertical} />
        <div className="tabs-bar__right">
          <ResearchModeToggle mode={settings.searchMode} onChange={handleModeChange} />
        </div>
      </div>

      <div className="container" style={{ flex: 1 }}>
        {!isLoading && hasSearched && (
          <div className="results-meta">
            <span>
              About {meta.totalEstimated.toLocaleString()} results
              {meta.durationMs > 0 && ` (${(meta.durationMs / 1000).toFixed(2)}s)`}
            </span>
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center", marginLeft: 10, flexWrap: "wrap" }}>
              {meta.provider && <span className="provider-tag">{meta.provider}</span>}
              {meta.providersUsed
                .filter((id) => id !== "local" && PROVIDER_LABELS[id] && PROVIDER_LABELS[id] !== meta.provider)
                .slice(0, 8)
                .map((id) => (
                  <span key={id} className={`provider-tag${id === "wikipedia" ? " provider-tag--wiki" : ""}`}>
                    + {PROVIDER_LABELS[id]}
                  </span>
                ))}
              {meta.providersUsed.length > 9 && (
                <span className="provider-tag">+ {meta.providersUsed.length - 9} more</span>
              )}
              {meta.localResultCount > 0 && (
                <span className="provider-tag provider-tag--local" title={`${meta.localResultCount} match${meta.localResultCount === 1 ? "" : "es"} from your indexed sources`}>
                  +{meta.localResultCount} local
                </span>
              )}
              <CacheBadge status={meta.cacheStatus} ageMs={meta.cacheAgeMs} />
              {isRefreshing && <span className="provider-tag provider-tag--refreshing">Refreshing…</span>}
              {settings.searchMode === "research" && (
                <span className="provider-tag provider-tag--research" title="Research mode boosts trusted sources">Research mode</span>
              )}
            </span>
          </div>
        )}

        {meta.fallbackUsed && meta.fallbackReason && !error && (
          <Banner tone="info">{meta.fallbackReason}</Banner>
        )}

        {meta.webErrorMessage && !meta.fallbackUsed && !error && (
          <Banner tone="info">
            Web search failed — showing results from other sources. {meta.webErrorMessage}
          </Banner>
        )}

        {error && <Banner tone="error">{error}</Banner>}

        {isLoading ? (
          <ResultSkeletons count={6} />
        ) : visibleResults.length === 0 && hasSearched ? (
          <EmptyResults query={query} vertical={activeVertical} />
        ) : (
          <div className={isImageGrid ? "img-grid" : "results-list"}>
            {visibleResults.map((r) => (
              <ResultCardSwitch key={r.id} result={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
