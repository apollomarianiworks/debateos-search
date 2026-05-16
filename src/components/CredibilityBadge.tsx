interface Props {
  score: number;
}

function credColor(score: number): string {
  if (score >= 85) return "var(--cred-high)";
  if (score >= 60) return "var(--cred-mid)";
  return "var(--cred-low)";
}

function credLabel(score: number): string {
  if (score >= 90) return "Highly credible";
  if (score >= 75) return "Credible";
  if (score >= 60) return "Moderate";
  return "Low credibility";
}

export function CredibilityBadge({ score }: Props) {
  const color = credColor(score);
  const label = credLabel(score);

  return (
    <div className="cred-meter" title={`Credibility: ${score}/100 — ${label}`}>
      <div className="cred-meter__bar">
        <div
          className="cred-meter__fill"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <span className="cred-meter__label">{score}</span>
    </div>
  );
}
