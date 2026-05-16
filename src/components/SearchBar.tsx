import { useState, type FormEvent, type KeyboardEvent } from "react";

interface Props {
  initialValue?: string;
  large?: boolean;
  onSearch: (query: string) => void;
  autoFocus?: boolean;
}

export function SearchBar({ initialValue = "", large, onSearch, autoFocus }: Props) {
  const [value, setValue] = useState(initialValue);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (value.trim()) onSearch(value.trim());
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") setValue("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`search-bar${large ? " search-bar--large" : ""}`}
    >
      <span className="search-bar__icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>

      <input
        className="search-bar__input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={large ? "Search debates, stats, sources…" : "Search…"}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
      />

      <button type="submit" className="search-bar__btn" aria-label="Search">
        Search
      </button>
    </form>
  );
}
