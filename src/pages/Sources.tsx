import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listSources,
  setEnabled,
  addCustomSource,
  removeCustomSource,
  classifyDomain,
  indexSource,
} from "@/source-registry";
import { getProviderCatalog, listProviderHealth } from "@/providers";
import { SOURCE_PACKS } from "@/source-registry/sourcePacks";
import type { Source, CredibilityTier } from "@/source-registry/types";
import { getStats, clearLocalIndex, removeDocumentsBySource } from "@/local-index";
import type { SourceType } from "@/providers/types";
import { useAppStore } from "@/store/appStore";

interface IndexStatus {
  state: "idle" | "indexing" | "ok" | "error";
  message?: string;
}

function formatRelative(ts?: number): string {
  if (!ts) return "Never indexed";
  const ageMin = (Date.now() - ts) / 60_000;
  if (ageMin < 1) return "just now";
  if (ageMin < 60) return `${Math.round(ageMin)} min ago`;
  const ageHr = ageMin / 60;
  if (ageHr < 24) return `${Math.round(ageHr)}h ago`;
  const ageDay = ageHr / 24;
  if (ageDay < 30) return `${Math.round(ageDay)}d ago`;
  return new Date(ts).toLocaleDateString();
}

const SOURCE_TYPES: SourceType[] = ["government", "statistics", "academic", "legal", "factcheck", "news", "general"];

