import type { SourceType } from "@/providers/types";

/** Credibility tier (1=highest, 5=lowest). Used as a coarse default before per-domain scoring. */
export type CredibilityTier = 1 | 2 | 3 | 4 | 5;

export interface Source {
  id: string;
  name: string;
  domain: string;
  url: string;
  sourceType: SourceType;
  credibilityTier: CredibilityTier;
  notes?: string;
  enabled: boolean;
  /** Default sources have `isCustom = false`; user-added ones are true. */
  isCustom: boolean;
  /** 0 for default sources, epoch ms for user-added. */
  addedAt: number;
  /** undefined if never indexed. */
  lastIndexedAt?: number;
  /** Most recent indexing error message, if any. */
  lastError?: string;
  tags: string[];
}

export interface SourceOverride {
  enabled?: boolean;
  lastIndexedAt?: number;
  lastError?: string | null;
  notes?: string;
}

export interface SourceRegistryStorage {
  version: 1;
  customSources: Source[];
  overrides: Record<string, SourceOverride>;
}
