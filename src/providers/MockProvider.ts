import type {
  SearchOptions,
  SearchProvider,
  SearchResponse,
  SearchResult,
  WebResult,
  ImageResult,
  PersonResult,
  StatResult,
  DatasetResult,
} from "./types";

/**
 * MockProvider — returns curated, realistic-looking results across all
 * verticals for development, offline use, and "no API key" demo experience.
 *
 * Result variety is driven by light keyword matching against the query so
 * the demo *feels* like a real multi-vertical engine: searching "Einstein"
 * surfaces a person card + Wikipedia-style web cards; searching "minimum
 * wage" surfaces stat cards + government source cards; searching "pictures
 * of mars" surfaces image cards. Etc.
 *
 * Does NOT compute credibility/freshness/ranking — those belong to the
 * search-engine layer.
 */

const NOW_ISO = () => new Date().toISOString();
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

// ───────────────────────────────────────────────────────────────────────────
// Pools — small curated sets per result type
// ───────────────────────────────────────────────────────────────────────────

const WEB_RESULTS: WebResult[] = [
  {
    id: "mock-web-1",
    resultType: "web",
    title: "Universal Basic Income: Evidence from Global Pilot Programs",
    url: "https://www.brookings.edu/research/universal-basic-income-evidence/",
    displayUrl: "brookings.edu › research › universal-basic-income",
    snippet: "A comprehensive review of 48 UBI pilot programs across 16 countries finds consistent reductions in extreme poverty alongside mixed effects on labor participation.",
    domain: "brookings.edu",
    sourceType: "academic",
    publishedDate: daysAgo(14),
  },
  {
    id: "mock-web-2",
    resultType: "web",
    title: "Climate Change and National Security: A Policy Analysis",
    url: "https://www.rand.org/pubs/research_reports/RRA2109-1.html",
    displayUrl: "rand.org › pubs › research_reports",
    snippet: "Examines how climate-related risks interact with geopolitical tensions. Identifies 34 countries at elevated risk of climate-driven instability through 2035.",
    domain: "rand.org",
    sourceType: "academic",
    publishedDate: daysAgo(8),
  },
  {
    id: "mock-web-3",
    resultType: "web",
    title: "AI Regulation Landscape: EU AI Act Analysis — Stanford HAI",
    url: "https://hai.stanford.edu/research/ai-index-report",
    displayUrl: "hai.stanford.edu › research › ai-index-report",
    snippet: "127 countries have introduced or enacted AI-related legislation. The EU AI Act imposes tiered obligations based on risk level.",
    domain: "hai.stanford.edu",
    sourceType: "academic",
    publishedDate: daysAgo(6),
  },
];

const NEWS_RESULTS: WebResult[] = [
  {
    id: "mock-news-1",
    resultType: "news",
    title: "Federal Reserve Holds Interest Rates Steady Amid Inflation Concerns",
    url: "https://www.reuters.com/markets/us/fed-holds-rates/",
    displayUrl: "reuters.com › markets › us",
    snippet: "The Federal Reserve maintained its benchmark rate, citing persistent inflation pressures. Officials signaled patience on cuts.",
    domain: "reuters.com",
    sourceType: "news",
    publishedDate: daysAgo(1),
  },
  {
    id: "mock-news-2",
    resultType: "news",
    title: "Supreme Court Ruling Reshapes Federal Regulatory Authority",
    url: "https://apnews.com/article/supreme-court-regulatory",
    displayUrl: "apnews.com › article › supreme-court-regulatory",
    snippet: "Decision in major administrative-law case affects how agencies interpret ambiguous statutes — analysts call it the term's most consequential ruling.",
    domain: "apnews.com",
    sourceType: "news",
    publishedDate: daysAgo(3),
  },
];

const FACTCHECK_RESULTS: WebResult[] = [
  {
    id: "mock-fc-1",
    resultType: "web",
    title: "Does School Choice Improve Academic Outcomes? — Fact Check",
    url: "https://www.politifact.com/article/school-choice-outcomes/",
    displayUrl: "politifact.com › article › school-choice-outcomes",
    snippet: "Reviewed 23 peer-reviewed studies on school choice. Voucher programs show modest reading gains (+0.05 SD), no significant math gains.",
    domain: "politifact.com",
    sourceType: "factcheck",
    publishedDate: daysAgo(58),
  },
  {
    id: "mock-fc-2",
    resultType: "web",
    title: "Death Penalty State-by-State Status — Verified",
    url: "https://deathpenaltyinfo.org/state-and-federal-info/state-by-state",
    displayUrl: "deathpenaltyinfo.org › state-and-federal-info",
    snippet: "27 states retain the death penalty. 23 states and DC have abolished it. Executions down 78% from the 1999 peak.",
    domain: "deathpenaltyinfo.org",
    sourceType: "factcheck",
    publishedDate: daysAgo(35),
  },
];

