import { useUpdater } from "@/hooks/useUpdater";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdatesSection() {
  const { state, appVersion, check, installAndRestart } = useUpdater();

  return (
    <div className="settings-section">
      <div className="settings-section__title">About &amp; Updates</div>

      <div className="updates-row">
        <div>
          <div className="form-label" style={{ marginBottom: 0 }}>DebateOS Search</div>
          <p className="form-hint" style={{ marginTop: 2 }}>
            Version <strong>{appVersion || "loading…"}</strong>
          </p>
        </div>
        <button
          className="btn btn--ghost"
          onClick={check}
          disabled={state.kind === "checking" || state.kind === "downloading"}
        >
          {state.kind === "checking" ? "Checking…" : "Check for updates"}
        </button>
      </div>

      {state.kind === "up_to_date" && (
        <p className="form-hint form-hint--success" style={{ marginTop: 10 }}>
          ✓ You&apos;re on the latest version.
        </p>
      )}

      {state.kind === "available" && (
        <div className="update-available">
          <div className="update-available__head">
            <div>
              <div className="update-available__version">
                Update available · v{state.version}
              </div>
              {state.date && (
                <div className="update-available__date">Released {state.date}</div>
              )}
            </div>
            <button className="btn btn--primary" onClick={installAndRestart}>
              Download &amp; install
            </button>
          </div>
          {state.notes && (
            <pre className="update-available__notes">{state.notes}</pre>
          )}
        </div>
      )}

      {state.kind === "downloading" && (
        <div className="update-progress">
          <div className="update-progress__label">
            Downloading update…{" "}
            {state.total
              ? `${formatBytes(state.downloaded)} / ${formatBytes(state.total)}`
              : formatBytes(state.downloaded)}
          </div>
          <div className="update-progress__bar">
            <div
              className="update-progress__fill"
              style={{
                width: state.total
                  ? `${Math.min(100, (state.downloaded / state.total) * 100)}%`
                  : "30%",
              }}
            />
          </div>
        </div>
      )}

      {state.kind === "installed" && (
        <p className="form-hint form-hint--success" style={{ marginTop: 10 }}>
          ✓ Update installed. Restarting…
        </p>
      )}

      {state.kind === "not_configured" && (
        <p className="form-hint" style={{ marginTop: 10 }}>
          <strong>Updates not yet wired for this build.</strong> {state.reason}
        </p>
      )}

      {state.kind === "error" && (
        <p className="form-hint form-hint--error" style={{ marginTop: 10 }}>
          ✕ {state.message}
        </p>
      )}

      <p className="form-hint" style={{ marginTop: 12 }}>
        Updates are checked manually — there are no startup popups. The app verifies
        every downloaded update with a signing key before installing.
      </p>
    </div>
  );
}
