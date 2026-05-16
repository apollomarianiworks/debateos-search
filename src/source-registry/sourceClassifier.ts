import type { SourceType } from "@/providers/types";
import type { CredibilityTier } from "./types";

/**
 * Classify a URL/domain into a likely SourceType + credibility tier suggestion.
 * Used when a user adds a custom source so the form can pre-fill sensible defaults.
 */
export function classifyDomain(domain: string): { sourceType: SourceType; tier: CredibilityTier } {
  const d = domain.toLowerCase();

  // Government TLDs
  if (/\.gov(\.[a-z]+)?$|\.mil$|\.gc\.ca$|\.gov\.uk$|\.gov\.au$/.test(d)) {
    if (/(bls|census|cdc|nih|bjs|nij|cbo|fred|stat)/.test(d)) {
      return { sourceType: "statistics", tier: 1 };
    }
    return { sourceType: "government", tier: 1 };
  }

  // Academia
  if (/\.edu$|\.ac\.uk$|\.ac\.[a-z]{2,3}$/.test(d)) {
    return { sourceType: "academic", tier: 2 };
  }

  // Major fact-check brands
  if (/(politifact|factcheck|snopes|fullfact|fact-check)/.test(d)) {
    return { sourceType: "factcheck", tier: 2 };
  }

  // International statistics agencies / NGOs
  if (/(imf|worldbank|oecd|who\.int|iea\.org|un\.org)/.test(d)) {
    return { sourceType: "statistics", tier: 1 };
  }

  // Think tanks / research orgs
  if (/(rand|brookings|kff|nber|epi|urban|aei|cato|heritage|pewresearch)/.test(d)) {
    return { sourceType: "academic", tier: 2 };
  }

  // Legal
  if (/(law|legal|justia|courtlistener|congress|supremecourt|findlaw)/.test(d)) {
    return { sourceType: "legal", tier: 2 };
  }

  // Wire services / major newspapers
  if (
    /(reuters|apnews|bbc|npr|nytimes|washingtonpost|wsj|theguardian|bloomberg|economist|ft\.com|propublica|atlantic|newyorker)/.test(d)
  ) {
    return { sourceType: "news", tier: 2 };
  }

  // .org defaults to general with mid tier
  if (/\.org$/.test(d)) {
    return { sourceType: "general", tier: 3 };
  }

  return { sourceType: "general", tier: 3 };
}
