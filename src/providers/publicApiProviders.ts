import type {
  DatasetResult,
  PersonResult,
  SearchOptions,
  SearchProvider,
  SearchResponse,
  SearchResult,
  SearchVertical,
  WebResult,
} from "./types";
import { ProviderError } from "./providerErrors";
import { clampLimit, displayUrl, domainFromUrl, platformFetch, stripHtml } from "./http";

function resultUrl(url: string | undefined, fallback: string): string {
  return url && /^https?:\/\//i.test(url) ? url : fallback;
}

function words(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

function containsQuery(text: string, query: string): boolean {
  const tokens = words(query);
  if (tokens.length === 0) return true;
  const lower = text.toLowerCase();
  return tokens.some((t) => lower.includes(t));
}

async function getJson<T>(provider: string, url: URL | string): Promise<T> {
  try {
    const resp = await platformFetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (resp.status === 429) {
      throw new ProviderError("rate_limited", provider, `${provider} rate limit reached.`);
    }
    if (!resp.ok) {
      throw new ProviderError("server", provider, `HTTP ${resp.status}`);
    }
    return (await resp.json()) as T;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new ProviderError("network", provider, detail);
  }
}

function webResult(
  id: string,
  title: string | undefined,
  url: string,
  snippet: string | undefined,
  domainFallback: string,
  sourceType: WebResult["sourceType"],
  publishedDate?: string
): WebResult {
  return {
    id,
    resultType: "web",
    title: title?.trim() || "(untitled)",
    url,
    displayUrl: displayUrl(url),
    snippet: stripHtml(snippet).slice(0, 420) || title || url,
    domain: domainFromUrl(url, domainFallback),
    sourceType,
    publishedDate,
  };
}

function datasetResult(
  id: string,
  title: string | undefined,
  url: string,
  snippet: string | undefined,
  domainFallback: string,
  organization?: string,
  formats?: string[],
  updatedDate?: string
): DatasetResult {
  return {
    id,
    resultType: "dataset",
    title: title?.trim() || "(untitled dataset)",
    url,
    displayUrl: displayUrl(url),
    snippet: stripHtml(snippet).slice(0, 420) || title || url,
    domain: domainFromUrl(url, domainFallback),
    sourceType: "statistics",
    organization,
    formats,
    updatedDate,
    publishedDate: updatedDate,
  };
}

function response(
  provider: string,
  query: string,
  start: number,
  results: SearchResult[],
  totalEstimated = results.length
): SearchResponse {
  return {
    results,
    totalEstimated,
    query,
    provider,
    durationMs: Date.now() - start,
  };
}

interface WikidataSearchResponse {
  search?: Array<{
    id?: string;
    label?: string;
    description?: string;
    url?: string;
  }>;
}

export class WikidataProvider implements SearchProvider {
  readonly name = "Wikidata";
  readonly id = "wikidata";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "people", "web"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.searchParams.set("action", "wbsearchentities");
    url.searchParams.set("search", options.query);
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");
    url.searchParams.set("limit", String(clampLimit(options.pageSize, 4, 8)));

    const data = await getJson<WikidataSearchResponse>(this.name, url);
    const results = (data.search ?? []).map((hit, idx): SearchResult => {
      const qid = hit.id ?? `unknown-${idx}`;
      const entityUrl = `https://www.wikidata.org/wiki/${encodeURIComponent(qid)}`;
      const description = hit.description ?? "";
      if (options.vertical === "people" || /\b(person|politician|scientist|writer|actor|economist|judge|president|author)\b/i.test(description)) {
        const person: PersonResult = {
          id: `wikidata-person-${qid}`,
          resultType: "person",
          title: hit.label ?? qid,
          url: entityUrl,
          displayUrl: `wikidata.org/wiki/${qid}`,
          snippet: description || `Wikidata entity ${qid}`,
          domain: "wikidata.org",
          sourceType: "general",
          occupation: description || undefined,
          wikidataId: qid,
        };
        return person;
      }
      return webResult(`wikidata-${qid}`, hit.label ?? qid, entityUrl, description, "wikidata.org", "general");
    });
    return response(this.name, options.query, start, results);
  }
}

interface OpenAlexResponse {
  meta?: { count?: number };
  results?: Array<{
    id?: string;
    display_name?: string;
    title?: string;
    publication_year?: number;
    publication_date?: string;
    doi?: string;
    cited_by_count?: number;
    primary_location?: { landing_page_url?: string };
    open_access?: { oa_url?: string };
    authorships?: Array<{ author?: { display_name?: string } }>;
    abstract_inverted_index?: Record<string, number[]>;
  }>;
}

