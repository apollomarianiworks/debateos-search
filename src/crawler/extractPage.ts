import type { ExtractedPage } from "./types";
import { CrawlError } from "./types";

const MAX_BODY_CHARS = 20_000;
const SNIPPET_CHARS = 320;

/**
 * Parse a fetched HTML body and extract a clean, indexable representation.
 * Best-effort: ignores broken markup, missing metadata, etc.
 */
export function extractPage(html: string, sourceUrl: string): ExtractedPage {
  if (typeof DOMParser === "undefined") {
    throw new CrawlError("parse", "DOMParser not available in this environment");
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch (err) {
    throw new CrawlError("parse", err instanceof Error ? err.message : "HTML parse failed");
  }

  const title = pickTitle(doc) || sourceUrl;
  const description = pickMeta(doc, [
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ]);
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? undefined;
  const publishedDate = pickPublishedDate(doc);
  const language =
    doc.documentElement.getAttribute("lang") ??
    doc.querySelector('meta[property="og:locale"]')?.getAttribute("content") ??
    undefined;

  // Strip noisy structural elements before pulling body text
  doc.querySelectorAll(
    "script, style, noscript, template, nav, footer, header, aside, form, iframe, svg, canvas, video, audio"
  ).forEach((el) => el.remove());
  doc.querySelectorAll('[aria-hidden="true"], [hidden], [role="navigation"]').forEach((el) => el.remove());

  const mainEl =
    doc.querySelector("main") ||
    doc.querySelector("article") ||
    doc.querySelector('[role="main"]') ||
    doc.body;

  const bodyText = collapseWhitespace(mainEl?.textContent ?? "").slice(0, MAX_BODY_CHARS);

  const snippet =
    (description && description.length >= 60 ? description : firstMeaningfulSlice(bodyText, SNIPPET_CHARS)) ?? "";

  return {
    title: title.trim(),
    description: description?.trim() || undefined,
    canonicalUrl: canonical,
    publishedDate,
    bodyText,
    snippet: snippet.slice(0, SNIPPET_CHARS),
    language: language?.split("-")[0]?.toLowerCase() || undefined,
  };
}

function pickTitle(doc: Document): string | undefined {
  const og = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
  if (og && og.length > 4) return og;
  return doc.querySelector("title")?.textContent ?? undefined;
}

function pickMeta(doc: Document, selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const c = doc.querySelector(sel)?.getAttribute("content");
    if (c && c.trim().length > 0) return c.trim();
  }
  return undefined;
}

function pickPublishedDate(doc: Document): string | undefined {
  const meta = pickMeta(doc, [
    'meta[property="article:published_time"]',
    'meta[name="article:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="publishdate"]',
    'meta[itemprop="datePublished"]',
    'meta[property="og:published_time"]',
  ]);
  if (meta) return meta;

  const timeEl = doc.querySelector("time[datetime]")?.getAttribute("datetime");
  if (timeEl) return timeEl;

  return undefined;
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function firstMeaningfulSlice(text: string, max: number): string | undefined {
  if (!text || text.length < 40) return undefined;
  // Try to break at a sentence boundary before the max char.
  const head = text.slice(0, max + 80);
  const pivot = head.lastIndexOf(". ", max);
  if (pivot > 80) return head.slice(0, pivot + 1);
  return text.slice(0, max);
}
