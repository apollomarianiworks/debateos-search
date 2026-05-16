import { useNavigate } from "react-router-dom";
import type { RankedResult } from "@/search-engine/types";
import type { ImageResult } from "@/providers/types";

type ImageRanked = RankedResult & ImageResult;

export function ImageResultCard({ result }: { result: ImageRanked }) {
  const navigate = useNavigate();
  const pageUrl = result.pageUrl ?? result.url;

  function openInViewer() {
    const params = new URLSearchParams({
      url: pageUrl,
      title: result.title,
      domain: result.domain,
    });
    navigate(`/viewer?${params.toString()}`);
  }

  return (
    <article
      className="img-card"
      onClick={openInViewer}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && openInViewer()}
      title={result.title}
    >
      <div className="img-card__thumb-wrap">
        <img
          className="img-card__thumb"
          src={result.thumbnailUrl ?? result.imageUrl}
          alt={result.title}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = "0.2";
          }}
        />
      </div>
      <div className="img-card__caption">
        <div className="img-card__title">{result.title}</div>
        <div className="img-card__domain">{result.domain}</div>
      </div>
    </article>
  );
}
