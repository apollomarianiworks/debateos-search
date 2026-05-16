import type { RankExplanation } from "@/search-engine/types";

interface Props {
  explanation: RankExplanation;
}

interface Row {
  label: string;
  value: number;
  max: number;
  hint: string;
  sign?: "+" | "-";
}

export function RankDetails({ explanation }: Props) {
  const rows: Row[] = [
    {
      label: "Relevance",
      value: explanation.relevance,
      max: 100,
      hint: "How closely the title and snippet match your query.",
    },
    {
      label: "Credibility",
      value: explanation.credibility,
      max: 100,
      hint: "Trust score based on the source domain.",
    },
    {
      label: "Freshness",
      value: explanation.freshness,
      max: 100,
      hint: "How recently this was published, weighted by query intent.",
    },
    {
      label: "Source priority",
      value: explanation.sourceTypePriority,
      max: 100,
      hint: "Government → Academic → Stats → Legal → Fact-check → News → Web.",
    },
  ];

  if (explanation.exactMatchBonus > 0) {
    rows.push({
      label: "Exact-phrase bonus",
      value: explanation.exactMatchBonus,
      max: 30,
      hint: "Added when your phrase appears verbatim.",
      sign: "+",
    });
  }
  if (explanation.qualityPenalty > 0) {
    rows.push({
      label: "Quality penalty",
      value: explanation.qualityPenalty,
      max: 30,
      hint: "Applied for very short snippets or low-quality domains.",
      sign: "-",
    });
  }

  return (
    <div className="rank-details" role="region" aria-label="Ranking breakdown">
      <div className="rank-details__rows">
        {rows.map((r) => (
          <div className="rank-details__row" key={r.label} title={r.hint}>
            <span className="rank-details__label">{r.label}</span>
            <span className="rank-details__bar-wrap">
              <span
                className={`rank-details__bar${r.sign === "-" ? " rank-details__bar--penalty" : ""}`}
                style={{ width: `${(r.value / r.max) * 100}%` }}
              />
            </span>
            <span className="rank-details__value">
              {r.sign ?? ""}
              {r.value}
            </span>
          </div>
        ))}
      </div>
      <div className="rank-details__final">
        <span>Final score</span>
        <strong>{explanation.finalScore}</strong>
      </div>
    </div>
  );
}
