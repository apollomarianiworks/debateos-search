import { useNavigate } from "react-router-dom";
import { SearchBar } from "@/components/SearchBar";
import { useSearch } from "@/hooks/useSearch";
import { useAppStore } from "@/store/appStore";

const EXAMPLE_QUERIES = [
  "minimum wage statistics",
  "climate change economic impact",
  "gun violence data CDC",
  "universal basic income evidence",
  "AI regulation policy",
  "incarceration recidivism rates",
];

export function Home() {
  const navigate = useNavigate();
  const { runSearch } = useSearch();
  const { lastQuery, settings } = useAppStore();

  const showResume =
    settings.restoreLastSession && lastQuery && lastQuery.trim().length > 0;

  return (
    <main className="home">
      <div className="home__corner-nav">
        <button
          type="button"
          className="home__settings-btn"
          onClick={() => navigate("/sources")}
          aria-label="Sources"
          title="Sources"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </button>
        <button
          type="button"
          className="home__settings-btn"
          onClick={() => navigate("/settings")}
          aria-label="Settings"
          title="Settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div className="home__wordmark">
          Debate<span>OS</span>
        </div>
        <p className="home__tagline">
          Credibility-focused research for competitive debate
        </p>
      </div>

      <div className="home__search-wrap">
        <SearchBar large onSearch={(q) => runSearch(q, "all")} autoFocus />
      </div>

      {showResume && (
        <button
          type="button"
          className="home__resume"
          onClick={() => runSearch(lastQuery, "all")}
          title="Continue from your last search"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Continue from <strong>“{lastQuery}”</strong>
        </button>
      )}

      <div className="home__tips">
        {EXAMPLE_QUERIES.map((q) => (
          <button
            key={q}
            className="home__tip-pill"
            onClick={() => runSearch(q, "all")}
          >
            {q}
          </button>
        ))}
      </div>

      <div className="home__footer">
        <span
          className={settings.activeProvider === "brave" ? "home__status home__status--live" : "home__status"}
        >
          {settings.activeProvider === "brave"
            ? settings.braveApiKey
              ? "Brave Search active"
              : "Brave selected, no key — demo mode"
            : "Demo mode active"}
        </span>
      </div>
    </main>
  );
}
