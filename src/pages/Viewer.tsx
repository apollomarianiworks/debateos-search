import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * In-app result viewer.
 *
 * Default path: embed the page in a sandboxed iframe so the user stays
 * inside DebateOS Search. Many sites set `X-Frame-Options: DENY` or a strict
 * `frame-ancestors` CSP, which the iframe cannot bypass — for those we
 * surface two escape hatches:
 *
 *   - "Open in window"  → creates a new Tauri WebviewWindow (proper desktop
 *                         child window, no X-Frame-Options restriction)
 *   - "Open externally" → hands off to the system default browser
 *
 * Both are always available; we also auto-prompt after 4s if the iframe
 * hasn't reported a load event.
 */

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

async function openInTauriWindow(url: string, title: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const mod = await import("@tauri-apps/api/webviewWindow");
  // Labels must be unique per window and ASCII-safe
  const label = `viewer-${Date.now().toString(36)}`;
  new mod.WebviewWindow(label, {
    url,
    title: title.slice(0, 80) || url,
    width: 1100,
    height: 820,
    minWidth: 800,
    minHeight: 500,
    center: true,
    decorations: true,
    resizable: true,
  });
}

async function openExternally(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const mod = await import("@tauri-apps/plugin-shell");
  await mod.open(url);
}

export function Viewer() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const url = params.get("url") ?? "";
  const initialTitle = params.get("title") ?? "";
  const domain = params.get("domain") ?? "";

  const [hasLoaded, setHasLoaded] = useState(false);
  const [maybeBlocked, setMaybeBlocked] = useState(false);

  useEffect(() => {
    // If we haven't seen a load event after 4s, the site likely refused
    // to embed. Surface a gentle prompt without forcing the user out.
    const timer = setTimeout(() => {
      if (!hasLoaded) setMaybeBlocked(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [hasLoaded]);

  if (!url) {
    return (
      <div className="page">
        <div className="container settings-page">
          <div className="empty-state">
            <div className="empty-state__title">No URL provided</div>
            <button className="btn btn--ghost" onClick={() => navigate("/")}>← Home</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="viewer">
      <header className="viewer__bar">
        <button
          className="viewer__back"
          onClick={() => navigate(-1)}
          aria-label="Back to results"
          title="Back"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        <div className="viewer__title-wrap" title={url}>
          {initialTitle && <div className="viewer__title">{initialTitle}</div>}
          <div className="viewer__url">{domain || url}</div>
        </div>

        <div className="viewer__actions">
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => openInTauriWindow(url, initialTitle || domain)}
            title="Open this page in a separate app window (works for sites that block embedding)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
            </svg>
            Open in window
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => openExternally(url)}
            title="Open in your default web browser"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Open externally
          </button>
        </div>
      </header>

      {maybeBlocked && !hasLoaded && (
        <div className="viewer__blocked-banner">
          This page may not allow embedding. Try
          <button className="viewer__inline-link" onClick={() => openInTauriWindow(url, initialTitle || domain)}>
            opening in a window
          </button>
          or
          <button className="viewer__inline-link" onClick={() => openExternally(url)}>
            opening externally
          </button>
          .
        </div>
      )}

      <iframe
        ref={iframeRef}
        className="viewer__frame"
        src={url}
        title={initialTitle || domain || "Result"}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        onLoad={() => setHasLoaded(true)}
        onError={() => setMaybeBlocked(true)}
      />
    </div>
  );
}
