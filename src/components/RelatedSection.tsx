import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { RankedResult } from "@/search-engine/types";
import type { SearchVertical } from "@/providers/types";

interface Props {
  query: string;
  results: RankedResult[];
  vertical: SearchVertical;
}

interface DerivedSets {
  people: { name: string; query: string }[];
  sources: { domain: string; query: string }[];
  related: { label: string; query: string }[];
}

/**
 * Pure derivation — no network calls. Mines the current results for related
 * people, top contributing domains, and intent-derived query refinements.
 */
function derive(query: string, results: RankedResult[], vertical: SearchVertical): DerivedSets {
  // Top person results from the result mix (Wikipedia/Wikidata produce these)
  const seenPerson = new Set<string>();
  const people: DerivedSets["people"] = [];
  for (const r of results) {
    if (r.resultType !== "person") continue;
    if (seenPerson.has(r.title)) continue;
    seenPerson.add(r.title);
    people.push({ name: r.title, query: r.title });
    if (people.length >= 4) break;
  }

  // Top distinct domains, ranked by how often they appear, capped to 4
  const domainCount = new Map<string, number>();
  for (const r of results) {
    domainCount.set(r.domain, (domainCount.get(r.domain) ?? 0) + 1);
  }
  const sources = Array.from(domainCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([domain]) => ({ domain, query: `${query} site:${domain}` }));

  // Intent-derived related search terms
  const related: DerivedSets["related"] = [];
  const lowQ = query.toLowerCase();
  const seedTerms: Array<[string, string]> = [];
  if (vertical !== "stats" && !/(rate|statistics|stats|data)/i.test(query)) {
    seedTerms.push(["statistics", `${query} statistics`]);
  }
  if (vertical !== "news" && !/news|latest|breaking/i.test(query)) {
    seedTerms.push(["latest news", `latest ${query} news`]);
  }
  if (vertical !== "academic" && !/study|research|paper|peer/i.test(query)) {
    seedTerms.push(["research", `${query} research`]);
  }
  if (vertical !== "government" && !/\.gov|government|federal/i.test(lowQ)) {
    seedTerms.push(["government data", `${query} government`]);
  }
  if (vertical !== "factcheck" && !/fact.?check|debunk|verify/i.test(lowQ)) {
    seedTerms.push(["fact checks", `${query} fact check`]);
  }
  if (vertical !== "people" && !/who is|biography/i.test(lowQ)) {
    seedTerms.push(["people", `who is ${query}`]);
  }
  for (const [label, q] of seedTerms.slice(0, 5)) {
    related.push({ label, query: q });
  }

  return { people, sources, related };
}

export function RelatedSection({ query, results, vertical }: Props) {
  const navigate = useNavigate();
  const sets = useMemo(() => derive(query, results, vertical), [query, results, vertical]);

  function go(q: string) {
    navigate(`/results?q=${encodeURIComponent(q)}&v=${vertical}`);
  }

  const hasContent = sets.related.length > 0 || sets.people.length > 0 || sets.sources.length > 0;
  if (!hasContent) return null;

  return (
    <aside className="related-section" aria-label="Related searches">
      {sets.related.length > 0 && (
        <div className="related-group">
          <h4 className="related-group__title">Related searches</h4>
          <div className="related-group__chips">
            {sets.related.map((r) => (
              <button key={r.label} className="related-chip" onClick={() => go(r.query)} title={r.query}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {sets.people.length > 0 && (
        <div className="related-group">
          <h4 className="related-group__title">Related people</h4>
          <div className="related-group__chips">
            {sets.people.map((p) => (
              <button key={p.name} className="related-chip" onClick={() => go(p.query)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {sets.sources.length > 0 && (
        <div className="related-group">
          <h4 className="related-group__title">Top sources in these results</h4>
          <div className="related-group__chips">
            {sets.sources.map((s) => (
              <button
                key={s.domain}
                className="related-chip related-chip--source"
                onClick={() => go(s.query)}
                title={`Search ${s.domain} for "${query}"`}
              >
                {s.domain}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
