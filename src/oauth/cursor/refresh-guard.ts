/**
 * Short in-process backoff for a Cursor refresh token that already failed.
 * A stale CLI Keychain entry must not stall every Settings snapshot.
 */

const FAILED = new Map()
const BACKOFF_MS = 10 * 60_000

function keyOf(token) {
  return typeof token === 'string' && token.trim() ? token.trim() : ''
}

export function isCursorRefreshKnownBad(token, now = Date.now()) {
  const key = keyOf(token)
  if (!key) return false
  const until = FAILED.get(key)
  if (until === undefined) return false
  if (until <= now) {
    FAILED.delete(key)
    return false
  }
  return true
}

export function markCursorRefreshFailed(token, now = Date.now()) {
  const key = keyOf(token)
  if (!key) return
  FAILED.set(key, now + BACKOFF_MS)
}

export function markCursorRefreshSucceeded(token) {
  const key = keyOf(token)
  if (key) FAILED.delete(key)
}

export function resetCursorRefreshGuard() {
  FAILED.clear()
}
