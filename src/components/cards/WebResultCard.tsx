import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RankedResult } from "@/search-engine/types";
import { SourceBadge } from "../SourceBadge";
import { CredibilityBadge } from "../CredibilityBadge";
import { RankDetails } from "../RankDetails";
import { ResultMetaRow } from "./ResultMetaRow";

function faviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export function WebResultCard({ result }: { result: RankedResult }) {
  const [showDetails, setShowDetails] = useState(false);
  const navigate = useNavigate();

  function openInViewer() {
    const params = new URLSearchParams({
      url: result.url,
      title: result.title,
      domain: result.domain,
    });
    navigate(`/viewer?${params.toString()}`);
  }

  return (
    <article className="result-card">
      <div className="result-card__meta">
        <div className="result-card__domain">
          <img
            className="result-card__favicon"
            src={faviconUrl(result.domain)}
            alt=""
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          {result.domain}
        </div>
        <SourceBadge sourceType={result.sourceType} />
        {result.freshnessLabel && <span className="badge badge--freshness">{result.freshnessLabel}</span>}
        {result.isPaywalled && <span className="badge badge--paywall">Paywall</span>}
        {result.resultType === "news" && <span className="badge badge--news">News</span>}
      </div>

      <h3
        className="result-card__title"
        onClick={openInViewer}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && openInViewer()}
      >
        {result.title}
      </h3>

      <div className="result-card__url">{result.displayUrl}</div>
      <p className="result-card__snippet">{result.snippet}</p>

      <ResultMetaRow result={result} />

      <div className="result-card__tags">
        <CredibilityBadge score={result.credibilityScore} />
        <button
          type="button"
          className={`rank-toggle${showDetails ? " rank-toggle--open" : ""}`}
          aria-expanded={showDetails}
          onClick={() => setShowDetails((v) => !v)}
          title="Why this result ranked here"
        >
          <span className="rank-toggle__score">{result.finalRankScore}</span>
          <span className="rank-toggle__label">rank</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={showDetails ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
          </svg>
        </button>
      </div>

      {showDetails && <RankDetails explanation={result.rankExplanation} />}
    </article>
  );
}
