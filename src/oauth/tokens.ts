/** One refresh owner per stored login and credential version. */

import { deleteSession, getStoredSession, updateAccountSession } from './store.js'
import { RequestError } from '../utils/http.js'

/**
 * The login is missing or gone and only the user can fix it. 403, so the host
 * classifies it AUTH and does not retry; the proxy answers by `status` alone.
 */
export class LoginRequiredError extends RequestError {
  constructor(message: string) {
    super(403, message)
    this.name = 'LoginRequiredError'
  }
}

/**
 * A login imported from a vendor CLI whose own store has also expired. The
 * plugin never redeems the CLI's refresh token (where it rotates, that logs
 * the CLI out), so only the user can fix it — by running that CLI. Not permanent: the
 * login stays and the next reread picks up whatever the CLI wrote.
 */
export class ImportedLoginStale extends LoginRequiredError {
  constructor(displayName: string, cli: string) {
    super(`${displayName} imported login is stale; run ${cli} or use browser login`)
    this.name = 'ImportedLoginStale'
  }
}

/** A reread is adopted only when it outlives this margin (the 09-28 Claude rule). */
const IMPORTED_MIN_TTL_MS = 15_000

/** Fields a reread may replace on a stored login; account labels stay put. */
const IMPORTED_TOKEN_FIELDS = ['accessToken', 'refreshToken', 'idToken', 'expiresAt']

/**
 * How long a transient refresh failure suppresses another attempt for the same
 * credential version. Mirrors CLIProxyAPI's refreshFailureBackoff: without it,
 * every request during a token-endpoint outage re-hammers the endpoint.
 */
export const REFRESH_FAILURE_BACKOFF_MS = 5 * 60_000

/**
 * An expired token cannot fall back to serving, so its backoff is short: the
 * last failure is replayed for this long instead of re-hitting the endpoint on
 * every request, then the next request tries again.
 */
export const REFRESH_EXPIRED_RETRY_MS = 10_000

/**
 * How long an unsettled exchange stays the single owner of its credential
 * version. A second redemption of a rotating refresh token races the first
 * (invalid_grant) — only an exchange hung past this cap is given up on.
 */
export const REFRESH_LATE_CAP_MS = 120_000

/**
 * Longest a request waits on a refresh. The refresh itself keeps running as
 * the single owner of that credential version — a second redemption of a
 * rotating refresh token would be answered with invalid_grant.
 */
export const REFRESH_WAIT_MS = 30_000

/**
 * How long one attempt waits on a refresh exchange (pi-ai bounds the same
 * exchange at 15s). Family refresh calls carry no AbortSignal: a token endpoint
 * that accepts the connection and stalls would otherwise make every request
 * for that account pay the full waiter timeout instead of failing over to a
 * still-valid token. The exchange itself keeps running (REFRESH_LATE_CAP_MS).
 */
export const REFRESH_EXCHANGE_TIMEOUT_MS = 20_000

/** Grant errors every OAuth token endpoint uses for a dead login (RFC 6749 §5.2). */
const PERMANENT_REFRESH_CODES = ['invalid_grant', 'invalid_client', 'unauthorized_client']

export class OAuthEndpointError extends Error {
  declare status: any
  declare oauthCode: any

  constructor(message, status?, oauthCode?) {
    super(message)
    this.name = 'OAuthEndpointError'
    this.status = status
    this.oauthCode = oauthCode
  }
}

/** The OAuth error code in a token-endpoint body: `error` / `error_code`, or `error.code`. */
export function oauthCodeOf(body) {
  let parsed
  try { parsed = JSON.parse(body) } catch { return undefined }
  const error = parsed?.error
  const code = error && typeof error === 'object' ? error.code : error ?? parsed?.error_code
  return typeof code === 'string' && code.length > 0 ? code : undefined
}

export async function oauthError(response, label) {
  let body = ''
  try { body = await response.text() } catch { body = '' }
  const code = oauthCodeOf(body)
  try {
    const parsed = JSON.parse(body)
    const description = parsed.error_description ?? parsed.message
    if (typeof description === 'string' && description.length > 0) {
      return new OAuthEndpointError(`${label}: ${description}`, response.status, code)
    }
  } catch {
    // not JSON
  }
  return new OAuthEndpointError(`${label} request failed (HTTP ${response.status})${body ? `: ${body.slice(0, 240)}` : ''}`, response.status, code)
}

/**
 * The only test for "this login is gone": a structured 401 (`status`, or
 * `permanent` set from one) or an OAuth grant code — the shared ones plus the
 * family's `extraCodes`. 403 / 429 / 5xx and digits in message text are
 * transient: deleting a login on them logs the user out over a blip.
 */
export function isPermanentRefreshFailure(error, extraCodes: readonly string[] = []) {
  if (error?.status === 401 || error?.permanent === true) return true
  const code = error?.oauthCode
  return typeof code === 'string' && (PERMANENT_REFRESH_CODES.includes(code) || extraCodes.includes(code))
}

class RefreshTimeout extends Error {
  constructor(displayName, timeoutMs) {
    super(`${displayName} token refresh timed out after ${timeoutMs}ms`)
    this.name = 'RefreshTimeout'
  }
}

