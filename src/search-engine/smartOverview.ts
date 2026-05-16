import type { RankedResult, SearchPlan } from "./types";

export interface SmartOverview {
  title: "Smart Overview";
  enoughSources: boolean;
  answerSentence?: { text: string; sourceIndexes: number[] };
  keyPoints: Array<{ text: string; sourceIndexes: number[] }>;
  confidence: "High" | "Medium" | "Low";
  conflicts: string[];
  whatsMissing: string[];
  usedResults: RankedResult[];
  message?: string;
}

export function buildSmartOverview(query: string, results: RankedResult[], plan?: SearchPlan): SmartOverview {
  const reliable = results
    .filter((r) => r.credibilityScore >= 60 && r.snippet.trim().length >= 45)
    .filter((r) => r.resultType !== "image")
    .slice(0, 8);

  if (!plan?.generateOverview || reliable.length < 2) {
    return {
      title: "Smart Overview",
      enoughSources: false,
      keyPoints: [],
      confidence: "Low",
      conflicts: [],
      whatsMissing: missingForPlan(plan, reliable.length),
      usedResults: reliable,
      message: "Not enough reliable sources yet.",
    };
  }

  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);

  const allPoints = reliable
    .map((result, idx) => ({
      result,
      idx,
      sentence: bestSentence(result, tokens),
    }))
    .filter((item) => item.sentence.length > 0)
    .map((item) => ({
      ...item,
      // Count distinct query tokens the sentence actually covers — used to
      // refuse to claim "Medium/High" on sentences that don't address the
      // question at all.
      coverage: tokens.filter((t) => item.sentence.toLowerCase().includes(t)).length,
    }));

  // Reject the answer-sentence candidate outright if it doesn't share any
  // meaningful term with the query. Prevents the overview from confidently
  // quoting a sentence that has nothing to do with what the user asked.
  const answerable = allPoints.filter((p) => tokens.length === 0 || p.coverage >= 1);
  const points = answerable
    .slice(0, 4)
    .map((item) => ({ text: item.sentence, sourceIndexes: [item.idx + 1] }));

  if (points.length < 2) {
    return {
      title: "Smart Overview",
      enoughSources: false,
      keyPoints: [],
      confidence: "Low",
      conflicts: [],
      whatsMissing: missingForPlan(plan, reliable.length),
      usedResults: reliable,
      message: tokens.length > 0 && allPoints.length > 0
        ? "Found reliable sources but none directly answer the query yet."
        : "Not enough reliable sources yet.",
    };
  }

  const conflicts = detectConflicts(reliable);
  const avgCred = reliable.reduce((n, r) => n + r.credibilityScore, 0) / reliable.length;

  // Source diversity gate: refuse "High" when 2+ key points are from the
  // same domain (one source confirming itself isn't corroboration).
  const usedDomains = new Set(answerable.slice(0, 4).map((p) => p.result.domain));
  const diverseEnough = usedDomains.size >= 3;
  const avgCoverage = answerable.slice(0, 4).reduce((n, p) => n + p.coverage, 0) /
    Math.max(1, Math.min(4, answerable.length));

  let confidence: SmartOverview["confidence"];
  if (avgCred >= 78 && reliable.length >= 4 && diverseEnough && avgCoverage >= Math.min(2, tokens.length || 1)) {
    confidence = "High";
  } else if (avgCred >= 66 && reliable.length >= 3) {
    confidence = "Medium";
  } else {
    confidence = "Low";
  }

  return {
    title: "Smart Overview",
    enoughSources: true,
    answerSentence: points[0],
    keyPoints: points,
    confidence,
    conflicts,
    whatsMissing: missingForPlan(plan, reliable.length),
    usedResults: reliable,
  };
}

function bestSentence(result: RankedResult, tokens: string[]): string {
  const candidates = result.snippet
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 35)
    .slice(0, 5);
  const best = candidates
    .map((sentence) => ({
      sentence,
      score: tokens.reduce((n, token) => n + (sentence.toLowerCase().includes(token) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)[0]?.sentence ?? result.snippet;
  return trimSentence(decodeEntities(best), 260);
}

function detectConflicts(results: RankedResult[]): string[] {
  const text = results.map((r) => r.snippet.toLowerCase()).join(" ");
  const conflicts: string[] = [];
  if (/\bincrease|increased|rising|higher|grew\b/.test(text) && /\bdecrease|decreased|falling|lower|declined\b/.test(text)) {
    conflicts.push("Some sources use opposite trend language; compare dates and definitions before using the claim.");
  }
  if (/\bestimate|estimated|projection\b/.test(text) && /\bofficial|observed|reported\b/.test(text)) {
    conflicts.push("Some results appear to mix estimates with official or reported figures.");
  }
  return conflicts.slice(0, 2);
}

function trimSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}...`;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function missingForPlan(plan: SearchPlan | undefined, sourceCount: number): string[] {
  const missing: string[] = [];
  if (sourceCount < 4) missing.push("More indexed or provider-backed sources would improve confidence.");
  if (plan?.classification === "statistics/data" && !plan.routedPacks.includes("statistics")) {
    missing.push("Official statistics pack coverage is thin for this query.");
  }
  if (plan?.classification === "law/court" && !plan.routedPacks.includes("legal")) {
    missing.push("Legal source coverage is thin; CourtListener/Federal Register results may be needed.");
  }
  if (plan?.routedSourceIds.length && sourceCount < 5) {
    missing.push("Some relevant registry sources are not indexed yet.");
  }
  return Array.from(new Set(missing)).slice(0, 3);
}
