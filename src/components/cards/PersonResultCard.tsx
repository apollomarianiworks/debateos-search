import { useNavigate } from "react-router-dom";
import type { RankedResult } from "@/search-engine/types";
import type { PersonResult } from "@/providers/types";
import { CredibilityBadge } from "../CredibilityBadge";

type PersonRanked = RankedResult & PersonResult;

function formatLifespan(p: PersonResult): string | null {
  if (!p.birthDate && !p.deathDate) return null;
  const b = p.birthDate ? p.birthDate.slice(0, 4) : "?";
  const d = p.deathDate ? p.deathDate.slice(0, 4) : "present";
  return `${b} – ${d}`;
}

export function PersonResultCard({ result }: { result: PersonRanked }) {
  const navigate = useNavigate();
  const lifespan = formatLifespan(result);

  function openInViewer() {
    const params = new URLSearchParams({
      url: result.url,
      title: result.title,
      domain: result.domain,
    });
    navigate(`/viewer?${params.toString()}`);
  }

  return (
    <article className="person-card">
      <div className="person-card__avatar">
        {result.imageUrl ? (
          <img
            src={result.imageUrl}
            alt={result.title}
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="person-card__avatar-fallback">
            {result.title.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      <div className="person-card__body">
        <div className="person-card__head">
          <h3
            className="person-card__name"
            onClick={openInViewer}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && openInViewer()}
          >
            {result.title}
          </h3>
          <CredibilityBadge score={result.credibilityScore} />
        </div>

        {result.occupation && <div className="person-card__role">{result.occupation}</div>}

        {(lifespan || result.nationality) && (
          <div className="person-card__facts">
            {lifespan && <span>{lifespan}</span>}
            {result.nationality && <span>· {result.nationality}</span>}
          </div>
        )}

        <p className="person-card__snippet">{result.snippet}</p>

        {result.knownFor && (
          <div className="person-card__known">
            <strong>Known for:</strong> {result.knownFor}
          </div>
        )}

        <div className="person-card__source">{result.domain}</div>
      </div>
    </article>
  );
}
