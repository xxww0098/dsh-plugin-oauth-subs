/** One refresh owner per stored login and credential version. */

import { deleteSession, getStoredSession, updateAccountSession } from './store.js'

/**
 * How long a transient refresh failure suppresses another attempt for the same
 * credential version. Mirrors CLIProxyAPI's refreshFailureBackoff: without it,
 * every request during a token-endpoint outage re-hammers the endpoint.
 */
export const REFRESH_FAILURE_BACKOFF_MS = 5 * 60_000

export class TokenManager {
  constructor({ provider, authPath, displayName, preemptMs, refresh, isPermanent, onRemoved }) {
    this.provider = provider
    this.authPath = authPath
    this.displayName = displayName
    this.preemptMs = preemptMs
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
    const due = source.session.expiresAt - Date.now() <= this.preemptMs
    if (!force && !due) {
      this.sources.set(source.session, source)
      return source
    }
    const failed = this.failures.get(source.version)
    if (!force && failed && Date.now() - failed.at < REFRESH_FAILURE_BACKOFF_MS) {
      if (source.session.expiresAt > Date.now()) {
        this.sources.set(source.session, source)
        return source
      }
      throw failed.error
    }
    let pending = this.inflight.get(source.version)
    if (!pending) {
      pending = this.#refresh(source).finally(() => this.inflight.delete(source.version))
      this.inflight.set(source.version, pending)
    }
    let current
    try {
      current = await pending
    } catch (error) {
      // A transient endpoint failure must not kill a request whose access
      // token is still valid — serve it and let the backoff retry later.
      // Forced refreshes (post-401) rethrow instead: the proxy needs a
      // rotated token or nothing, never the token that just failed.
      if (!force && this.failures.get(source.version)?.error === error && source.session.expiresAt > Date.now()) {
        this.sources.set(source.session, source)
        return source
      }
      throw error
    }
    this.failures.delete(source.version)
    this.sources.set(current.session, current)
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
        throw new Error(`${this.displayName} login expired; sign in again`)
      }
      this.failures.set(source.version, { at: Date.now(), error })
      throw error
    }
    const saved = await updateAccountSession(this.provider, source, next, this.authPath)
    if (!saved) throw new Error(`${this.displayName} session changed; retry the request`)
    return saved
  }
}