export function Sources() {
  const navigate = useNavigate();
  const [sources, setSources] = useState<Source[]>(() => listSources());
  const [providerHealth, setProviderHealth] = useState(() => listProviderHealth());
  const [indexStatus, setIndexStatus] = useState<Record<string, IndexStatus>>({});
  const [stats, setStats] = useState(() => getStats());
  const indexingInFlight = useAppStore((s) => s.indexingInFlight);
  const setIndexingFlag = useAppStore((s) => s.setIndexing);
  const settings = useAppStore((s) => s.settings);
  const [filter, setFilter] = useState<"all" | SourceType>("all");
  const [search, setSearch] = useState("");

  // Form for adding custom source
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newType, setNewType] = useState<SourceType>("general");
  const [newTier, setNewTier] = useState<CredibilityTier>(3);
  const [addError, setAddError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setSources(listSources());
    setProviderHealth(listProviderHealth());
    setStats(getStats());
  }, []);

  // Auto-classify when URL changes
  useEffect(() => {
    if (newUrl) {
      try {
        const domain = new URL(newUrl).hostname.replace(/^www\./, "").toLowerCase();
        const guess = classifyDomain(domain);
        setNewType(guess.sourceType);
        setNewTier(guess.tier);
      } catch {
        // ignore
      }
    }
  }, [newUrl]);

  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    return sources.filter((s) => {
      if (filter !== "all" && s.sourceType !== filter) return false;
      if (!lower) return true;
      return (
        s.name.toLowerCase().includes(lower) ||
        s.domain.toLowerCase().includes(lower) ||
        s.tags.some((t) => t.includes(lower))
      );
    });
  }, [sources, filter, search]);

  async function handleIndex(source: Source) {
    // Hard-guard: don't start a second index while one is already running for this source.
    if (indexingInFlight.has(source.id)) return;

    setIndexingFlag(source.id, true);
    setIndexStatus((s) => ({ ...s, [source.id]: { state: "indexing" } }));
    try {
      const result = await indexSource(source);
      setIndexStatus((s) => ({
        ...s,
        [source.id]: result.ok
          ? { state: "ok", message: result.message }
          : { state: "error", message: result.message },
      }));
      refresh();
      if (result.ok) {
        setTimeout(() => {
          setIndexStatus((s) => {
            const next = { ...s };
            delete next[source.id];
            return next;
          });
        }, 4000);
      }
    } finally {
      setIndexingFlag(source.id, false);
    }
  }

  function handleToggle(source: Source, enabled: boolean) {
    setEnabled(source.id, enabled);
    refresh();
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const result = addCustomSource({
      name: newName.trim() || newUrl,
      url: newUrl.trim(),
      sourceType: newType,
      credibilityTier: newTier,
    });
    if (!result.ok) {
      setAddError(result.error);
      return;
    }
    setNewName("");
    setNewUrl("");
    setShowAddForm(false);
    refresh();
  }

  function handleRemove(source: Source) {
    if (!source.isCustom) return;
    removeDocumentsBySource(source.id);
    removeCustomSource(source.id);
    refresh();
  }

  function handleClearIndex() {
    clearLocalIndex();
    refresh();
  }

  const enabledCount = sources.filter((s) => s.enabled).length;
  const indexedCount = sources.filter((s) => s.lastIndexedAt).length;
  const providers = getProviderCatalog({
    preferred: settings.activeProvider,
    braveApiKey: settings.braveApiKey,
  });

  return (
    <div className="page">
      <header className="topbar">
        <button
          className="topbar__logo"
          onClick={() => navigate(-1)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "var(--color-accent)",
            letterSpacing: "-0.5px",
          }}
        >
          ← DebateOS
        </button>
        <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--color-text-primary)" }}>
          Sources
        </span>
      </header>

      <div className="container settings-page">
        <div className="sources-stats">
          <div className="sources-stat">
            <div className="sources-stat__value">{enabledCount}</div>
            <div className="sources-stat__label">Active sources</div>
          </div>
          <div className="sources-stat">
            <div className="sources-stat__value">{indexedCount}</div>
            <div className="sources-stat__label">Indexed</div>
          </div>
          <div className="sources-stat">
            <div className="sources-stat__value">{stats.documentCount}</div>
            <div className="sources-stat__label">Documents</div>
          </div>
          <div className="sources-stat">
            <div className="sources-stat__value">{stats.domainCount}</div>
            <div className="sources-stat__label">Domains</div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section__title">Source packs</div>
          <div className="sources-toolbar" style={{ gap: 8, alignItems: "stretch" }}>
            {SOURCE_PACKS.map((pack) => (
              <div
                key={pack.id}
                className="provider-tag"
                title={`${pack.description} Providers: ${pack.providerIds.join(", ")}`}
                style={{ padding: "8px 10px", whiteSpace: "normal", lineHeight: 1.35 }}
              >
                <strong>{pack.name}</strong>
                <span style={{ marginLeft: 6, color: "var(--color-text-tertiary)" }}>
                  {pack.sourceIds.length} sources, {pack.providerIds.length} providers
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section__title">Search providers</div>
          <div className="sources-list">
            {providers.map((provider) => {
              const health = providerHealth[provider.id];
              const lastStatus = health?.lastError
                ? `Error: ${health.lastError.slice(0, 90)}`
                : health?.lastSuccessAt
                  ? `${health.lastResultCount ?? 0} result${health.lastResultCount === 1 ? "" : "s"} last query`
                  : "Not run yet";
              return (
                <div key={provider.id} className={`source-row${provider.enabled ? "" : " source-row--disabled"}`}>
                  <div className="source-row__main">
                    <div className="source-row__title">
                      <span className="source-row__name">{provider.name}</span>
                      <span className={`badge badge--${provider.enabled ? "government" : "general"}`}>
                        {provider.enabled ? "Enabled" : "Disabled"}
                      </span>
                      {provider.keyRequired && <span className="badge badge--custom">Key required</span>}
                    </div>
                    <div className="source-row__domain">
                      {provider.verticals.join(", ")}
                    </div>
                    <div className="source-row__meta">
                      <span>{lastStatus}</span>
                      {health?.lastSuccessAt && (
                        <>
                          <span>·</span>
                          <span title={new Date(health.lastSuccessAt).toLocaleString()}>
                            success {formatRelative(health.lastSuccessAt)}
                          </span>
                        </>
                      )}
                    </div>
                    {provider.note && <div className="form-hint">{provider.note}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sources-toolbar">
          <input
            type="search"
            className="form-input sources-search"
            placeholder="Search sources…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="form-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | SourceType)}
            style={{ maxWidth: 180 }}
          >
            <option value="all">All types</option>
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>{prettyType(t)}</option>
            ))}
          </select>
          <button className="btn btn--primary" onClick={() => setShowAddForm(true)}>
            + Add source
          </button>
        </div>

        {showAddForm && (
          <form className="settings-section sources-add-form" onSubmit={handleAdd}>
            <div className="settings-section__title">Add a trusted source</div>
            <div className="form-group">
              <label className="form-label" htmlFor="new-source-url">URL</label>
              <input
                id="new-source-url"
                type="url"
                className="form-input"
                placeholder="https://example.org/"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                required
                autoFocus
              />
              <p className="form-hint">
                Pick a starting URL you want indexed. We&apos;ll detect the source type from the domain.
              </p>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="new-source-name">Display name (optional)</label>
              <input
                id="new-source-name"
                type="text"
                className="form-input"
                placeholder="e.g. Library of Congress"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label className="form-label" htmlFor="new-source-type">Source type</label>
                <select
                  id="new-source-type"
                  className="form-select"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as SourceType)}
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>{prettyType(t)}</option>
                  ))}
                </select>
              </div>
              <div style={{ width: 160 }}>
                <label className="form-label" htmlFor="new-source-tier">Credibility tier</label>
                <select
                  id="new-source-tier"
                  className="form-select"
                  value={newTier}
                  onChange={(e) => setNewTier(Number(e.target.value) as CredibilityTier)}
                >
                  <option value={1}>Tier 1 — official</option>
                  <option value={2}>Tier 2 — strong</option>
                  <option value={3}>Tier 3 — neutral</option>
                  <option value={4}>Tier 4 — weak</option>
                  <option value={5}>Tier 5 — low</option>
                </select>
              </div>
            </div>
            {addError && <p className="form-hint form-hint--error">{addError}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button type="submit" className="btn btn--primary">Add source</button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => { setShowAddForm(false); setAddError(null); }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="sources-list">
          {filtered.length === 0 && (
            <div className="empty-state" style={{ padding: "48px 24px" }}>
              <div className="empty-state__title">No matching sources</div>
              <div className="empty-state__body">Try a different filter or add a custom source.</div>
            </div>
          )}
          {filtered.map((source) => {
            const status = indexStatus[source.id];
            const isIndexing = indexingInFlight.has(source.id) || status?.state === "indexing";
            return (
              <div key={source.id} className={`source-row${source.enabled ? "" : " source-row--disabled"}`}>
                <div className="source-row__main">
                  <div className="source-row__title">
                    <span className="source-row__name">{source.name}</span>
                    <span className={`badge badge--${source.sourceType}`}>{prettyType(source.sourceType)}</span>
                    {source.isCustom && <span className="badge badge--custom">Custom</span>}
                  </div>
                  <div className="source-row__domain">{source.domain}</div>
                  <div className="source-row__meta">
                    <span>Tier {source.credibilityTier}</span>
                    <span>·</span>
                    <span title={source.lastIndexedAt ? new Date(source.lastIndexedAt).toLocaleString() : ""}>
                      {formatRelative(source.lastIndexedAt)}
                    </span>
                    {source.lastError && (
                      <>
                        <span>·</span>
                        <span className="source-row__error" title={source.lastError}>
                          last error: {source.lastError.slice(0, 60)}
                        </span>
                      </>
                    )}
                  </div>
                  {status && (
                    <div className={`source-row__status source-row__status--${status.state}`}>
                      {status.state === "indexing" && "Indexing…"}
                      {status.state === "ok" && `✓ ${status.message}`}
                      {status.state === "error" && `✕ ${status.message}`}
                    </div>
                  )}
                </div>
                <div className="source-row__actions">
                  <label className="toggle-switch" title={source.enabled ? "Enabled" : "Disabled"}>
                    <input
                      type="checkbox"
                      checked={source.enabled}
                      onChange={(e) => handleToggle(source, e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                  <button
                    className="btn btn--ghost"
                    onClick={() => handleIndex(source)}
                    disabled={isIndexing || !source.enabled}
                    title={!source.enabled ? "Enable this source first" : "Fetch + index this source"}
                  >
                    {isIndexing ? "Indexing…" : "Index"}
                  </button>
                  {source.isCustom && (
                    <button
                      className="btn btn--ghost"
                      onClick={() => handleRemove(source)}
                      title="Remove this custom source"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {stats.documentCount > 0 && (
          <div className="settings-section" style={{ marginTop: 24 }}>
            <div className="settings-section__title">Local index</div>
            <p className="form-hint" style={{ marginBottom: 12 }}>
              {stats.documentCount} document{stats.documentCount === 1 ? "" : "s"} from {stats.domainCount} domain{stats.domainCount === 1 ? "" : "s"} · {Math.round(stats.totalBytes / 1024)} KB indexed.
            </p>
            <button className="btn btn--ghost" onClick={handleClearIndex}>
              Clear all indexed documents
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function prettyType(t: SourceType): string {
  switch (t) {
    case "government": return "Government";
    case "statistics": return "Statistics";
    case "academic":   return "Academic";
    case "legal":      return "Legal";
    case "factcheck":  return "Fact-check";
    case "news":       return "News";
    case "general":    return "General";
    default:           return t;
  }
}
