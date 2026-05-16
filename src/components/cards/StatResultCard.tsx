import { useNavigate } from "react-router-dom";
import type { RankedResult } from "@/search-engine/types";
import type { StatResult } from "@/providers/types";
import { CredibilityBadge } from "../CredibilityBadge";
import { SourceBadge } from "../SourceBadge";

type StatRanked = RankedResult & StatResult;

function trendIcon(trend?: "up" | "down" | "flat") {
  if (!trend) return null;
  if (trend === "up") return <span className="stat-card__trend stat-card__trend--up">▲</span>;
  if (trend === "down") return <span className="stat-card__trend stat-card__trend--down">▼</span>;
  return <span className="stat-card__trend stat-card__trend--flat">▬</span>;
}

export function StatResultCard({ result }: { result: StatRanked }) {
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
    <article className="stat-card">
      <div className="stat-card__value-wrap">
        <div className="stat-card__value">
          {result.value}
          {trendIcon(result.trend)}
        </div>
        {result.unit && <div className="stat-card__unit">{result.unit}</div>}
        {result.year && <div className="stat-card__year">{result.year}</div>}
      </div>

      <div className="stat-card__body">
        <div className="stat-card__metric">{result.metric}</div>
        <h3
          className="stat-card__title"
          onClick={openInViewer}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && openInViewer()}
        >
          {result.title}
        </h3>
        <p className="stat-card__snippet">{result.snippet}</p>
        <div className="stat-card__meta">
          <SourceBadge sourceType={result.sourceType} />
          <span className="stat-card__domain">{result.domain}</span>
          <CredibilityBadge score={result.credibilityScore} />
        </div>
      </div>
    </article>
  );
}
