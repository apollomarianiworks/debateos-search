import type { Source, SourceOverride, SourceRegistryStorage, CredibilityTier } from "./types";
import type { SourceType } from "@/providers/types";
import { DEFAULT_SOURCES } from "./defaultSources";

const STORAGE_KEY = "debateos:source-registry-v1";

function readStorage(): SourceRegistryStorage {
  if (typeof localStorage === "undefined") {
    return { version: 1, customSources: [], overrides: {} };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, customSources: [], overrides: {} };
    const parsed = JSON.parse(raw) as SourceRegistryStorage;
    if (parsed.version !== 1) return { version: 1, customSources: [], overrides: {} };
    return {
      version: 1,
      customSources: Array.isArray(parsed.customSources) ? parsed.customSources : [],
      overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
    };
  } catch {
    return { version: 1, customSources: [], overrides: {} };
  }
}

function writeStorage(state: SourceRegistryStorage): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage quota / unavailable — silent failure is acceptable here
  }
}

function applyOverride(source: Source, override?: SourceOverride): Source {
  if (!override) return source;
  return {
    ...source,
    enabled: override.enabled ?? source.enabled,
    lastIndexedAt: override.lastIndexedAt ?? source.lastIndexedAt,
    lastError: override.lastError === null ? undefined : (override.lastError ?? source.lastError),
    notes: override.notes ?? source.notes,
  };
}

/**
 * Get the full merged source list (defaults + custom, with overrides applied).
 * Safe to call repeatedly — reads from localStorage on each call.
 */
export function listSources(): Source[] {
  const state = readStorage();
  const defaults = DEFAULT_SOURCES.map((s) => applyOverride(s, state.overrides[s.id]));
  return [...defaults, ...state.customSources];
}

export function listEnabledSources(): Source[] {
  return listSources().filter((s) => s.enabled);
}

export function getSource(id: string): Source | undefined {
  return listSources().find((s) => s.id === id);
}

export function setEnabled(id: string, enabled: boolean): void {
  const state = readStorage();
  if (DEFAULT_SOURCES.some((d) => d.id === id)) {
    state.overrides[id] = { ...state.overrides[id], enabled };
  } else {
    const idx = state.customSources.findIndex((s) => s.id === id);
    if (idx >= 0) state.customSources[idx].enabled = enabled;
  }
  writeStorage(state);
}

/**
 * Bulk-toggle every known source whose id appears in `ids` (defaults +
 * custom). Returns the count actually changed (skips sources that already
 * had the target state). One storage write at the end.
 */
export function setEnabledBulk(ids: string[], enabled: boolean): number {
  const state = readStorage();
  const idSet = new Set(ids);
  let changed = 0;

  for (const def of DEFAULT_SOURCES) {
    if (!idSet.has(def.id)) continue;
    const current = state.overrides[def.id]?.enabled ?? def.enabled;
    if (current === enabled) continue;
    state.overrides[def.id] = { ...state.overrides[def.id], enabled };
    changed++;
  }
  for (const cs of state.customSources) {
    if (!idSet.has(cs.id)) continue;
    if (cs.enabled === enabled) continue;
    cs.enabled = enabled;
    changed++;
  }

  if (changed > 0) writeStorage(state);
  return changed;
}

export function markIndexed(id: string, when: number, error?: string): void {
  const state = readStorage();
  if (DEFAULT_SOURCES.some((d) => d.id === id)) {
    state.overrides[id] = {
      ...state.overrides[id],
      lastIndexedAt: when,
      lastError: error ?? null,
    };
  } else {
    const idx = state.customSources.findIndex((s) => s.id === id);
    if (idx >= 0) {
      state.customSources[idx].lastIndexedAt = when;
      state.customSources[idx].lastError = error;
    }
  }
  writeStorage(state);
}

export interface AddSourceInput {
  name: string;
  url: string;
  sourceType?: SourceType;
  credibilityTier?: CredibilityTier;
  notes?: string;
  tags?: string[];
}

function deriveDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function addCustomSource(input: AddSourceInput): { ok: true; source: Source } | { ok: false; error: string } {
  const trimmedUrl = input.url.trim();
  if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
    return { ok: false, error: "URL must start with http:// or https://" };
  }
  const domain = deriveDomain(trimmedUrl);
  if (!domain) {
    return { ok: false, error: "Could not parse domain from URL." };
  }
  const name = input.name.trim() || domain;

  const id = `custom-${slugify(name)}-${Date.now().toString(36).slice(-6)}`;
  const source: Source = {
    id,
    name,
    domain,
    url: trimmedUrl,
    sourceType: input.sourceType ?? "general",
    credibilityTier: input.credibilityTier ?? 3,
    enabled: true,
    isCustom: true,
    addedAt: Date.now(),
    tags: input.tags ?? [],
    notes: input.notes,
  };

  const state = readStorage();
  // Reject duplicates by domain
  const existing = listSources().find((s) => s.domain === domain);
  if (existing) {
    return { ok: false, error: `A source for ${domain} already exists (${existing.name}).` };
  }
  state.customSources.push(source);
  writeStorage(state);
  return { ok: true, source };
}

export function removeCustomSource(id: string): boolean {
  const state = readStorage();
  const before = state.customSources.length;
  state.customSources = state.customSources.filter((s) => s.id !== id);
  if (state.customSources.length === before) return false;
  writeStorage(state);
  return true;
}

export function resetRegistry(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
