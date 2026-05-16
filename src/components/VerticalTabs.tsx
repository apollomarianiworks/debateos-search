import type { SearchVertical } from "@/providers/types";

const TABS: { label: string; value: SearchVertical }[] = [
  { label: "All",         value: "all" },
  { label: "Web",         value: "web" },
  { label: "Images",      value: "images" },
  { label: "People",      value: "people" },
  { label: "Stats",       value: "stats" },
  { label: "Academic",    value: "academic" },
  { label: "Government",  value: "government" },
  { label: "News",        value: "news" },
  { label: "Fact Checks", value: "factcheck" },
];

interface Props {
  active: SearchVertical;
  onChange: (v: SearchVertical) => void;
}

export function VerticalTabs({ active, onChange }: Props) {
  return (
    <div className="category-tabs" role="tablist" aria-label="Search verticals">
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
