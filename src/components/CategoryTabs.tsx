import type { ResultCategory } from "@/providers/types";

const TABS: { label: string; value: ResultCategory }[] = [
  { label: "All", value: "all" },
  { label: "News", value: "news" },
  { label: "Stats", value: "stats" },
  { label: "Academic", value: "academic" },
  { label: "Government", value: "government" },
  { label: "Fact Checks", value: "factcheck" },
];

interface Props {
  active: ResultCategory;
  onChange: (cat: ResultCategory) => void;
}

export function CategoryTabs({ active, onChange }: Props) {
  return (
    <div className="category-tabs" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={active === tab.value}
          className={`category-tab${active === tab.value ? " category-tab--active" : ""}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
