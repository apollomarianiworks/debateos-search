import type { SourceType } from "@/providers/types";

export interface SourcePack {
  id: string;
  name: string;
  description: string;
  sourceTypes: SourceType[];
  sourceIds: string[];
  providerIds: string[];
}

export const SOURCE_PACKS: SourcePack[] = [
  {
    id: "government",
    name: "Government",
    description: "Official U.S. agencies, regulations, oversight, and public records.",
    sourceTypes: ["government", "legal"],
    sourceIds: ["gao", "cbo", "epa", "congress-gov", "federal-register", "data-gov"],
    providerIds: ["data-gov", "census", "federal-register", "courtlistener"],
  },
  {
    id: "statistics",
    name: "Statistics",
    description: "Official statistics, datasets, indicators, and public-use data catalogs.",
    sourceTypes: ["statistics"],
    sourceIds: ["bls", "census", "cdc", "worldbank", "fred", "data-gov", "data-europa"],
    providerIds: ["data-gov", "world-bank", "census", "cdc-data"],
  },
  {
    id: "crime",
    name: "Crime",
    description: "Crime, courts, justice, incarceration, and law enforcement data.",
    sourceTypes: ["statistics", "legal", "government"],
    sourceIds: ["fbi-ucr", "bjs", "courtlistener"],
    providerIds: ["courtlistener", "data-gov"],
  },
  {
    id: "health",
    name: "Health",
    description: "Public health, medical research, health policy, and CDC datasets.",
    sourceTypes: ["statistics", "academic", "government"],
    sourceIds: ["cdc", "nih", "cms", "pubmed", "kff", "who"],
    providerIds: ["cdc-data", "openalex", "crossref", "semantic-scholar"],
  },
  {
    id: "economics",
    name: "Economics",
    description: "Economic indicators, labor, inflation, budgets, and fiscal policy.",
    sourceTypes: ["statistics", "academic", "government"],
    sourceIds: ["bls", "fred", "federalreserve", "cbo", "imf", "worldbank", "oecd", "nber"],
    providerIds: ["world-bank", "data-gov", "openalex", "crossref"],
  },
  {
    id: "education",
    name: "Education",
    description: "Education statistics, research papers, and institutional datasets.",
    sourceTypes: ["statistics", "academic", "government"],
    sourceIds: ["nces", "pewresearch", "urban", "data-gov"],
    providerIds: ["data-gov", "openalex", "crossref", "semantic-scholar"],
  },
  {
    id: "legal",
    name: "Legal",
    description: "Case law, Supreme Court material, legislation, and regulations.",
    sourceTypes: ["legal", "government"],
    sourceIds: ["courtlistener", "oyez", "congress-gov", "federal-register", "justia", "scotus-blog"],
    providerIds: ["courtlistener", "federal-register"],
  },
  {
    id: "academic",
    name: "Academic",
    description: "Papers, preprints, DOIs, authors, institutions, and citations.",
    sourceTypes: ["academic"],
    sourceIds: ["arxiv-org", "semantic-scholar", "pubmed", "nature", "science-mag", "nber"],
    providerIds: ["arxiv", "openalex", "crossref", "semantic-scholar"],
  },
  {
    id: "people",
    name: "People/biography",
    description: "Biographical reference, entity lookup, authors, and public profiles.",
    sourceTypes: ["general", "academic", "news"],
    sourceIds: ["wikipedia-en", "wikidata", "britannica", "open-library"],
    providerIds: ["wikipedia", "wikidata", "openalex", "open-library"],
  },
  {
    id: "images-media",
    name: "Images/media",
    description: "Reference images, media archives, books, documents, and historical media.",
    sourceTypes: ["general", "news"],
    sourceIds: ["wikipedia-en", "internet-archive", "reuters", "apnews"],
    providerIds: ["wikipedia", "brave-images", "internet-archive", "open-library"],
  },
  {
    id: "factchecking",
    name: "Fact-checking",
    description: "Fact-checking organizations and current claim/context lookups.",
    sourceTypes: ["factcheck", "news"],
    sourceIds: ["politifact", "factcheck-org", "apfactcheck", "reuters-fc", "fullfact", "snopes"],
    providerIds: ["gdelt", "brave"],
  },
  {
    id: "international",
    name: "International data",
    description: "International organizations, global indicators, and non-U.S. context.",
    sourceTypes: ["statistics", "government", "news"],
    sourceIds: ["worldbank", "imf", "oecd", "un", "who", "data-europa", "bbc"],
    providerIds: ["world-bank", "gdelt", "openalex"],
  },
];
