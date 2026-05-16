const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "is", "are", "was", "were", "be", "been",
  "of", "in", "on", "at", "to", "for", "by", "with", "from", "as",
  "it", "this", "that", "these", "those", "have", "has", "had",
  "you", "your", "we", "our", "they", "their", "i", "me", "my",
  "do", "does", "did", "so", "if", "than", "then",
]);

/**
 * Tokenize text for local-index matching.
 * Lowercase, alphanumeric tokens of length ≥ 2, stopwords removed.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  let buf = "";
  for (let i = 0; i < lower.length; i++) {
    const ch = lower.charCodeAt(i);
    // ASCII a-z (97-122) or 0-9 (48-57) or '-' (45)
    if ((ch >= 97 && ch <= 122) || (ch >= 48 && ch <= 57) || ch === 45) {
      buf += lower[i];
    } else {
      if (buf.length >= 2 && !STOPWORDS.has(buf)) tokens.push(buf);
      buf = "";
    }
  }
  if (buf.length >= 2 && !STOPWORDS.has(buf)) tokens.push(buf);
  return tokens;
}

/** Reduce a token list to (token → count). Used for cheap relevance scoring. */
export function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}
