import { create } from "zustand";
import type { SearchVertical } from "@/providers/types";
import type { RankedResult, CacheStatus, SearchMode } from "@/search-engine/types";

export interface AppSettings {
  braveApiKey: string;
  activeProvider: "mock" | "brave";
  safeSearch: boolean;
  resultsPerPage: number;
  restoreLastSession: boolean;
  searchMode: SearchMode;
}

export interface HistoryEntry {
  id: number;
  query: string;
  timestamp: number;
  resultCount: number;
}

export interface ResultsMeta {
  provider: string;
  /** Set of provider IDs that contributed results (e.g. ["brave", "local"]). */
  providersUsed: string[];
  fallbackUsed: boolean;
  fallbackReason?: string;
  /** Set when web provider failed but other sources returned results. */
  webErrorMessage?: string;
  cacheStatus: CacheStatus;
  cacheAgeMs: number;
  durationMs: number;
  totalEstimated: number;
  localResultCount: number;
}

const defaultSettings: AppSettings = {
  braveApiKey: "",
  activeProvider: "mock",
  safeSearch: true,
  resultsPerPage: 10,
  restoreLastSession: true,
  searchMode: "standard",
};

const LAST_QUERY_KEY = "debateos:last-query";

function readLastQuery(): string {
  if (typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(LAST_QUERY_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeLastQuery(q: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LAST_QUERY_KEY, q);
  } catch {
    // ignore
  }
}

interface SearchState {
  query: string;
  activeVertical: SearchVertical;
  results: RankedResult[];
  meta: ResultsMeta;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  hasSearched: boolean;
  lastQuery: string;

  settings: AppSettings;
  history: HistoryEntry[];

  /** Source IDs currently being indexed — survives navigation between pages. */
  indexingInFlight: Set<string>;

  // setters
  setQuery: (q: string) => void;
  setIndexing: (id: string, indexing: boolean) => void;
  setActiveVertical: (v: SearchVertical) => void;
  setResults: (payload: { results: RankedResult[]; meta: ResultsMeta }) => void;
  setLoading: (v: boolean) => void;
  setRefreshing: (v: boolean) => void;
  setError: (e: string | null) => void;
  rememberQuery: (q: string) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  setHistory: (h: HistoryEntry[]) => void;
  addHistoryEntry: (entry: HistoryEntry) => void;
}

const emptyMeta: ResultsMeta = {
  provider: "",
  providersUsed: [],
  fallbackUsed: false,
  cacheStatus: "miss",
  cacheAgeMs: 0,
  durationMs: 0,
  totalEstimated: 0,
  localResultCount: 0,
};

export const useAppStore = create<SearchState>((set) => ({
  query: "",
  activeVertical: "all",
  results: [],
  meta: emptyMeta,
  isLoading: false,
  isRefreshing: false,
  error: null,
  hasSearched: false,
  lastQuery: readLastQuery(),

  settings: defaultSettings,
  history: [],
  indexingInFlight: new Set<string>(),

  setIndexing: (id, indexing) =>
    set((state) => {
      const next = new Set(state.indexingInFlight);
      if (indexing) next.add(id);
      else next.delete(id);
      return { indexingInFlight: next };
    }),

  setQuery: (q) => set({ query: q }),
  setActiveVertical: (v) => set({ activeVertical: v }),
  setResults: ({ results, meta }) =>
    set({ results, meta, hasSearched: true, error: null }),
  setLoading: (v) => set({ isLoading: v }),
  setRefreshing: (v) => set({ isRefreshing: v }),
  setError: (e) => set({ error: e, isLoading: false }),
  rememberQuery: (q) => {
    writeLastQuery(q);
    set({ lastQuery: q });
  },
  updateSettings: (partial) =>
    set((state) => ({ settings: { ...state.settings, ...partial } })),
  setHistory: (h) => set({ history: h }),
  addHistoryEntry: (entry) =>
    set((state) => ({ history: [entry, ...state.history].slice(0, 100) })),
}));