function openAlexAbstract(index: Record<string, number[]> | undefined): string {
  if (!index) return "";
  const slots: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) slots.push([pos, word]);
  }
  return slots.sort((a, b) => a[0] - b[0]).map(([, word]) => word).join(" ");
}

export class OpenAlexProvider implements SearchProvider {
  readonly name = "OpenAlex";
  readonly id = "openalex";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "academic", "people", "stats"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("search", options.query);
    url.searchParams.set("per-page", String(clampLimit(options.pageSize, 5, 12)));
    url.searchParams.set("sort", "relevance_score:desc");

    const data = await getJson<OpenAlexResponse>(this.name, url);
    const results = (data.results ?? []).map((work, idx) => {
      const href = resultUrl(work.open_access?.oa_url ?? work.primary_location?.landing_page_url, work.id ?? "https://openalex.org/");
      const authors = (work.authorships ?? [])
        .map((a) => a.author?.display_name)
        .filter(Boolean)
        .slice(0, 4)
        .join(", ");
      const abstract = openAlexAbstract(work.abstract_inverted_index);
      const snippet = [authors, abstract, work.cited_by_count ? `${work.cited_by_count} citations` : ""]
        .filter(Boolean)
        .join(" - ");
      return webResult(
        `openalex-${work.id ?? idx}`,
        work.display_name ?? work.title,
        href,
        snippet,
        "openalex.org",
        "academic",
        work.publication_date ?? (work.publication_year ? String(work.publication_year) : undefined)
      );
    });
    return response(this.name, options.query, start, results, data.meta?.count);
  }
}

interface CrossrefResponse {
  message?: {
    ["total-results"]?: number;
    items?: Array<{
      DOI?: string;
      title?: string[];
      abstract?: string;
      URL?: string;
      publisher?: string;
      issued?: { ["date-parts"]?: number[][] };
      author?: Array<{ given?: string; family?: string }>;
      ["container-title"]?: string[];
    }>;
  };
}

export class CrossrefProvider implements SearchProvider {
  readonly name = "Crossref";
  readonly id = "crossref";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "academic"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const url = new URL("https://api.crossref.org/works");
    url.searchParams.set("query", options.query);
    url.searchParams.set("rows", String(clampLimit(options.pageSize, 5, 10)));
    url.searchParams.set("sort", "relevance");

    const data = await getJson<CrossrefResponse>(this.name, url);
    const results = (data.message?.items ?? []).map((item, idx) => {
      const doiUrl = item.DOI ? `https://doi.org/${item.DOI}` : resultUrl(item.URL, "https://www.crossref.org/");
      const year = item.issued?.["date-parts"]?.[0]?.[0];
      const authors = (item.author ?? [])
        .map((a) => [a.given, a.family].filter(Boolean).join(" "))
        .filter(Boolean)
        .slice(0, 4)
        .join(", ");
      const snippet = [authors, item["container-title"]?.[0], item.publisher, item.abstract].filter(Boolean).join(" - ");
      return webResult(`crossref-${item.DOI ?? idx}`, item.title?.[0], doiUrl, snippet, "doi.org", "academic", year ? String(year) : undefined);
    });
    return response(this.name, options.query, start, results, data.message?.["total-results"]);
  }
}

interface SemanticScholarResponse {
  total?: number;
  data?: Array<{
    paperId?: string;
    title?: string;
    abstract?: string;
    url?: string;
    year?: number;
    publicationDate?: string;
    venue?: string;
    authors?: Array<{ name?: string }>;
  }>;
}

export class SemanticScholarProvider implements SearchProvider {
  readonly name = "Semantic Scholar";
  readonly id = "semantic-scholar";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "academic"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
    url.searchParams.set("query", options.query);
    url.searchParams.set("limit", String(clampLimit(options.pageSize, 5, 10)));
    url.searchParams.set("fields", "title,abstract,url,year,authors,venue,publicationDate");

    const data = await getJson<SemanticScholarResponse>(this.name, url);
    const results = (data.data ?? []).map((paper, idx) => {
      const authors = (paper.authors ?? []).map((a) => a.name).filter(Boolean).slice(0, 4).join(", ");
      const snippet = [authors, paper.venue, paper.abstract].filter(Boolean).join(" - ");
      return webResult(
        `semantic-${paper.paperId ?? idx}`,
        paper.title,
        resultUrl(paper.url, "https://www.semanticscholar.org/"),
        snippet,
        "semanticscholar.org",
        "academic",
        paper.publicationDate ?? (paper.year ? String(paper.year) : undefined)
      );
    });
    return response(this.name, options.query, start, results, data.total);
  }
}

