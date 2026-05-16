import type { SourceType } from "@/providers/types";
import type { CredibilityTier } from "@/source-registry/types";

export interface IndexedDocument {
  id: string;
  url: string;
  canonicalUrl?: string;
  domain: string;
  title: string;
  /** Short user-facing excerpt (≤ 400 chars). */
  snippet: string;
  /** Tokenized & truncated body text used for matching. Bounded for storage. */
  searchText: string;
  sourceType: SourceType;
  credibilityTier: CredibilityTier;
  sourceRegistryId?: string;
  indexedAt: number;
  publishedDate?: string;
  tags: string[];
}

export interface LocalIndexStorage {
  version: 1;
  documents: IndexedDocument[];
}

export interface LocalIndexStats {
  documentCount: number;
  domainCount: number;
  totalBytes: number;
  lastIndexedAt?: number;
}
