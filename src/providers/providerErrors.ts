export type ProviderErrorKind =
  | "missing_api_key"
  | "invalid_api_key"
  | "rate_limited"
  | "network"
  | "server"
  | "unknown";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly provider: string;
  readonly canFallback: boolean;

  constructor(kind: ProviderErrorKind, provider: string, message: string, canFallback = true) {
    super(message);
    this.kind = kind;
    this.provider = provider;
    this.canFallback = canFallback;
    this.name = "ProviderError";
  }

  /**
   * Friendly user-facing message safe to surface in the UI.
   * Always includes the underlying detail so the user can actually diagnose issues
   * rather than being stuck with a generic "check your connection" message.
   */
  get friendlyMessage(): string {
    const detail = this.message ? ` — ${this.message}` : "";
    switch (this.kind) {
      case "missing_api_key":
        return `${this.provider} requires an API key. Add one in Settings, or continue with demo results.`;
      case "invalid_api_key":
        return `${this.provider} rejected the API key. Double-check it in Settings${detail}`;
      case "rate_limited":
        return `${this.provider} rate limit reached. Showing demo results — try again in a moment.`;
      case "network":
        return `Could not reach ${this.provider}${detail}`;
      case "server":
        return `${this.provider} returned an error${detail}`;
      default:
        return `Search failed${detail}`;
    }
  }
}

export function isProviderError(err: unknown): err is ProviderError {
  return err instanceof ProviderError;
}
