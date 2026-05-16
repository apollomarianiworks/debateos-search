import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/store/appStore";
import type { AppSettings } from "@/store/appStore";
import { buildBraveProvider, ProviderError } from "@/providers";

interface TauriSettings {
  brave_api_key: string;
  active_provider: string;
  safe_search: boolean;
  results_per_page: number;
  restore_last_session?: boolean;
  search_mode?: string;
  preferred_categories?: string[];
}

function toStore(s: TauriSettings): Partial<AppSettings> {
  return {
    braveApiKey: s.brave_api_key,
    activeProvider: s.active_provider === "brave" ? "brave" : "mock",
    safeSearch: s.safe_search,
    resultsPerPage: s.results_per_page,
    restoreLastSession: s.restore_last_session ?? true,
    searchMode: s.search_mode === "research" ? "research" : "standard",
  };
}

function toTauri(s: AppSettings): TauriSettings {
  return {
    brave_api_key: s.braveApiKey,
    active_provider: s.activeProvider,
    safe_search: s.safeSearch,
    results_per_page: s.resultsPerPage,
    restore_last_session: s.restoreLastSession,
    search_mode: s.searchMode,
    preferred_categories: ["all"],
  };
}

export function useSettings() {
  const { settings, updateSettings } = useAppStore();
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    invoke<TauriSettings>("get_settings")
      .then((s) => updateSettings(toStore(s)))
      .catch(() => {
        // Running outside Tauri (browser dev) — defaults are fine
      });
  }, [updateSettings]);

  /**
   * Save settings — partial updates are merged with the current settings.
   * Persisted to the Tauri-side settings file when running in Tauri.
   */
  const saveSettings = useCallback(
    async (partial: Partial<AppSettings>) => {
      const merged = { ...settings, ...partial };
      updateSettings(partial);
      try {
        await invoke("save_settings", { settings: toTauri(merged) });
      } catch {
        // ignore — running in browser dev
      }
    },
    [settings, updateSettings]
  );

  /**
   * Verify the Brave API key is valid by issuing a tiny test query.
   * Returns true/false; never throws.
   */
  const testBraveKey = useCallback(async (apiKey: string): Promise<TestKeyResult> => {
    if (!apiKey || apiKey.trim().length === 0) {
      return { ok: false, message: "Enter a Brave API key first." };
    }
    const provider = buildBraveProvider(apiKey);
    try {
      await provider.testKey();
      return { ok: true, message: "Key works! Brave Search is ready to use." };
    } catch (err) {
      if (err instanceof ProviderError) {
        return { ok: false, message: err.friendlyMessage };
      }
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Could not verify the API key.",
      };
    }
  }, []);

  return { settings, saveSettings, testBraveKey };
}

export interface TestKeyResult {
  ok: boolean;
  message: string;
}
