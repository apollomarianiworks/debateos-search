import { useNavigate } from "react-router-dom";
import type { RankedResult } from "@/search-engine/types";
import type { ChartResult } from "@/providers/types";
import { CredibilityBadge } from "../CredibilityBadge";

type ChartRanked = RankedResult & ChartResult;

function chartGlyph(type?: ChartResult["chartType"]) {
  const stroke = "currentColor";
  switch (type) {
    case "pie":
      return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
          <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
      );
    case "line":
      return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 17 9 11 13 15 21 7" />
        </svg>
      );
    case "scatter":
      return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7">
          <circle cx="5" cy="18" r="1.5" /><circle cx="9" cy="11" r="1.5" />
          <circle cx="14" cy="14" r="1.5" /><circle cx="18" cy="7" r="1.5" />
          <circle cx="20" cy="17" r="1.5" />
        </svg>
      );
    case "bar":
    default:
      return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="12" width="4" height="9" rx="1" />
          <rect x="10" y="6" width="4" height="15" rx="1" />
          <rect x="17" y="2" width="4" height="19" rx="1" />
        </svg>
      );
  }
}

export function ChartResultCard({ result }: { result: ChartRanked }) {
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
    <article className="chart-card">
      <div className="chart-card__visual">
        {result.chartImageUrl ? (
          <img src={result.chartImageUrl} alt={result.title} loading="lazy" />
        ) : (
          <div className="chart-card__glyph">{chartGlyph(result.chartType)}</div>
        )}
      </div>
      <div className="chart-card__body">
        <div className="chart-card__meta">
          <span className="badge badge--statistics">Chart</span>
          {result.dataSource && <span className="chart-card__source">{result.dataSource}</span>}
        </div>
        <h3
          className="chart-card__title"
          onClick={openInViewer}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && openInViewer()}
        >
          {result.title}
        </h3>
        <p className="chart-card__snippet">{result.snippet}</p>
        <div className="chart-card__footer">
          <span className="chart-card__domain">{result.domain}</span>
          <CredibilityBadge score={result.credibilityScore} />
        </div>
      </div>
    </article>
  );
}