interface DataGovResponse {
  result?: {
    count?: number;
    results?: Array<{
      id?: string;
      title?: string;
      notes?: string;
      name?: string;
      organization?: { title?: string; name?: string };
      metadata_modified?: string;
      resources?: Array<{ format?: string }>;
    }>;
  };
}

export class DataGovProvider implements SearchProvider {
  readonly name = "Data.gov";
  readonly id = "data-gov";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "stats", "government"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const url = new URL("https://catalog.data.gov/api/3/action/package_search");
    url.searchParams.set("q", options.query);
    url.searchParams.set("rows", String(clampLimit(options.pageSize, 5, 10)));

    try {
      const data = await getJson<DataGovResponse>(this.name, url);
      const results = (data.result?.results ?? []).map((pkg, idx) => {
        const pkgUrl = pkg.name ? `https://catalog.data.gov/dataset/${pkg.name}` : "https://catalog.data.gov/";
        const formats = Array.from(new Set((pkg.resources ?? []).map((r) => r.format).filter(Boolean) as string[])).slice(0, 5);
        return datasetResult(
          `data-gov-${pkg.id ?? idx}`,
          pkg.title,
          pkgUrl,
          pkg.notes,
          "catalog.data.gov",
          pkg.organization?.title ?? pkg.organization?.name,
          formats,
          pkg.metadata_modified
        );
      });
      return response(this.name, options.query, start, results, data.result?.count);
    } catch (err) {
      if (!(err instanceof ProviderError) || err.kind !== "server") throw err;
      const results = await this.searchHtml(options);
      return response(this.name, options.query, start, results);
    }
  }

  private async searchHtml(options: SearchOptions): Promise<DatasetResult[]> {
    const url = new URL("https://catalog.data.gov/dataset/");
    url.searchParams.set("q", options.query);
    const resp = await platformFetch(url.toString(), { method: "GET" });
    if (!resp.ok) throw new ProviderError("server", this.name, `HTTP ${resp.status}`);
    const html = await resp.text();
    if (typeof DOMParser === "undefined") return [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href^="/dataset/"]'));
    const seen = new Set<string>();
    return links
      .map((link, idx) => {
        const href = `https://catalog.data.gov${link.getAttribute("href") ?? ""}`;
        const title = link.textContent?.replace(/\s+/g, " ").trim();
        if (!title || seen.has(href) || title.length < 4) return null;
        seen.add(href);
        const container = link.closest("li, .dataset-content, .module-content") ?? link.parentElement;
        const snippet = container?.textContent?.replace(/\s+/g, " ").trim() ?? title;
        return datasetResult(`data-gov-html-${idx}`, title, href, snippet, "catalog.data.gov", "Data.gov");
      })
      .filter((r): r is DatasetResult => Boolean(r))
      .slice(0, clampLimit(options.pageSize, 5, 10));
  }
}

interface CdcCatalogResponse {
  results?: Array<{
    resource?: {
      id?: string;
      name?: string;
      description?: string;
      attribution?: string;
      updatedAt?: string;
      columns_field_name?: string[];
    };
    metadata?: { domain?: string };
  }>;
}

export class CdcDataProvider implements SearchProvider {
  readonly name = "CDC Data";
  readonly id = "cdc-data";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "stats", "government"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const url = new URL("https://data.cdc.gov/api/catalog/v1");
    url.searchParams.set("search_context", "data.cdc.gov");
    url.searchParams.set("search", options.query);
    url.searchParams.set("limit", String(clampLimit(options.pageSize, 5, 10)));

    const data = await getJson<CdcCatalogResponse>(this.name, url);
    const results = (data.results ?? []).map((hit, idx) => {
      const id = hit.resource?.id ?? String(idx);
      return datasetResult(
        `cdc-${id}`,
        hit.resource?.name,
        `https://data.cdc.gov/d/${id}`,
        hit.resource?.description,
        "data.cdc.gov",
        hit.resource?.attribution ?? "CDC",
        undefined,
        hit.resource?.updatedAt
      );
    });
    return response(this.name, options.query, start, results);
  }
}

