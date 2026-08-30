/**
 * Shared shard pin for Codex / Grok / GLM / Antigravity.
 * Sanitize to 1–64 of [A-Za-z0-9._:-] instead of dropping the key —
 * a too-long DSH session id must still stick.
 */
export function codexCacheSessionId(key) {
  if (typeof key !== 'string') return undefined
  const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-')
  if (!cleaned) return undefined
  return cleaned.slice(0, 64)
}
