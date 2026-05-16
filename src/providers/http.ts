export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

export async function platformFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (isTauri()) {
    const mod = await import("@tauri-apps/plugin-http");
    return mod.fetch(url, init);
  }
  return fetch(url, init);
}

export function stripHtml(input: string | undefined | null): string {
  if (!input) return "";
  return input
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function domainFromUrl(url: string, fallback: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return fallback;
  }
}

export function clampLimit(pageSize: number | undefined, min = 3, max = 10): number {
  return Math.max(min, Math.min(max, pageSize ?? min));
}