const GOV_RESULTS: WebResult[] = [
  {
    id: "mock-gov-1",
    resultType: "web",
    title: "Immigration's Economic Impact — Congressional Budget Office Report",
    url: "https://www.cbo.gov/publication/60406",
    displayUrl: "cbo.gov › publication › 60406",
    snippet: "CBO projects increased immigration would boost GDP by $8.9 trillion over the next decade and raise federal revenues by $1.2 trillion.",
    domain: "cbo.gov",
    sourceType: "government",
    publishedDate: daysAgo(30),
  },
  {
    id: "mock-gov-2",
    resultType: "web",
    title: "Incarceration Rates and Recidivism — National Institute of Justice",
    url: "https://nij.ojp.gov/topics/articles/recidivism-data",
    displayUrl: "nij.ojp.gov › topics › articles › recidivism-data",
    snippet: "U.S. incarceration rate of 531 per 100,000 is highest among democratic nations. Within 5 years, 76.6% of released prisoners are rearrested.",
    domain: "nij.ojp.gov",
    sourceType: "government",
    publishedDate: daysAgo(28),
  },
];

const STAT_RESULTS: StatResult[] = [
  {
    id: "mock-stat-1",
    resultType: "stat",
    title: "Federal Minimum Wage",
    url: "https://www.bls.gov/opub/reports/minimum-wage/home.htm",
    displayUrl: "bls.gov › opub › reports › minimum-wage",
    snippet: "Federal minimum wage has not changed since 2009. 80,000 workers earn at or below this rate.",
    domain: "bls.gov",
    sourceType: "statistics",
    value: "$7.25",
    metric: "Federal minimum wage per hour",
    unit: "USD / hr",
    year: "2024",
    trend: "flat",
    publishedDate: daysAgo(22),
  },
  {
    id: "mock-stat-2",
    resultType: "stat",
    title: "U.S. Healthcare Spending",
    url: "https://www.cms.gov/data-research/statistics-trends-and-reports/national-health-expenditure-data",
    displayUrl: "cms.gov › statistics-trends-and-reports",
    snippet: "Healthcare spending grew 4.1% to reach $4.5 trillion, or 17.3% of GDP.",
    domain: "cms.gov",
    sourceType: "statistics",
    value: "$13,493",
    metric: "Healthcare spending per capita",
    unit: "USD / person",
    year: "2023",
    trend: "up",
    publishedDate: daysAgo(45),
  },
  {
    id: "mock-stat-3",
    resultType: "stat",
    title: "Gun-Related Deaths in the U.S.",
    url: "https://www.cdc.gov/violenceprevention/firearms/fastfact.html",
    displayUrl: "cdc.gov › violenceprevention › firearms",
    snippet: "Suicides 54%, homicides 43%, unintentional deaths 3%.",
    domain: "cdc.gov",
    sourceType: "statistics",
    value: "48,204",
    metric: "Gun-related deaths per year (US)",
    year: "2022",
    trend: "up",
    publishedDate: daysAgo(5),
  },
  {
    id: "mock-stat-4",
    resultType: "stat",
    title: "Global Renewable Energy Capacity Added",
    url: "https://www.iea.org/reports/world-energy-outlook",
    displayUrl: "iea.org › reports › world-energy-outlook",
    snippet: "Record additions, nearly 50% higher than the previous year. Solar PV accounted for three-quarters of all new capacity.",
    domain: "iea.org",
    sourceType: "statistics",
    value: "507 GW",
    metric: "New global renewable capacity (annual)",
    unit: "gigawatts",
    year: "2023",
    trend: "up",
    publishedDate: daysAgo(12),
  },
];

const DATASET_RESULTS: DatasetResult[] = [
  {
    id: "mock-data-1",
    resultType: "dataset",
    title: "Crime in the United States — FBI UCR Program",
    url: "https://cde.ucr.cjis.gov/",
    displayUrl: "cde.ucr.cjis.gov",
    snippet: "Annual crime statistics reported by 18,000+ law enforcement agencies. Violent and property crime, hate crime, arrests.",
    domain: "cde.ucr.cjis.gov",
    sourceType: "statistics",
    organization: "Federal Bureau of Investigation",
    formats: ["CSV", "JSON", "API"],
    updatedDate: daysAgo(60),
  },
  {
    id: "mock-data-2",
    resultType: "dataset",
    title: "World Bank Open Data — World Development Indicators",
    url: "https://data.worldbank.org/indicator",
    displayUrl: "data.worldbank.org › indicator",
    snippet: "1,400+ indicators across 217 economies covering economy, health, infrastructure, environment.",
    domain: "data.worldbank.org",
    sourceType: "statistics",
    organization: "World Bank",
    formats: ["CSV", "XML", "Excel", "API"],
    updatedDate: daysAgo(15),
  },
];

