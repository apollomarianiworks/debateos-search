import { invokeFetchUrl } from "./crawlerTransport";

/**
 * Minimal robots.txt parser. Honors:
 *   - `User-agent: *` block
 *   - `User-agent: DebateOSSearchBot` block (case-insensitive)
 *   - `Disallow` and `Allow` prefix rules (longest-match wins)
 *
 * Does NOT handle wildcards (`*`, `$`) — those are rare on the curated default
 * sources. Errors fetching robots are treated as "allow" for the controlled
 * crawler since the user has explicitly approved the source.
 */

const USER_AGENT = "debateossearchbot";

interface Rule {
  type: "allow" | "disallow";
  path: string;
}

interface ParsedRobots {
  rules: Rule[];
  crawlDelaySec?: number;
}

function parseRobots(body: string): ParsedRobots {
  const lines = body.split(/\r?\n/);

  // Group rules by user-agent.
  const groups = new Map<string, Rule[]>();
  let currentAgents: string[] = [];
  let crawlDelay: number | undefined;

  for (const rawLine of lines) {
    const stripped = rawLine.split("#")[0].trim();
    if (!stripped) continue;
    const idx = stripped.indexOf(":");
    if (idx < 0) continue;
    const key = stripped.slice(0, idx).trim().toLowerCase();
    const value = stripped.slice(idx + 1).trim();

    if (key === "user-agent") {
      currentAgents = currentAgents.length === 0 ? [value.toLowerCase()] : [...currentAgents, value.toLowerCase()];
      if (!groups.has(value.toLowerCase())) groups.set(value.toLowerCase(), []);
    } else if (key === "disallow" || key === "allow") {
      const rule: Rule = { type: key, path: value };
      for (const agent of currentAgents) {
        const arr = groups.get(agent) ?? [];
        arr.push(rule);
        groups.set(agent, arr);
      }
      // After a rule, the agent block continues until another user-agent appears.
    } else if (key === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) crawlDelay = n;
    } else if (key !== "sitemap") {
      // Unknown directive — reset agent context so subsequent rules don't bind
      currentAgents = [];
    }
  }

  // Prefer specific UA rules over `*`
  const specific = groups.get(USER_AGENT);
  const general = groups.get("*");
  const rules = specific && specific.length > 0 ? specific : general ?? [];

  return { rules, crawlDelaySec: crawlDelay };
}

/** Apply parsed rules to a request path. Longest-match wins; allow ties beat disallow. */
function isPathAllowed(path: string, rules: Rule[]): boolean {
  if (rules.length === 0) return true;

  let best: Rule | null = null;
  for (const rule of rules) {
    if (!rule.path) continue;
    if (path.startsWith(rule.path)) {
      if (!best || rule.path.length > best.path.length) best = rule;
      else if (rule.path.length === best.path.length && rule.type === "allow") best = rule;
    }
  }

  if (!best) return true;
  return best.type === "allow";
}

/**
 * Check whether the URL is permitted by the target host's robots.txt.
 * Returns `{ allowed: true }` if no robots.txt or unparseable; `{ allowed: false, reason }` if blocked.
 */
export async function checkRobots(targetUrl: string): Promise<{ allowed: boolean; reason?: string; crawlDelaySec?: number }> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { allowed: false, reason: "Invalid URL" };
  }

  const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;

  try {
    const response = await invokeFetchUrl(robotsUrl);
    if (response.status === 404 || response.status >= 500) {
      return { allowed: true };
    }
    if (response.status >= 400) {
      // Treat client errors as "allow" — server isn't restricting via robots
      return { allowed: true };
    }
    const robots = parseRobots(response.body);
    const path = parsed.pathname + (parsed.search ?? "");
    const allowed = isPathAllowed(path, robots.rules);
    return allowed
      ? { allowed: true, crawlDelaySec: robots.crawlDelaySec }
      : { allowed: false, reason: "Disallowed by robots.txt", crawlDelaySec: robots.crawlDelaySec };
  } catch {
    // Network error fetching robots.txt — be conservative but pragmatic:
    // since the user explicitly approved the source, proceed.
    return { allowed: true };
  }
}
