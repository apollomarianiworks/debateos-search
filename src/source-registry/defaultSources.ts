import type { Source } from "./types";

/**
 * Default curated source list — kept small and high-quality on purpose.
 * Users can add their own trusted sources in Settings.
 */
function def(
  id: string,
  name: string,
  domain: string,
  url: string,
  sourceType: Source["sourceType"],
  tier: Source["credibilityTier"],
  tags: string[],
  notes?: string
): Source {
  return {
    id,
    name,
    domain,
    url,
    sourceType,
    credibilityTier: tier,
    enabled: true,
    isCustom: false,
    addedAt: 0,
    tags,
    notes,
  };
}

export const DEFAULT_SOURCES: Source[] = [
  // ── Government / Statistics ───────────────────────────────────
  def("bls", "Bureau of Labor Statistics", "bls.gov", "https://www.bls.gov/", "statistics", 1, ["statistics", "labor", "economy", "us"]),
  def("census", "U.S. Census Bureau", "census.gov", "https://www.census.gov/", "statistics", 1, ["statistics", "demographics", "us"]),
  def("cdc", "Centers for Disease Control", "cdc.gov", "https://www.cdc.gov/", "statistics", 1, ["health", "statistics", "us"]),
  def("cbo", "Congressional Budget Office", "cbo.gov", "https://www.cbo.gov/", "government", 1, ["budget", "economy", "policy"]),
  def("gao", "Government Accountability Office", "gao.gov", "https://www.gao.gov/", "government", 1, ["oversight", "audit", "policy"]),
  def("nih", "National Institutes of Health", "nih.gov", "https://www.nih.gov/", "statistics", 1, ["health", "science", "us"]),
  def("epa", "Environmental Protection Agency", "epa.gov", "https://www.epa.gov/", "government", 1, ["environment", "policy", "us"]),
  def("bjs", "Bureau of Justice Statistics", "bjs.ojp.gov", "https://bjs.ojp.gov/", "statistics", 1, ["criminal-justice", "statistics", "us"]),
  def("federalreserve", "Federal Reserve", "federalreserve.gov", "https://www.federalreserve.gov/", "government", 1, ["economy", "monetary-policy", "us"]),

  // ── International ─────────────────────────────────────────────
  def("imf", "International Monetary Fund", "imf.org", "https://www.imf.org/", "statistics", 1, ["economy", "international"]),
  def("worldbank", "World Bank Open Data", "worldbank.org", "https://data.worldbank.org/", "statistics", 1, ["development", "economy", "international"]),
  def("oecd", "OECD", "oecd.org", "https://www.oecd.org/", "statistics", 1, ["economy", "policy", "international"]),
  def("un", "United Nations", "un.org", "https://www.un.org/", "government", 2, ["international", "policy"]),
  def("who", "World Health Organization", "who.int", "https://www.who.int/", "statistics", 1, ["health", "international"]),
  def("iea", "International Energy Agency", "iea.org", "https://www.iea.org/", "statistics", 1, ["energy", "climate", "international"]),

  // ── Academic / Research ───────────────────────────────────────
  def("brookings", "Brookings Institution", "brookings.edu", "https://www.brookings.edu/research/", "academic", 2, ["policy", "research", "think-tank"]),
  def("rand", "RAND Corporation", "rand.org", "https://www.rand.org/", "academic", 2, ["policy", "research", "think-tank"]),
  def("pewresearch", "Pew Research Center", "pewresearch.org", "https://www.pewresearch.org/", "academic", 2, ["polling", "demographics", "research"]),
  def("kff", "KFF (health policy)", "kff.org", "https://www.kff.org/", "academic", 2, ["health", "policy", "research"]),
  def("nber", "National Bureau of Economic Research", "nber.org", "https://www.nber.org/", "academic", 2, ["economy", "research"]),
  def("urban", "Urban Institute", "urban.org", "https://www.urban.org/", "academic", 2, ["policy", "research", "social"]),
  def("hai-stanford", "Stanford HAI", "hai.stanford.edu", "https://hai.stanford.edu/research", "academic", 2, ["ai", "research", "policy"]),

  // ── Fact-check ────────────────────────────────────────────────
  def("politifact", "PolitiFact", "politifact.com", "https://www.politifact.com/", "factcheck", 2, ["fact-check", "politics"]),
  def("factcheck-org", "FactCheck.org", "factcheck.org", "https://www.factcheck.org/", "factcheck", 2, ["fact-check", "politics"]),
  def("snopes", "Snopes", "snopes.com", "https://www.snopes.com/", "factcheck", 3, ["fact-check"]),
  def("fullfact", "Full Fact (UK)", "fullfact.org", "https://fullfact.org/", "factcheck", 2, ["fact-check", "uk"]),

  // ── News (established / wire services) ────────────────────────
  def("reuters", "Reuters", "reuters.com", "https://www.reuters.com/", "news", 2, ["news", "wire"]),
  def("apnews", "Associated Press", "apnews.com", "https://apnews.com/", "news", 2, ["news", "wire"]),
  def("bbc", "BBC News", "bbc.com", "https://www.bbc.com/news", "news", 2, ["news", "international"]),
  def("npr", "NPR", "npr.org", "https://www.npr.org/", "news", 2, ["news", "us"]),
  def("propublica", "ProPublica", "propublica.org", "https://www.propublica.org/", "news", 2, ["investigative", "news"]),

  // ── Legal / Court / Legislation ───────────────────────────────
  def("congress-gov", "Congress.gov", "congress.gov", "https://www.congress.gov/", "legal", 1, ["legislation", "us"]),
  def("courtlistener", "CourtListener", "courtlistener.com", "https://www.courtlistener.com/", "legal", 2, ["court", "case-law"]),
  def("justia", "Justia", "justia.com", "https://www.justia.com/", "legal", 2, ["law", "case-law"]),

  // ── Economics & Data ──────────────────────────────────────────
  def("fred", "FRED (St. Louis Fed)", "fred.stlouisfed.org", "https://fred.stlouisfed.org/", "statistics", 1, ["economy", "data", "us"]),
  def("opensecrets", "OpenSecrets", "opensecrets.org", "https://www.opensecrets.org/", "factcheck", 2, ["campaign-finance", "transparency"]),
  def("eia", "Energy Information Administration", "eia.gov", "https://www.eia.gov/", "statistics", 1, ["energy", "statistics", "us"]),
  def("ssa-stat", "Social Security Administration Statistics", "ssa.gov", "https://www.ssa.gov/policy/", "statistics", 1, ["retirement", "social-policy", "us"]),

  // ── Crime / Justice ───────────────────────────────────────────
  def("fbi-ucr", "FBI Crime Data Explorer", "cde.ucr.cjis.gov", "https://cde.ucr.cjis.gov/", "statistics", 1, ["crime", "fbi", "us"]),
  def("nces", "National Center for Education Statistics", "nces.ed.gov", "https://nces.ed.gov/", "statistics", 1, ["education", "statistics", "us"]),

  // ── Health ────────────────────────────────────────────────────
  def("cms", "Centers for Medicare & Medicaid Services", "cms.gov", "https://www.cms.gov/", "government", 1, ["health", "insurance", "us"]),
  def("pubmed", "PubMed (NIH)", "pubmed.ncbi.nlm.nih.gov", "https://pubmed.ncbi.nlm.nih.gov/", "academic", 1, ["medicine", "research"]),
  def("nejm", "New England Journal of Medicine", "nejm.org", "https://www.nejm.org/", "academic", 1, ["medicine", "journal"]),
  def("thelancet", "The Lancet", "thelancet.com", "https://www.thelancet.com/", "academic", 1, ["medicine", "journal", "international"]),

  // ── Science ───────────────────────────────────────────────────
  def("nature", "Nature", "nature.com", "https://www.nature.com/", "academic", 1, ["science", "journal"]),
  def("science-mag", "Science (AAAS)", "science.org", "https://www.science.org/", "academic", 1, ["science", "journal"]),
  def("arxiv-org", "arXiv preprints", "arxiv.org", "https://arxiv.org/", "academic", 2, ["preprints", "research"]),
  def("semantic-scholar", "Semantic Scholar", "semanticscholar.org", "https://www.semanticscholar.org/", "academic", 2, ["research", "search"]),

  // ── Encyclopedic / Reference ──────────────────────────────────
  def("wikipedia-en", "Wikipedia (EN)", "en.wikipedia.org", "https://en.wikipedia.org/", "general", 3, ["encyclopedia", "reference"], "User-editable; corroborate with primary sources."),
  def("britannica", "Encyclopædia Britannica", "britannica.com", "https://www.britannica.com/", "general", 2, ["encyclopedia", "reference"]),
  def("merriam-webster", "Merriam-Webster", "merriam-webster.com", "https://www.merriam-webster.com/", "general", 2, ["dictionary", "definitions"]),
  def("wikidata", "Wikidata", "wikidata.org", "https://www.wikidata.org/", "general", 2, ["structured-data", "reference"]),
  def("open-library", "Open Library", "openlibrary.org", "https://openlibrary.org/", "general", 2, ["books", "authors", "reference"]),
  def("internet-archive", "Internet Archive", "archive.org", "https://archive.org/", "general", 2, ["books", "media", "archives"]),

  // ── Open Data Portals ─────────────────────────────────────────
  def("data-gov", "Data.gov", "data.gov", "https://data.gov/", "statistics", 1, ["open-data", "us"]),
  def("data-europa", "data.europa.eu", "data.europa.eu", "https://data.europa.eu/", "statistics", 1, ["open-data", "eu"]),

  // ── Legal additional ──────────────────────────────────────────
  def("oyez", "Oyez (Supreme Court audio + opinions)", "oyez.org", "https://www.oyez.org/", "legal", 2, ["supreme-court", "us"]),
  def("scotus-blog", "SCOTUSblog", "scotusblog.com", "https://www.scotusblog.com/", "legal", 2, ["supreme-court", "analysis"]),
  def("federal-register", "Federal Register", "federalregister.gov", "https://www.federalregister.gov/", "legal", 1, ["regulations", "us"]),

  // ── Fact-check additional ─────────────────────────────────────
  def("apfactcheck", "AP Fact Check", "apnews.com", "https://apnews.com/hub/ap-fact-check", "factcheck", 1, ["fact-check", "wire"]),
  def("reuters-fc", "Reuters Fact Check", "reuters.com", "https://www.reuters.com/fact-check/", "factcheck", 1, ["fact-check", "wire"]),
];