const PERSON_RESULTS: PersonResult[] = [
  {
    id: "mock-person-1",
    resultType: "person",
    title: "Albert Einstein",
    url: "https://en.wikipedia.org/wiki/Albert_Einstein",
    displayUrl: "en.wikipedia.org › wiki › Albert_Einstein",
    snippet: "Theoretical physicist who developed the theory of relativity, one of the two pillars of modern physics. Nobel Prize in Physics, 1921.",
    domain: "en.wikipedia.org",
    sourceType: "general",
    occupation: "German-born theoretical physicist",
    birthDate: "1879-03-14",
    deathDate: "1955-04-18",
    nationality: "German / American",
    knownFor: "Theory of relativity, E=mc²",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Albert_Einstein_Head.jpg/300px-Albert_Einstein_Head.jpg",
  },
  {
    id: "mock-person-2",
    resultType: "person",
    title: "Ruth Bader Ginsburg",
    url: "https://en.wikipedia.org/wiki/Ruth_Bader_Ginsburg",
    displayUrl: "en.wikipedia.org › wiki › Ruth_Bader_Ginsburg",
    snippet: "Associate Justice of the Supreme Court of the United States from 1993 to 2020. Renowned advocate for gender equality and women's rights.",
    domain: "en.wikipedia.org",
    sourceType: "general",
    occupation: "U.S. Supreme Court Justice",
    birthDate: "1933-03-15",
    deathDate: "2020-09-18",
    nationality: "American",
    knownFor: "Gender equality jurisprudence",
  },
];

