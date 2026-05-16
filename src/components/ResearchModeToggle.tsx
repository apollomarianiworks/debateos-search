import type { SearchMode } from "@/search-engine/types";

interface Props {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
}

/**
 * Compact segmented control near the results toolbar. Two modes only.
 */
export function ResearchModeToggle({ mode, onChange }: Props) {
  return (
    <div
      className="mode-toggle"
      role="radiogroup"
      aria-label="Search mode"
      title="Research mode boosts government, academic, statistics, legal, and fact-check sources"
    >
      <button
        type="button"
        role="radio"
        aria-checked={mode === "standard"}
        className={`mode-toggle__btn${mode === "standard" ? " mode-toggle__btn--active" : ""}`}
        onClick={() => onChange("standard")}
      >
        Standard
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "research"}
        className={`mode-toggle__btn${mode === "research" ? " mode-toggle__btn--active" : ""}`}
        onClick={() => onChange("research")}
      >
        Research
      </button>
    </div>
  );
}