interface CensusDiscoveryResponse {
  dataset?: Array<unknown[]>;
}

export class CensusProvider implements SearchProvider {
  readonly name = "Census API";
  readonly id = "census";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "stats", "government"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const data = await getJson<CensusDiscoveryResponse>(this.name, "https://api.census.gov/data.json");
    const limit = clampLimit(options.pageSize, 4, 8);
    const datasets = (data.dataset ?? [])
      .map((row, idx) => {
        const title = String(row[0] ?? "");
        const description = String(row[1] ?? "");
        const endpoint = String(row[2] ?? "");
        const url = endpoint.startsWith("http") ? endpoint : "https://www.census.gov/data.html";
        return { idx, title, description, url };
      })
      .filter((d) => containsQuery(`${d.title} ${d.description}`, options.query))
      .slice(0, limit);

    const results = datasets.map((d) =>
      datasetResult(`census-${d.idx}`, d.title, d.url, d.description, "api.census.gov", "U.S. Census Bureau")
    );
    return response(this.name, options.query, start, results, results.length);
  }
}

interface WorldBankIndicator {
  id?: string;
  name?: string;
  sourceNote?: string;
  sourceOrganization?: string;
}

export class WorldBankProvider implements SearchProvider {
  readonly name = "World Bank";
  readonly id = "world-bank";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "stats", "government"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const url = new URL("https://api.worldbank.org/v2/indicator");
    url.searchParams.set("format", "json");
    url.searchParams.set("per_page", "200");
    url.searchParams.set("source", "2");

    const data = await getJson<[unknown, WorldBankIndicator[]]>(this.name, url);
    const limit = clampLimit(options.pageSize, 4, 8);
    const indicators = (Array.isArray(data[1]) ? data[1] : [])
      .filter((i) => containsQuery(`${i.name ?? ""} ${i.sourceNote ?? ""}`, options.query))
      .slice(0, limit);
    const results = indicators.map((i) =>
      datasetResult(
        `worldbank-${i.id}`,
        i.name,
        i.id ? `https://data.worldbank.org/indicator/${encodeURIComponent(i.id)}` : "https://data.worldbank.org/",
        i.sourceNote,
        "data.worldbank.org",
        i.sourceOrganization ?? "World Bank"
      )
    );
    return response(this.name, options.query, start, results);
  }
}

interface FederalRegisterResponse {
  count?: number;
  results?: Array<{
    document_number?: string;
    title?: string;
    abstract?: string;
    html_url?: string;
    publication_date?: string;
    agencies?: Array<{ name?: string }>;
  }>;
}

export class FederalRegisterProvider implements SearchProvider {
  readonly name = "Federal Register";
  readonly id = "federal-register";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "government", "news"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const url = new URL("https://www.federalregister.gov/api/v1/documents.json");
    url.searchParams.set("conditions[term]", options.query);
    url.searchParams.set("per_page", String(clampLimit(options.pageSize, 5, 10)));
    url.searchParams.set("order", "relevance");

    const data = await getJson<FederalRegisterResponse>(this.name, url);
    const results = (data.results ?? []).map((doc, idx) =>
      webResult(
        `fr-${doc.document_number ?? idx}`,
        doc.title,
        resultUrl(doc.html_url, "https://www.federalregister.gov/"),
        [doc.agencies?.map((a) => a.name).filter(Boolean).join(", "), doc.abstract].filter(Boolean).join(" - "),
        "federalregister.gov",
        "legal",
        doc.publication_date
      )
    );
    return response(this.name, options.query, start, results, data.count);
  }
}

interface OpenLibraryResponse {
  numFound?: number;
  docs?: Array<{
    key?: string;
    title?: string;
    author_name?: string[];
    first_publish_year?: number;
    subject?: string[];
  }>;
}

export class OpenLibraryProvider implements SearchProvider {
  readonly name = "Open Library";
  readonly id = "open-library";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "web", "people"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("q", options.query);
    url.searchParams.set("limit", String(clampLimit(options.pageSize, 5, 10)));

    const data = await getJson<OpenLibraryResponse>(this.name, url);
    const results = (data.docs ?? []).map((doc, idx) => {
      const href = doc.key ? `https://openlibrary.org${doc.key}` : "https://openlibrary.org/";
      const snippet = [
        doc.author_name?.slice(0, 4).join(", "),
        doc.first_publish_year ? `First published ${doc.first_publish_year}` : "",
        doc.subject?.slice(0, 6).join(", "),
      ].filter(Boolean).join(" - ");
      return webResult(`openlib-${doc.key ?? idx}`, doc.title, href, snippet, "openlibrary.org", "general", doc.first_publish_year ? String(doc.first_publish_year) : undefined);
    });
    return response(this.name, options.query, start, results, data.numFound);
  }
}

