import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "@/hooks/useSettings";
import { cacheClearAll } from "@/search-engine";
import { UpdatesSection } from "@/components/UpdatesSection";

function openExternal(url: string) {
  if (typeof window !== "undefined" && (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    import("@tauri-apps/plugin-shell")
      .then(({ open }) => open(url))
      .catch(() => window.open(url, "_blank"));
  } else {
    window.open(url, "_blank");
  }
}

type TestStatus =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "ok"; message: string }
  | { state: "error"; message: string };

export function Settings() {
  const navigate = useNavigate();
  const { settings, saveSettings, testBraveKey } = useSettings();

  const [braveKey, setBraveKey] = useState(settings.braveApiKey);
  const [provider, setProvider] = useState<"mock" | "brave">(settings.activeProvider);
  const [safeSearch, setSafeSearch] = useState(settings.safeSearch);
  const [resultsPerPage, setResultsPerPage] = useState(settings.resultsPerPage);
  const [restoreLastSession, setRestoreLastSession] = useState(settings.restoreLastSession);
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>({ state: "idle" });
  const [cacheCleared, setCacheCleared] = useState(false);

  async function handleSave() {
    await saveSettings({
      braveApiKey: braveKey.trim(),
      activeProvider: provider,
      safeSearch,
      resultsPerPage,
      restoreLastSession,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  async function handleTestKey() {
    setTestStatus({ state: "testing" });
    const result = await testBraveKey(braveKey);
    setTestStatus(
      result.ok
        ? { state: "ok", message: result.message }
        : { state: "error", message: result.message }
    );
    // If the key works and the user is still on "mock", surface a one-click
    // suggestion to switch — common gotcha that previously caused "real
    // search not working" reports.
    if (result.ok && provider === "mock") {
      setProvider("brave");
    }
  }

  function handleUseDemoMode() {
    setProvider("mock");
    void saveSettings({ activeProvider: "mock" });
    navigate("/");
  }

  function handleClearCache() {
    cacheClearAll();
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 1800);
  }

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
          Settings
        </span>
      </header>

      <div className="container settings-page">
        <div className="settings-section">
          <div className="settings-section__title">Search Provider</div>

          <div className="form-group">
            <label className="form-label" htmlFor="provider-select">
              Active provider
            </label>
            <select
              id="provider-select"
              className="form-select"
              value={provider}
              onChange={(e) => setProvider(e.target.value as "mock" | "brave")}
            >
              <option value="mock">No-key public sources</option>
              <option value="brave">Brave Search API (live web search)</option>
            </select>
            <p className="form-hint">
              No-key mode searches public providers like Wikipedia, arXiv, OpenAlex,
              Crossref, Data.gov, World Bank, CourtListener, Open Library, and GDELT.
              Demo results are only used if live public providers fail.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="brave-key">
              Brave Search API key
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="brave-key"
                type="password"
                className="form-input"
                value={braveKey}
                onChange={(e) => {
                  setBraveKey(e.target.value);
                  setTestStatus({ state: "idle" });
                }}
                placeholder="BSA…"
                autoComplete="off"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn--ghost"
                onClick={handleTestKey}
                disabled={testStatus.state === "testing"}
              >
                {testStatus.state === "testing" ? "Testing…" : "Test key"}
              </button>
            </div>

            {testStatus.state === "ok" && (
              <p className="form-hint form-hint--success">✓ {testStatus.message}</p>
            )}
            {testStatus.state === "error" && (
              <p className="form-hint form-hint--error">✕ {testStatus.message}</p>
            )}

            <p className="form-hint">
              Get a free key at{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  openExternal("https://brave.com/search/api/");
                }}
              >
                brave.com/search/api
              </a>
              . Keys are stored locally and only sent to Brave's API endpoint.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn--secondary" onClick={handleUseDemoMode}>
              Use no-key public sources
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section__title">Search preferences</div>

          <div className="form-group">
            <div className="form-toggle">
              <div>
                <div className="form-label" style={{ marginBottom: 0 }}>
                  Safe search
                </div>
                <p className="form-hint" style={{ marginTop: 2 }}>
                  Filter explicit content from results
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={safeSearch}
                  onChange={(e) => setSafeSearch(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          <div className="form-group">
            <div className="form-toggle">
              <div>
                <div className="form-label" style={{ marginBottom: 0 }}>
                  Restore last session
                </div>
                <p className="form-hint" style={{ marginTop: 2 }}>
                  Show a "Continue from your last search" link on the homepage
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={restoreLastSession}
                  onChange={(e) => setRestoreLastSession(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="results-per-page">
              Results per page
            </label>
            <select
              id="results-per-page"
              className="form-select"
              value={resultsPerPage}
              onChange={(e) => setResultsPerPage(Number(e.target.value))}
              style={{ maxWidth: 160 }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section__title">Trusted sources & local index</div>
          <p className="form-hint" style={{ marginBottom: 12 }}>
            Manage which curated sources are enabled, add your own trusted sources, and index pages
            into the local search index. Local matches appear alongside web results during search.
          </p>
          <button className="btn btn--primary" onClick={() => navigate("/sources")}>
            Open sources manager →
          </button>
        </div>

        <UpdatesSection />

        <div className="settings-section">
          <div className="settings-section__title">Local cache</div>
          <p className="form-hint" style={{ marginBottom: 12 }}>
            Search results are cached locally so repeat queries are instant.
            Cached entries expire automatically based on the type of query.
          </p>
          <button className="btn btn--ghost" onClick={handleClearCache}>
            {cacheCleared ? "✓ Cache cleared" : "Clear search cache"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn btn--primary" onClick={handleSave}>
            {saved ? "✓ Saved" : "Save settings"}
          </button>
          <button className="btn btn--ghost" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
