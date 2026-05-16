import type { SourceType } from "@/providers/types";

const SOURCE_META: Record<SourceType, { label: string; icon: string }> = {
  government: { label: "Government", icon: "🏛" },
  academic:   { label: "Academic",   icon: "🎓" },
  news:       { label: "News",       icon: "📰" },
  factcheck:  { label: "Fact Check", icon: "✅" },
  statistics: { label: "Statistics", icon: "📊" },
  legal:      { label: "Legal",      icon: "⚖️" },
  general:    { label: "Web",        icon: "🌐" },
};

interface Props {
  sourceType: SourceType;
}

export function SourceBadge({ sourceType }: Props) {
  const meta = SOURCE_META[sourceType] ?? SOURCE_META.general;
  return (
    <span className={`badge badge--${sourceType}`}>
      {meta.label}
    </span>
  );
}