const IMAGE_RESULTS: ImageResult[] = [
  {
    id: "mock-img-1",
    resultType: "image",
    title: "Mars surface — NASA Mars Reconnaissance Orbiter",
    url: "https://mars.nasa.gov/resources/26456/",
    displayUrl: "mars.nasa.gov › resources",
    snippet: "High-resolution image of the Martian surface from HiRISE.",
    domain: "mars.nasa.gov",
    sourceType: "government",
    imageUrl: "https://mars.nasa.gov/system/news_items/main_images/9351_PIA25681-web.jpg",
    width: 1200,
    height: 900,
  },
  {
    id: "mock-img-2",
    resultType: "image",
    title: "Earth from the International Space Station",
    url: "https://www.nasa.gov/image-feature/earth-from-the-iss",
    displayUrl: "nasa.gov › image-feature",
    snippet: "View of Earth's atmosphere from low Earth orbit.",
    domain: "nasa.gov",
    sourceType: "government",
    imageUrl: "https://www.nasa.gov/wp-content/uploads/2023/03/iss068e040421.jpg",
    width: 1600,
    height: 1067,
  },
  {
    id: "mock-img-3",
    resultType: "image",
    title: "Hubble Deep Field — Galaxies in the Distant Universe",
    url: "https://hubblesite.org/contents/media/images/2014/01/3306-Image.html",
    displayUrl: "hubblesite.org › contents › media",
    snippet: "10,000+ galaxies in a small patch of sky, captured by Hubble.",
    domain: "hubblesite.org",
    sourceType: "academic",
    imageUrl: "https://hubblesite.org/files/live/sites/hubblesite/files/home/_images/featured-images/_thumbnail-images/hubble-deep-field.jpg",
    width: 2000,
    height: 2000,
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Routing — pick a balanced result set based on query intent
// ───────────────────────────────────────────────────────────────────────────

function lower(s: string): string { return s.toLowerCase(); }

function tokensMatch(query: string, haystack: string): boolean {
  const q = query.toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length === 0) return true;
  return tokens.some((t) => haystack.toLowerCase().includes(t));
}

function filterByQuery<T extends SearchResult>(pool: T[], query: string): T[] {
  return pool.filter((r) => tokensMatch(query, `${r.title} ${r.snippet} ${r.domain}`));
}

function detectMockIntent(query: string) {
  const q = lower(query);
  return {
    isPerson: /^(who (?:is|was|are|were)|biography of)\b/.test(q),
    isImage:  /\b(pictures? of|images? of|photos? of|image of)\b|^(picture|image|photo)\s+of\b/.test(q),
    isStats:  /\b(statistics?|stats|rate|how many|how much|data on)\b/.test(q),
    isGov:    /\b(government|federal|congress|\.gov|cbo|gao|bjs|nij)\b/.test(q),
    isAcad:   /\b(study|research|paper|peer.?reviewed|academic|journal)\b/.test(q),
    isLegal:  /\b(court case|supreme court|ruling|v\.|vs\.)\b/.test(q),
    isFC:     /\b(fact.?check|debunk|verify|is it true)\b/.test(q),
    isNews:   /\b(latest|news|breaking|recent)\b/.test(q),
  };
}

export class MockProvider implements SearchProvider {
  readonly name = "Demo";
  readonly id = "mock";
  readonly isConfigured = true;

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));

    const q = options.query.trim();
    const intent = detectMockIntent(q);
    const vertical = options.vertical ?? options.category ?? "all";

    let pool: SearchResult[] = [];

    // Vertical-specific bias first, then intent, then a sensible default mix.
    switch (vertical) {
      case "images":
        pool = filterByQuery(IMAGE_RESULTS, q);
        if (pool.length === 0) pool = IMAGE_RESULTS.slice();
        break;
      case "people":
        pool = filterByQuery(PERSON_RESULTS, q);
        if (pool.length === 0) pool = PERSON_RESULTS.slice();
        break;
      case "stats":
        pool = [...filterByQuery(STAT_RESULTS, q), ...filterByQuery(DATASET_RESULTS, q), ...filterByQuery(GOV_RESULTS, q)];
        if (pool.length === 0) pool = [...STAT_RESULTS.slice(0, 2), ...DATASET_RESULTS.slice(0, 1)];
        break;
      case "academic":
        pool = filterByQuery(WEB_RESULTS, q).filter((r) => r.sourceType === "academic");
        if (pool.length === 0) pool = WEB_RESULTS.slice();
        break;
      case "government":
        pool = [...filterByQuery(GOV_RESULTS, q), ...filterByQuery(STAT_RESULTS, q)];
        if (pool.length === 0) pool = [...GOV_RESULTS, ...STAT_RESULTS.slice(0, 2)];
        break;
      case "news":
        pool = filterByQuery(NEWS_RESULTS, q);
        if (pool.length === 0) pool = NEWS_RESULTS.slice();
        break;
      case "factcheck":
        pool = filterByQuery(FACTCHECK_RESULTS, q);
        if (pool.length === 0) pool = FACTCHECK_RESULTS.slice();
        break;
      case "web":
        pool = [
          ...filterByQuery(WEB_RESULTS, q),
          ...filterByQuery(GOV_RESULTS, q),
          ...filterByQuery(NEWS_RESULTS, q),
        ];
        if (pool.length === 0) pool = [...WEB_RESULTS, ...GOV_RESULTS.slice(0, 1)];
        break;
      case "all":
      default: {
        // For "all", produce a varied mix biased by intent.
        const mix: SearchResult[] = [];
        if (intent.isPerson) mix.push(...filterByQuery(PERSON_RESULTS, q));
        if (intent.isImage) mix.push(...filterByQuery(IMAGE_RESULTS, q));
        if (intent.isStats || intent.isGov) {
          mix.push(...filterByQuery(STAT_RESULTS, q));
          mix.push(...filterByQuery(DATASET_RESULTS, q));
        }
        if (intent.isFC) mix.push(...filterByQuery(FACTCHECK_RESULTS, q));
        if (intent.isNews) mix.push(...filterByQuery(NEWS_RESULTS, q));
        mix.push(...filterByQuery(WEB_RESULTS, q));
        mix.push(...filterByQuery(GOV_RESULTS, q));

        // Dedup by id and trim
        const seen = new Set<string>();
        for (const r of mix) {
          if (!seen.has(r.id)) {
            seen.add(r.id);
            pool.push(r);
          }
        }

        if (pool.length === 0) {
          pool = [
            ...WEB_RESULTS.slice(0, 3),
            ...STAT_RESULTS.slice(0, 1),
            ...GOV_RESULTS.slice(0, 1),
          ];
        }
        break;
      }
    }

    // Stamp fetchedDate so freshness scoring has something to work with
    const stamped: SearchResult[] = pool.map((r) => ({
      ...r,
      fetchedDate: r.fetchedDate ?? NOW_ISO(),
    }));

    return {
      results: stamped,
      totalEstimated: stamped.length,
      query: q,
      provider: this.name,
      durationMs: Date.now() - start,
    };
  }
}