class RefreshExchangeTimeout extends Error {
  constructor(displayName, timeoutMs) {
    super(`${displayName} token exchange timed out after ${timeoutMs}ms`)
    this.name = 'RefreshExchangeTimeout'
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
  /** Family grant codes that are permanent beyond the shared ones. */
  declare permanentCodes: readonly string[]
  declare onRemoved: any
  /** `{ is(session), reread(session), cli }` — logins owned by a vendor CLI's store. */
  declare imported: any
  /** version → when its imported store was last reread (throttles rereads that find nothing newer). */
  declare rereadAt: Map<any, number>
  declare refreshWaitMs: number
  declare exchangeTimeoutMs: number
  /** version → the exchange that owns it: { at, late, promise }. */
  declare inflight: Map<any, any>
  declare failures: Map<any, any>
  declare sources: WeakMap<object, any>

  constructor({ provider, authPath, displayName, preemptMs, refresh, permanentCodes = [], onRemoved, imported, refreshWaitMs = REFRESH_WAIT_MS, exchangeTimeoutMs = REFRESH_EXCHANGE_TIMEOUT_MS }: any) {
    this.provider = provider
    this.authPath = authPath
    this.displayName = displayName
    this.preemptMs = preemptMs
    this.refreshWaitMs = refreshWaitMs
    this.exchangeTimeoutMs = exchangeTimeoutMs
    this.refresh = refresh
    this.permanentCodes = permanentCodes
    this.onRemoved = onRemoved
    this.imported = imported
    this.rereadAt = new Map()
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
    if (!source) throw new LoginRequiredError(`${this.displayName} is not logged in`)
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
    if (!force) {
      // A failure is keyed by credential version, so a new login or rotated
      // token starts clean. A still-valid token keeps serving through the
      // long backoff; an expired one replays the failure only briefly, or one
      // blip would fail every request for the whole window.
      const failed = this.failures.get(source.version)
      const age = failed ? Date.now() - failed.at : Infinity
      if (left > 0 && age < REFRESH_FAILURE_BACKOFF_MS) return this.#serve(source)
      if (left <= 0 && age < REFRESH_EXPIRED_RETRY_MS) throw failed.error
      // A reread that found nothing newer keeps this version: while it is still
      // valid, reread at most once per window instead of on every request
      // (a Keychain reread spawns a process).
      const reread = this.rereadAt.get(source.version)
      if (left > 0 && reread !== undefined && Date.now() - reread < REFRESH_EXPIRED_RETRY_MS) return this.#serve(source)
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
      const transient = error instanceof RefreshTimeout
        || error instanceof RefreshExchangeTimeout
        || this.failures.get(source.version)?.error === error
      if (!force && transient && source.session.expiresAt > Date.now()) return this.#serve(source)
      throw error
    }
    return this.#serve(current)
  }

  #serve(source) {
    this.sources.set(source.session, source)
    return source
  }

  /**
   * Join or start the exchange that owns `source.version` and wait for it at
   * most exchangeTimeoutMs. A timed-out exchange keeps running as the owner —
   * its result is still persisted — until it settles or REFRESH_LATE_CAP_MS
   * passes; only then may a second exchange redeem the same refresh token.
   */
  #start(source) {
    let entry = this.inflight.get(source.version)
    if (!entry || Date.now() - entry.at >= REFRESH_LATE_CAP_MS) {
      const owner: any = { at: Date.now(), late: false }
      owner.promise = this.#refresh(source, owner)
      const clear = () => { if (this.inflight.get(source.version) === owner) this.inflight.delete(source.version) }
      owner.promise.then(clear, clear)
      this.inflight.set(source.version, owner)
      entry = owner
    }
    const attempt = waitFor(entry.promise, this.exchangeTimeoutMs, () => {
      entry.late = true
      const error = new RefreshExchangeTimeout(this.displayName, this.exchangeTimeoutMs)
      this.failures.set(source.version, { at: Date.now(), error })
      return error
    })
    attempt.catch(() => {})
    return attempt
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

  /**
   * An imported login shares its refresh token with the vendor CLI: reread the
   * CLI's store instead of exchanging, and never write that store.
   */
  async #reread(session) {
    const fresh = await this.imported.reread(session)
    if (!(fresh?.expiresAt > Date.now() + IMPORTED_MIN_TTL_MS)) throw new ImportedLoginStale(this.displayName, this.imported.cli)
    const next = { ...session }
    for (const key of IMPORTED_TOKEN_FIELDS) if (fresh[key] !== undefined) next[key] = fresh[key]
    return next
  }

  async #refresh(source, owner) {
    let next
    try {
      if (this.imported?.is(source.session)) {
        this.rereadAt.set(source.version, Date.now())
        next = await this.#reread(source.session)
      } else {
        next = await this.refresh(source.session)
      }
    } catch (error) {
      // A late verdict arrives after its waiters gave up: keep the login and
      // let the next timely exchange decide.
      if (!isPermanentRefreshFailure(error, this.permanentCodes) || owner.late) {
        this.failures.set(source.version, { at: Date.now(), error })
        throw error
      }
      const removed = await deleteSession(this.provider, this.authPath, source.id, source)
      if (removed) this.onRemoved?.()
      // invalid_grant for a token another writer already rotated.
      const successor = removed ? undefined : await this.#successor(source)
      if (successor) return successor
      throw new LoginRequiredError(`${this.displayName} login expired; sign in again`)
    }
    this.failures.delete(source.version)
    // Version-guarded: a late result cannot revive a logged-out or replaced login.
    const saved = await updateAccountSession(this.provider, source, next, this.authPath)
    if (saved) return saved
    const successor = await this.#successor(source)
    if (successor) return successor
    throw new Error(`${this.displayName} session changed; retry the request`)
  }
}

/**
 * The one-shot refresh after an upstream 401 (`run`'s `refresh` hook): the
 * stored login behind `session`, force-refreshed. Undefined when there is none
 * or the refresh fails — the caller then forwards the upstream's own 401.
 */
export async function forcedRefresh(tokens, session) {
  const source = typeof tokens?.sourceOf === 'function' ? tokens.sourceOf(session) : undefined
  if (!source || typeof tokens.refreshNow !== 'function') return undefined
  const next = await tokens.refreshNow(source.id, session.accessToken).catch(() => undefined)
  return next?.session
}
