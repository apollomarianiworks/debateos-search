import { useNavigate } from "react-router-dom";
import type { RankedResult } from "@/search-engine/types";
import type { DatasetResult } from "@/providers/types";
import { CredibilityBadge } from "../CredibilityBadge";
import { ResultMetaRow } from "./ResultMetaRow";

type DatasetRanked = RankedResult & DatasetResult;

export function DatasetResultCard({ result }: { result: DatasetRanked }) {
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
    <article className="dataset-card">
      <div className="dataset-card__icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14a9 3 0 0 0 18 0V5" />
          <path d="M3 12a9 3 0 0 0 18 0" />
        </svg>
      </div>
      <div className="dataset-card__body">
        <div className="dataset-card__meta">
          <span className="badge badge--statistics">Dataset</span>
          {result.organization && <span className="dataset-card__org">{result.organization}</span>}
          {result.updatedDate && (
            <span className="dataset-card__updated">Updated {result.updatedDate}</span>
          )}
        </div>
        <h3
          className="dataset-card__title"
          onClick={openInViewer}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && openInViewer()}
        >
          {result.title}
        </h3>
        <p className="dataset-card__snippet">{result.snippet}</p>
        <ResultMetaRow result={result} />
        <div className="dataset-card__footer">
          {result.formats && result.formats.length > 0 && (
            <div className="dataset-card__formats">
              {result.formats.map((f) => (
                <span key={f} className="dataset-card__format">{f}</span>
              ))}
            </div>
          )}
          <CredibilityBadge score={result.credibilityScore} />
        </div>
        <div className="dataset-card__domain">{result.domain}</div>
      </div>
    </article>
  );
}
