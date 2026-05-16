import type { SearchVertical } from "./types";
import { ProviderError } from "./providerErrors";

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  keyRequired: boolean;
  enabled: boolean;
  verticals: SearchVertical[];
  sourcePacks: string[];
  note?: string;
}

export interface ProviderHealth {
  id: string;
  name: string;
  lastSuccessAt?: number;
  lastErrorAt?: number;
  lastError?: string;
  lastResultCount?: number;
  /** Rolling success/failure tallies, capped to 20 each so old data ages out. */
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  /** When set, provider is skipped in fanout until `Date.now() >= cooldownUntilMs`. */
  cooldownUntilMs?: number;
  /** Reason for most recent cooldown, surfaced in the Sources UI. */
  cooldownReason?: string;
}

const HEALTH_KEY = "debateos:provider-health-v2";
const ROLLING_CAP = 20;

// Cooldown lengths in ms. Indexed by `consecutiveFailures - 1`.
const ERROR_BACKOFF_MS = [
  0,            // 1st failure — no cooldown, give it another shot
  30_000,       // 2nd failure — 30s
  2 * 60_000,   // 3rd — 2m
  10 * 60_000,  // 4th — 10m
  30 * 60_000,  // 5th and beyond — 30m
];
// 429 rate-limits get a longer baseline.
const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
// Auth failures (invalid key) — long cooldown so we don't pester users until
// they touch Settings again.
const AUTH_FAIL_COOLDOWN_MS = 60 * 60_000;

function readHealthMap(): Record<string, ProviderHealth> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(HEALTH_KEY) ?? "{}") as Record<string, ProviderHealth>;
  } catch {
    return {};
  }
}

function writeHealthMap(map: Record<string, ProviderHealth>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(HEALTH_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function ensure(map: Record<string, ProviderHealth>, id: string, name: string): ProviderHealth {
  if (!map[id]) {
    map[id] = { id, name, successCount: 0, failureCount: 0, consecutiveFailures: 0 };
  } else {
    map[id].name = name;
  }
  return map[id];
}

export function listProviderHealth(): Record<string, ProviderHealth> {
  return readHealthMap();
}

export function recordProviderSuccess(id: string, name: string, resultCount: number): void {
  const map = readHealthMap();
  const h = ensure(map, id, name);
  h.lastSuccessAt = Date.now();
  h.lastResultCount = resultCount;
  h.lastError = undefined;
  h.consecutiveFailures = 0;
  h.cooldownUntilMs = undefined;
  h.cooldownReason = undefined;
  h.successCount = Math.min(ROLLING_CAP, h.successCount + 1);
  // Decay failures slowly so a long-running provider can recover its score
  if (h.failureCount > 0) h.failureCount = Math.max(0, h.failureCount - 1);
  writeHealthMap(map);
}

export function recordProviderError(id: string, name: string, error: unknown): void {
  const map = readHealthMap();
  const h = ensure(map, id, name);
  h.lastErrorAt = Date.now();
  h.lastError = error instanceof Error ? error.message : String(error);
  h.consecutiveFailures += 1;
  h.failureCount = Math.min(ROLLING_CAP, h.failureCount + 1);

  // Pick cooldown duration based on the kind of error.
  let cooldownMs = 0;
  let reason = "";
  if (error instanceof ProviderError) {
    if (error.kind === "rate_limited") {
      cooldownMs = RATE_LIMIT_COOLDOWN_MS;
      reason = "Rate-limited";
    } else if (error.kind === "invalid_api_key" || error.kind === "missing_api_key") {
      cooldownMs = AUTH_FAIL_COOLDOWN_MS;
      reason = "API-key issue";
    }
  }
  if (cooldownMs === 0) {
    const idx = Math.min(h.consecutiveFailures - 1, ERROR_BACKOFF_MS.length - 1);
    cooldownMs = ERROR_BACKOFF_MS[idx];
    if (cooldownMs > 0) reason = `Backoff after ${h.consecutiveFailures} failures`;
  }

  if (cooldownMs > 0) {
    h.cooldownUntilMs = Date.now() + cooldownMs;
    h.cooldownReason = reason;
  }
  writeHealthMap(map);
}

/** True when the provider is in an active cooldown window. */
export function isProviderInCooldown(id: string): boolean {
  const h = readHealthMap()[id];
  if (!h?.cooldownUntilMs) return false;
  if (Date.now() >= h.cooldownUntilMs) return false;
  return true;
}

/**
 * Reliability score in [0, 1]. Used to sort providers before fanout so the
 * strongest providers launch first (and the bounded-parallelism runner
 * picks them up before weaker ones). Brand-new providers default to 0.7.
 */
export function getProviderReliability(id: string): number {
  const h = readHealthMap()[id];
  if (!h) return 0.7;
  const total = h.successCount + h.failureCount;
  if (total === 0) return 0.7;
  const raw = h.successCount / total;
  // Penalize providers currently in cooldown so they sort to the back even
  // if their long-term score is fine.
  return h.cooldownUntilMs && Date.now() < h.cooldownUntilMs ? raw * 0.25 : raw;
}

/** Clear cooldowns and reset rolling stats for one provider. */
export function resetProviderHealth(id: string): void {
  const map = readHealthMap();
  if (!map[id]) return;
  map[id].cooldownUntilMs = undefined;
  map[id].cooldownReason = undefined;
  map[id].consecutiveFailures = 0;
  writeHealthMap(map);
}
