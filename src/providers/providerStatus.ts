import type { SearchVertical } from "./types";

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
}

const HEALTH_KEY = "debateos:provider-health";

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
    // ignore status persistence failures
  }
}

export function listProviderHealth(): Record<string, ProviderHealth> {
  return readHealthMap();
}

export function recordProviderSuccess(id: string, name: string, resultCount: number): void {
  const map = readHealthMap();
  map[id] = {
    ...map[id],
    id,
    name,
    lastSuccessAt: Date.now(),
    lastResultCount: resultCount,
    lastError: undefined,
  };
  writeHealthMap(map);
}

export function recordProviderError(id: string, name: string, error: unknown): void {
  const map = readHealthMap();
  map[id] = {
    ...map[id],
    id,
    name,
    lastErrorAt: Date.now(),
    lastError: error instanceof Error ? error.message : String(error),
  };
  writeHealthMap(map);
}
