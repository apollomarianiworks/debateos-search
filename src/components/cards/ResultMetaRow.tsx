import type { RankedResult } from "@/search-engine/types";

interface Props {
  result: RankedResult;
}

function formatDate(s?: string): string | undefined {
  if (!s) return undefined;
  // Already a year, e.g. "2024" — pass through
  if (/^\d{4}$/.test(s)) return s;
  const ts = Date.parse(s);
  if (Number.isNaN(ts)) return undefined;
  const d = new Date(ts);
  const today = new Date();
  if (d.getFullYear() === today.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Compact strip rendered under the snippet on Web/Dataset cards.
 * Shows: provider name · published date · key metadata from the result type.
 *
 * Kept narrow: max ~3 chips so it never wraps to two rows on the common case.
 */
export function ResultMetaRow({ result }: Props) {
  const chips: string[] = [];

  if (result.provider && result.provider !== result.domain) {
    chips.push(`via ${result.provider}`);
  }

  const date = formatDate(result.publishedDate) ?? formatDate(result.fetchedDate);
  if (date && !result.freshnessLabel) {
    chips.push(date);
  }

  if (result.resultType === "dataset") {
    if (result.organization) chips.push(result.organization);
    if (result.formats && result.formats.length > 0) {
      chips.push(result.formats.slice(0, 3).join(" / "));
    }
  }

  if (result.resultType === "image" && result.width && result.height) {
    chips.push(`${result.width}×${result.height}`);
  }

  if (chips.length === 0) return null;

  return (
    <div className="result-meta-row">
      {chips.map((chip, i) => (
        <span key={i} className="result-meta-row__chip">
          {chip}
        </span>
      ))}
    </div>
  );
}
