export interface ExtractedPage {
  title: string;
  description?: string;
  canonicalUrl?: string;
  publishedDate?: string;
  /** Cleaned full body text (≤ 20k chars). */
  bodyText: string;
  /** Short, polished excerpt suitable for a SERP card. */
  snippet: string;
  language?: string;
}

export type CrawlErrorKind =
  | "not_tauri"
  | "validation"
  | "robots_blocked"
  | "network"
  | "http_error"
  | "non_html"
  | "parse"
  | "unknown";

export class CrawlError extends Error {
  readonly kind: CrawlErrorKind;
  constructor(kind: CrawlErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "CrawlError";
  }
}

export interface CrawlOutcome {
  url: string;
  finalUrl: string;
  page: ExtractedPage;
  fetchedAt: number;
  truncated: boolean;
}

export interface FetchUrlResponse {
  status: number;
  body: string;
  final_url: string;
  content_type: string;
  truncated: boolean;
}
