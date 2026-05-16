import { useCallback, useEffect, useState } from "react";

/**
 * useUpdater — wraps `@tauri-apps/plugin-updater` with explicit, user-facing state.
 *
 * Design rules:
 *   - Never silently swallow errors. If something fails, surface the message.
 *   - Never claim "you're up to date" when the endpoint isn't actually configured.
 *   - Never auto-check on startup; user must press the button (per product spec).
 */

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up_to_date"; checkedAt: number }
  | { kind: "available"; version: string; notes?: string; date?: string; checkedAt: number }
  | { kind: "downloading"; downloaded: number; total?: number }
  | { kind: "installed" }
  | { kind: "not_configured"; reason: string }
  | { kind: "error"; message: string };

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

/**
 * Recognise the "the update endpoint isn't really hosted" error shape so we
 * can show an honest "not yet configured" message rather than a misleading
 * generic network error. Matches the placeholder URL we ship in tauri.conf.json
 * and the dns/connection failure modes for unreachable hosts.
 */
function looksLikeUnconfiguredEndpoint(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("placeholder") ||
    m.includes("updates.debateos.local") ||
    m.includes("dns") ||
    m.includes("name resolution") ||
    m.includes("could not resolve") ||
    m.includes("no address associated") ||
    m.includes("failed to lookup")
  );
}

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });
  const [appVersion, setAppVersion] = useState<string>("");

  // Load current app version once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isTauri()) {
        setAppVersion("dev (browser)");
        return;
      }
      try {
        const mod = await import("@tauri-apps/api/app");
        const v = await mod.getVersion();
        if (!cancelled) setAppVersion(v);
      } catch {
        if (!cancelled) setAppVersion("unknown");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const check = useCallback(async () => {
    if (!isTauri()) {
      setState({
        kind: "not_configured",
        reason: "Updates only work in the installed desktop app, not in browser dev mode.",
      });
      return;
    }

    setState({ kind: "checking" });
    try {
      const mod = await import("@tauri-apps/plugin-updater");
      const update = await mod.check();
      if (!update) {
        setState({ kind: "up_to_date", checkedAt: Date.now() });
        return;
      }
      setState({
        kind: "available",
        version: update.version,
        notes: update.body,
        date: update.date,
        checkedAt: Date.now(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (looksLikeUnconfiguredEndpoint(message)) {
        setState({
          kind: "not_configured",
          reason:
            "Update server isn't reachable from this build. " +
            "Updates require a hosted manifest — see RELEASE.md.",
        });
      } else {
        setState({ kind: "error", message });
      }
    }
  }, []);

  const installAndRestart = useCallback(async () => {
    if (state.kind !== "available") return;
    if (!isTauri()) return;

    try {
      const mod = await import("@tauri-apps/plugin-updater");
      const update = await mod.check();
      if (!update) {
        setState({ kind: "up_to_date", checkedAt: Date.now() });
        return;
      }

      let downloaded = 0;
      let total: number | undefined;

      setState({ kind: "downloading", downloaded: 0 });

      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? undefined;
          setState({ kind: "downloading", downloaded: 0, total });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setState({ kind: "downloading", downloaded, total });
        } else if (event.event === "Finished") {
          setState({ kind: "installed" });
        }
      });

      setState({ kind: "installed" });

      // Relaunch the app so the new version takes effect.
      try {
        const proc = await import("@tauri-apps/plugin-process");
        await proc.relaunch();
      } catch {
        // If relaunch fails we still completed the install; the user can restart manually.
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: "error", message });
    }
  }, [state]);

  return { state, appVersion, check, installAndRestart };
}
