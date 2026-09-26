/** One refresh owner per stored login and credential version. */

import { deleteSession, getStoredSession, updateAccountSession } from './store.js'

/**
 * How long a transient refresh failure suppresses another attempt for the same
 * credential version. Mirrors CLIProxyAPI's refreshFailureBackoff: without it,
 * every request during a token-endpoint outage re-hammers the endpoint.
 */
export const REFRESH_FAILURE_BACKOFF_MS = 5 * 60_000

/**
 * Longest a request waits on a refresh. The refresh itself keeps running as
 * the single owner of that credential version — a second redemption of a
 * rotating refresh token would be answered with invalid_grant.
 */
export const REFRESH_WAIT_MS = 30_000

class RefreshTimeout extends Error {
  constructor(displayName, timeoutMs) {
    super(`${displayName} token refresh timed out after ${timeoutMs}ms`)
    this.name = 'RefreshTimeout'
  }
}

function waitFor(promise, timeoutMs, onTimeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), timeoutMs)
    timer.unref?.()
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

export class TokenManager {
  declare provider: string
  declare authPath: string
  declare displayName: string
  declare preemptMs: number
  /** Injected refresh callback; distinct from the private #refresh method. */
  declare refresh: any
  declare isPermanent: any
  declare onRemoved: any
  declare refreshWaitMs: number
  declare inflight: Map<any, any>
  declare failures: Map<any, any>
  declare sources: WeakMap<object, any>

  constructor({ provider, authPath, displayName, preemptMs, refresh, isPermanent, onRemoved, refreshWaitMs = REFRESH_WAIT_MS }: any) {
    this.provider = provider
    this.authPath = authPath
    this.displayName = displayName
    this.preemptMs = preemptMs
    this.refreshWaitMs = refreshWaitMs
    this.refresh = refresh
    this.isPermanent = isPermanent
    this.onRemoved = onRemoved
    this.inflight = new Map()
    this.failures = new Map()
    this.sources = new WeakMap()
  }

  async session(id) {
    return (await this.account(id)).session
  }

  /** The stored-account row that produced this session, when known. */
  sourceOf(session) {
    return this.sources.get(session)
  }

  async account(id) {
    const source = await getStoredSession(this.provider, id, this.authPath)
    if (!source) throw new Error(`${this.displayName} is not logged in`)
    return this.#resolve(source, { force: false })
  }

  /**
   * Refresh the stored login regardless of its expiry window — the proxy calls
   * this after an upstream 401 (CLIProxyAPI's tryRefreshAfterUnauthorized). A
   * concurrent refresh that already rotated the failed access token is reused
   * instead of forcing a second redemption of the same refresh token.
   */
  async refreshNow(id, failedAccessToken) {
    const source = await getStoredSession(this.provider, id, this.authPath)
    if (!source) return undefined
    const rotated = typeof failedAccessToken === 'string' && failedAccessToken.length > 0
      && source.session.accessToken !== failedAccessToken
    if (rotated && source.session.expiresAt - Date.now() > this.preemptMs) {
      this.sources.set(source.session, source)
      return source
    }
    return this.#resolve(source, { force: true })
  }

  async #resolve(source, { force }) {
    const left = source.session.expiresAt - Date.now()
    if (!force && left > this.preemptMs) return this.#serve(source)
    if (!force && left > 0) {
      // The backoff only spares a still-valid token; an expired one always
      // retries, or one blip would fail every request for the whole window.
      const failed = this.failures.get(source.version)
      if (failed && Date.now() - failed.at < REFRESH_FAILURE_BACKOFF_MS) return this.#serve(source)
      if (left > this.refreshWaitMs) {
        this.#start(source)
        return this.#serve(source)
      }
    }
    let current
    try {
      current = await waitFor(this.#start(source), this.refreshWaitMs, () => new RefreshTimeout(this.displayName, this.refreshWaitMs))
    } catch (error) {
      // A transient endpoint failure must not kill a request whose access
      // token is still valid. Forced refreshes (post-401) rethrow instead:
      // the proxy needs a rotated token or nothing.
      const transient = error instanceof RefreshTimeout || this.failures.get(source.version)?.error === error
      if (!force && transient && source.session.expiresAt > Date.now()) return this.#serve(source)
      throw error
    }
    return this.#serve(current)
  }

  #serve(source) {
    this.sources.set(source.session, source)
    return source
  }

  #start(source) {
    let pending = this.inflight.get(source.version)
    if (!pending) {
      pending = this.#refresh(source).finally(() => this.inflight.delete(source.version))
      pending.catch(() => {})
      this.inflight.set(source.version, pending)
    }
    return pending
  }

  /** The stored login that superseded `source` (another writer rotated it), if still usable. */
  async #successor(source) {
    const current = await getStoredSession(this.provider, source.id, this.authPath)
    if (!current || current.version === source.version || current.session.expiresAt <= Date.now()) return undefined
    return current
  }

  async remember(session, fields) {
    const source = this.sources.get(session)
    if (!source) return
    await updateAccountSession(this.provider, source, { ...session, ...fields }, this.authPath)
  }

  async #refresh(source) {
    let next
    try {
      next = await this.refresh(source.session)
    } catch (error) {
      if (this.isPermanent(error)) {
        const removed = await deleteSession(this.provider, this.authPath, source.id, source)
        if (removed) this.onRemoved?.()
        // invalid_grant for a token another writer already rotated.
        const successor = removed ? undefined : await this.#successor(source)
        if (successor) return successor
        throw new Error(`${this.displayName} login expired; sign in again`)
      }
      this.failures.set(source.version, { at: Date.now(), error })
      throw error
    }
    this.failures.delete(source.version)
    const saved = await updateAccountSession(this.provider, source, next, this.authPath)
    if (saved) return saved
    const successor = await this.#successor(source)
    if (successor) return successor
    throw new Error(`${this.displayName} session changed; retry the request`)
  }
}