interface InternetArchiveResponse {
  response?: {
    numFound?: number;
    docs?: Array<{
      identifier?: string;
      title?: string;
      description?: string | string[];
      creator?: string | string[];
      date?: string;
      mediatype?: string;
    }>;
  };
}

export class InternetArchiveProvider implements SearchProvider {
  readonly name = "Internet Archive";
  readonly id = "internet-archive";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "web", "images", "people"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const url = new URL("https://archive.org/advancedsearch.php");
    url.searchParams.set("q", options.query);
    url.searchParams.set("output", "json");
    url.searchParams.set("rows", String(clampLimit(options.pageSize, 5, 10)));
    url.searchParams.append("fl[]", "identifier");
    url.searchParams.append("fl[]", "title");
    url.searchParams.append("fl[]", "description");
    url.searchParams.append("fl[]", "creator");
    url.searchParams.append("fl[]", "date");
    url.searchParams.append("fl[]", "mediatype");

    const data = await getJson<InternetArchiveResponse>(this.name, url);
    const results = (data.response?.docs ?? []).map((doc, idx) => {
      const id = doc.identifier ?? String(idx);
      const creator = Array.isArray(doc.creator) ? doc.creator.join(", ") : doc.creator;
      const description = Array.isArray(doc.description) ? doc.description.join(" ") : doc.description;
      const snippet = [creator, doc.mediatype, description].filter(Boolean).join(" - ");
      return webResult(`ia-${id}`, doc.title ?? id, `https://archive.org/details/${encodeURIComponent(id)}`, snippet, "archive.org", "general", doc.date);
    });
    return response(this.name, options.query, start, results, data.response?.numFound);
  }
}

interface GdeltResponse {
  articles?: Array<{
    url?: string;
    title?: string;
    seendate?: string;
    sourcecountry?: string;
    domain?: string;
    socialimage?: string;
  }>;
}

export class GdeltProvider implements SearchProvider {
  readonly name = "GDELT";
  readonly id = "gdelt";
  readonly isConfigured = true;
  readonly verticals: ReadonlyArray<SearchVertical> = ["all", "news", "factcheck"];

  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
    url.searchParams.set("query", options.query);
    url.searchParams.set("mode", "artlist");
    url.searchParams.set("format", "json");
    url.searchParams.set("maxrecords", String(clampLimit(options.pageSize, 5, 12)));
    url.searchParams.set("sort", "hybridrel");
    url.searchParams.set("timespan", "1week");

    const data = await getJson<GdeltResponse>(this.name, url);
    const results = (data.articles ?? []).map((article, idx) => {
      const href = resultUrl(article.url, "https://www.gdeltproject.org/");
      return webResult(
        `gdelt-${idx}-${href}`,
        article.title,
        href,
        [article.sourcecountry, article.domain].filter(Boolean).join(" - "),
        article.domain ?? "gdeltproject.org",
        "news",
        article.seendate
      );
    });
    return response(this.name, options.query, start, results);
  }
}

abstract class KeyRequiredSkeletonProvider implements SearchProvider {
  readonly isConfigured = false;

  abstract readonly name: string;
  abstract readonly id: string;
  abstract readonly verticals: ReadonlyArray<SearchVertical>;

  async search(): Promise<SearchResponse> {
    throw new ProviderError(
      "missing_api_key",
      this.name,
      `${this.name} is registered as a source-pack provider but needs API-key settings before live fan-out.`
    );
  }
}

export class FredProvider extends KeyRequiredSkeletonProvider {
  readonly name = "FRED";
  readonly id = "fred";
  readonly verticals: ReadonlyArray<SearchVertical> = ["stats"];
}

export class FbiCrimeDataProvider extends KeyRequiredSkeletonProvider {
  readonly name = "FBI Crime Data";
  readonly id = "fbi-crime-data";
  readonly verticals: ReadonlyArray<SearchVertical> = ["stats", "government"];
}

export class BlsProvider extends KeyRequiredSkeletonProvider {
  readonly name = "BLS Public API";
  readonly id = "bls";
  readonly verticals: ReadonlyArray<SearchVertical> = ["stats", "government"];
}
