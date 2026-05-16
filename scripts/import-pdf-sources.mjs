#!/usr/bin/env node
/**
 * Parse the two "Reputable Sources" PDFs into a typed TS module.
 *
 * Usage:
 *   pdftotext -layout vol1.pdf tmp/vol1.txt
 *   pdftotext -layout vol2.pdf tmp/vol2.txt
 *   npm run sources:import
 *
 * Output: src/source-registry/sources.generated.ts
 *
 * Strategy
 * --------
 *   1. Split every page line at the first run of 3+ spaces past column 32 →
 *      parallel left/right column lines.
 *   2. Stitch lines from both columns into a list of (section, lines[]) blocks,
 *      where a block runs until the next section header.
 *   3. Within each block, walk one column at a time with 1-line lookahead:
 *      when current line is non-URL and the NEXT line is URL-shaped, the
 *      current line is a title (flushing any prior entry). Otherwise it's
 *      description of the entry-in-progress.
 *
 * That lookahead is the trick that lets a single linear pass recognize the
 * "title → url → description..." triplet pattern in either column.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = (n) => resolve(projectRoot, "tmp", n);
const OUT = resolve(projectRoot, "src/source-registry/sources.generated.ts");

// ───────────────────────────────────────────────────────────────────────────

function splitColumns(line) {
  const tail = line.slice(32);
  const m = tail.match(/ {3,}/);
  if (!m) return [line.trimEnd(), ""];
  const cut = 32 + m.index;
  return [line.slice(0, cut).trimEnd(), line.slice(cut + m[0].length).trimEnd()];
}

function isUrlLike(s) {
  if (!s) return false;
  if (/\s/.test(s)) return false;
  if (s.length < 5 || s.length > 160) return false;
  // require: leading alnum, at least one dot, TLD-ish 2+ letter tail
  if (!/^[a-z0-9]/i.test(s)) return false;
  if (!/\.[a-z]{2,}/i.test(s)) return false;
  // forbid commas, parens, semicolons (description chars)
  if (/[,;()<>]/.test(s)) return false;
  if (/^\d+(\.\d+)*$/.test(s)) return false;
  return true;
}

function isSectionHeader(line) {
  const t = line.trim();
  // Real body section headers look like:
  //   "1. General Reference & Encyclopedias • 15 sources"
  //   "12 Economics & Finance � 14 sources"   ← pdftotext mangled bullet
  //   "B. Operator Cheat Sheet & Quick Reference   reference"  ← appendix
  // The trailing "• N (sources|entries)" or trailing "<category-word>" is the discriminator.
  // TOC lines look the same minus the bullet+count, so we REQUIRE that suffix.
  const m = t.match(/^([0-9]{1,2}|[A-Z])[.\s]\s+([A-Z][^\n]{4,80}?)\s+(?:[••·●◆■∙‧��*-]\s+)?\d{1,3}\s+(?:sources|entries|methodology|reference|evaluation)\b/);
  if (m) {
    const title = m[2].trim().replace(/\s+/g, " ");
    return { title };
  }
  // Also accept the appendix-style: "B. Operator Cheat Sheet & Quick Reference"
  const a = t.match(/^([A-Z])\.\s+([A-Z][A-Za-z&\-/()\s,'-]{6,80})$/);
  if (a) {
    return { title: a[2].trim().replace(/\s+/g, " ") };
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// Walk a single column's lines with 1-line lookahead and emit entries.

function walkColumn(lines, sectionForLineIdx) {
  const out = [];
  let entry = null;
  const flush = () => {
    if (entry && entry.title && entry.url) {
      entry.description = (entry.descLines.join(" ").replace(/\s+/g, " ").trim()) || "";
      delete entry.descLines;
      out.push(entry);
    }
    entry = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (isUrlLike(line)) {
      // URL belongs to the most recent title we've seen but not yet bound.
      // The previous loop iteration should have set entry with title only.
      if (entry && entry.title && !entry.url) {
        entry.url = line;
      } else {
        // orphan URL — skip
      }
      continue;
    }

    // Non-URL line. Peek next non-empty line to decide title vs description.
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    const next = j < lines.length ? lines[j].trim() : "";

    if (isUrlLike(next)) {
      // This line is a TITLE for the next entry. Flush whatever we had.
      flush();
      entry = {
        section: sectionForLineIdx(i),
        title: line,
        url: null,
        descLines: [],
      };
    } else {
      // This is a description line for the entry-in-progress (if any with a URL).
      if (entry && entry.url) {
        entry.descLines.push(line);
      } else if (entry && entry.title && !entry.url) {
        // Title continuation (rare) — append
        entry.title = (entry.title + " " + line).replace(/\s+/g, " ");
      }
      // else: stray noise, ignore
    }
  }
  flush();
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Classification

const CATEGORY_TO_TYPE_TIER = [
  [/government|federal agenc|congress|parliament|state open data|cabinet/i, "government", 1],
  [/statist|census|labor|economic data|economy.*indicator|specialty.*statistical/i, "statistics", 1],
  [/legal|court|case law|patent|intellectual property|trademark/i, "legal", 1],
  [/fact.?check|verification/i, "factcheck", 2],
  [/news|wire|journalism|broadcast/i, "news", 2],
  [/preprint|repositor|peer.?reviewed/i, "academic", 2],
  [/medic|health/i, "academic", 2],
  [/scien|physic|chem|biolog|earth|astron|engineer|technolog|cyber|mathematic|computer/i, "academic", 2],
  [/think tank|policy|polling|survey/i, "academic", 2],
  [/journal|database.*search|academic|scholar|specialty.*databases/i, "academic", 2],
  [/history|primary source|archive|library|museum/i, "general", 2],
  [/encyclop|reference|dictionary|tech foundations/i, "general", 2],
  [/education|career/i, "statistics", 2],
  [/environment|climate|earth system/i, "academic", 2],
  [/map|geograph|earth observ/i, "statistics", 2],
  [/web archiv|crawler|open data/i, "statistics", 2],
  [/humaniti|social sciences|arts/i, "academic", 2],
  [/industry|trade|consumer/i, "general", 3],
];

function classify(section) {
  if (!section) return { sourceType: "general", tier: 3 };
  for (const [rx, t, tier] of CATEGORY_TO_TYPE_TIER) {
    if (rx.test(section)) return { sourceType: t, tier };
  }
  return { sourceType: "general", tier: 3 };
}

function packsFor(section, sourceType) {
  const p = new Set();
  if (!section) return [];
  const s = section.toLowerCase();
  if (/government|congress|parliament|federal agenc|cabinet/.test(s)) p.add("government");
  if (/statist|census|labor|economic|indicator|economy|finance/.test(s)) p.add("statistics");
  if (/legal|court|case law|patent|intellectual property|trademark/.test(s)) p.add("legal");
  if (/fact.?check|verif/.test(s)) p.add("factchecking");
  if (/medic|health/.test(s)) p.add("health");
  if (/preprint|repositor|peer|journal|scholar|database.*search|academic/.test(s)) p.add("academic");
  if (/scien|physic|chem|biolog|astron|earth|engineer|mathematic|computer/.test(s)) p.add("science");
  if (/environment|climate/.test(s)) p.add("science");
  if (/think tank|policy|polling/.test(s)) p.add("academic");
  if (/educa|career/.test(s)) p.add("education");
  if (/history|primary|archive|library|museum|humaniti|book/.test(s)) p.add("books-archives");
  if (/encyclop|reference|dictionary/.test(s)) p.add("people");
  if (/foreign|international|parliament/.test(s)) p.add("international");
  if (/crime|justice|incarcer|fbi/.test(s)) p.add("crime");
  if (/map|geograph/.test(s)) p.add("geo-maps");
  if (/cyber|tech/.test(s)) p.add("science");
  if (sourceType === "factcheck") p.add("factchecking");
  if (sourceType === "academic" && !p.has("science") && !p.has("health")) p.add("academic");
  return Array.from(p);
}

// ───────────────────────────────────────────────────────────────────────────
// Parse a single pdftotext output

function parsePdfText(raw) {
  const allLines = raw.replace(/\r\n/g, "\n").split("\n");

  // Pre-pass: split each line into left + right, and detect section headers.
  // We build a parallel structure: for every line index, store left, right,
  // and an updated currentSection.
  let currentSection = null;
  const sectionByIdx = []; // section name at the moment of the i-th line
  const leftLines = [];
  const rightLines = [];

  for (const rawLine of allLines) {
    // Discard pure page noise
    if (/^\s*page\s+\d+\s*$/i.test(rawLine)) {
      sectionByIdx.push(currentSection);
      leftLines.push("");
      rightLines.push("");
      continue;
    }
    if (/^\s*\d+\s*$/.test(rawLine)) {
      // a lone integer line (page footer) — skip but advance
      sectionByIdx.push(currentSection);
      leftLines.push("");
      rightLines.push("");
      continue;
    }
    const [l, r] = splitColumns(rawLine);
    const hdr = isSectionHeader(l) ?? isSectionHeader(r);
    if (hdr) {
      currentSection = hdr.title;
      // Don't emit the header line as content
      sectionByIdx.push(currentSection);
      leftLines.push("");
      rightLines.push("");
      continue;
    }
    sectionByIdx.push(currentSection);
    leftLines.push(l);
    rightLines.push(r);
  }

  const sectionForLineIdx = (i) => sectionByIdx[i] ?? null;
  const left = walkColumn(leftLines, sectionForLineIdx);
  const right = walkColumn(rightLines, sectionForLineIdx);
  return [...left, ...right];
}

// ───────────────────────────────────────────────────────────────────────────
// Normalize + dedupe

function normalizeUrl(raw) {
  if (!raw) return null;
  let u = raw.trim().replace(/^https?:\/\//, "").replace(/^www\./, "");
  u = u.replace(/[.,;]+$/, "");
  return u || null;
}

function domainOf(normalizedUrl) {
  if (!normalizedUrl) return null;
  const slash = normalizedUrl.indexOf("/");
  return (slash < 0 ? normalizedUrl : normalizedUrl.slice(0, slash)).toLowerCase();
}

function slug(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "x";
}

function build(entries, volume) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    const normalized = normalizeUrl(e.url);
    if (!normalized) continue;
    const domain = domainOf(normalized);
    if (!domain || !/\.[a-z]{2,}$/i.test(domain.split("/")[0])) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);

    const { sourceType, tier } = classify(e.section);
    const tags = packsFor(e.section, sourceType);
    const id = `imp-${slug(domain.split(".")[0])}-${slug(e.title || domain).slice(0, 32)}`.slice(0, 80);
    const cleanTitle = (e.title || domain).replace(/\s+/g, " ").trim();
    const notes = (e.description || "").replace(/\s+/g, " ").trim().slice(0, 220) || undefined;

    out.push({
      id,
      name: cleanTitle,
      domain: domain.split("/")[0],
      url: `https://${normalized}`,
      sourceType,
      tier,
      notes,
      tags,
      volume,
      section: e.section || "Uncategorized",
    });
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Emit

function emit(sources) {
  const header = `// AUTO-GENERATED by scripts/import-pdf-sources.mjs — do not edit.
// Source data parsed from:
//   500_Reputable_Sources_for_Research.pdf  (Volume I)
//   500_More_Reputable_Sources_for_Research.pdf  (Volume II)
//
// Regenerate:
//   pdftotext -layout <pdf> tmp/vol{1,2}.txt
//   npm run sources:import

import type { Source } from "./types";

function imp(
  id: string,
  name: string,
  domain: string,
  url: string,
  sourceType: Source["sourceType"],
  tier: Source["credibilityTier"],
  tags: string[],
  notes: string | undefined
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

export const IMPORTED_SOURCES: Source[] = [
`;

  const body = sources
    .map((s) => {
      const sectionTag = `section:${s.section.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}`;
      const tags = [...s.tags, "imported", `vol${s.volume}`, sectionTag];
      const tagsLit = JSON.stringify(tags);
      const notesLit = s.notes ? JSON.stringify(s.notes) : "undefined";
      return `  imp(${JSON.stringify(s.id)}, ${JSON.stringify(s.name)}, ${JSON.stringify(s.domain)}, ${JSON.stringify(s.url)}, ${JSON.stringify(s.sourceType)}, ${s.tier}, ${tagsLit}, ${notesLit}),`;
    })
    .join("\n");

  const footer = `\n];\n\nexport const IMPORTED_SOURCE_STATS = {\n  total: ${sources.length},\n  volume1: ${sources.filter((s) => s.volume === 1).length},\n  volume2: ${sources.filter((s) => s.volume === 2).length},\n  generatedAt: ${JSON.stringify(new Date().toISOString())},\n};\n`;

  return header + body + footer;
}

// ───────────────────────────────────────────────────────────────────────────

function main() {
  if (!existsSync(TMP("vol1.txt")) || !existsSync(TMP("vol2.txt"))) {
    console.error("Missing tmp/vol1.txt or tmp/vol2.txt. Run:");
    console.error('  pdftotext -layout "<vol1>.pdf" tmp/vol1.txt');
    console.error('  pdftotext -layout "<vol2>.pdf" tmp/vol2.txt');
    process.exit(1);
  }

  const vol1 = parsePdfText(readFileSync(TMP("vol1.txt"), "utf8"));
  const vol2 = parsePdfText(readFileSync(TMP("vol2.txt"), "utf8"));

  console.error(`raw parsed: vol1=${vol1.length}, vol2=${vol2.length}`);

  const built1 = build(vol1, 1);
  const built2 = build(vol2, 2);
  const combined = [...built1, ...built2];

  const seen = new Set();
  const deduped = [];
  for (const s of combined) {
    if (seen.has(s.domain)) continue;
    seen.add(s.domain);
    deduped.push(s);
  }

  console.error(
    `built: vol1=${built1.length}, vol2=${built2.length}, combined=${combined.length}, after cross-dedup=${deduped.length}`
  );

  if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, emit(deduped), "utf8");
  console.error(`wrote ${OUT}`);
}

main();
