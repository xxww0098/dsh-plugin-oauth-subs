/**
 * AWS SSO OIDC device authorization for Builder ID and IAM Identity Center.
 * JSON bodies (not form-urlencoded). Register a public client every login.
 */

import {
  BUILDER_ID_START_URL,
  KIRO_DEFAULT_REGION,
  KIRO_OIDC_SCOPES,
  kiroSession,
  oidcEndpoint,
} from './index.js'

const DEFAULT_INTERVAL_SEC = 5
const DEFAULT_EXPIRES_IN_SEC = 900

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function postJson(url, body, fetchFn, signal) {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })
  const text = await response.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = { error: text }
  }
  return { ok: response.ok, status: response.status, body: parsed, text }
}

export async function registerKiroOidcClient({ region = KIRO_DEFAULT_REGION, startUrl, fetchFn = fetch, signal } = {}) {
  const issuer = startUrl || BUILDER_ID_START_URL
  const result = await postJson(`${oidcEndpoint(region)}/client/register`, {
    clientName: 'dsh-plugin-oauth-subs',
    clientType: 'public',
    scopes: [...KIRO_OIDC_SCOPES],
    grantTypes: [
      'urn:ietf:params:oauth:grant-type:device_code',
      'refresh_token',
    ],
    issuerUrl: issuer,
  }, fetchFn, signal)
  if (!result.ok) throw new Error(`kiro oidc register failed (HTTP ${result.status}): ${result.text.slice(0, 240)}`)
  const clientId = result.body.clientId ?? result.body.client_id
  const clientSecret = result.body.clientSecret ?? result.body.client_secret
  if (!clientId || !clientSecret) throw new Error('kiro oidc register returned no clientId/clientSecret')
  return { clientId, clientSecret, startUrl: issuer, region }
}

export function kiroIdcSession(tokens, registered, { kind = 'builder' } = {}) {
  const startUrl = registered.startUrl || BUILDER_ID_START_URL
  const builder = startUrl === BUILDER_ID_START_URL || kind === 'builder'
  return kiroSession({
    accessToken: tokens.accessToken ?? tokens.access_token,
    refreshToken: tokens.refreshToken ?? tokens.refresh_token,
    expiresIn: tokens.expiresIn ?? tokens.expires_in,
    authMethod: 'idc',
    kiroProvider: builder ? 'BuilderId' : 'Enterprise',
    clientId: registered.clientId,
    clientSecret: registered.clientSecret,
    startUrl,
    region: registered.region,
    authRegion: registered.region,
    apiRegion: registered.region,
  })
}

export class KiroIdcFlowManager {
  constructor() {
    this.attempts = new Map()
  }

  isBusy(provider) {
    return this.attempts.has(provider)
  }

  pending(provider) {
    return this.attempts.get(provider)
  }

  async start(provider, { region = KIRO_DEFAULT_REGION, startUrl = BUILDER_ID_START_URL, kind = 'builder', fetchFn = fetch } = {}) {
    if (this.attempts.has(provider)) {
      throw new Error(`a ${provider} login attempt is already in progress`)
    }
    const issuer = typeof startUrl === 'string' && startUrl.trim() ? startUrl.trim() : BUILDER_ID_START_URL
    const registered = await registerKiroOidcClient({ region, startUrl: issuer, fetchFn })
    const started = await postJson(`${oidcEndpoint(region)}/device_authorization`, {
      clientId: registered.clientId,
      clientSecret: registered.clientSecret,
      startUrl: issuer,
    }, fetchFn)
    if (!started.ok) {
      throw new Error(`kiro device authorization failed (HTTP ${started.status}): ${started.text.slice(0, 240)}`)
    }
    const wire = started.body
    const deviceCode = wire.deviceCode ?? wire.device_code
    const userCode = wire.userCode ?? wire.user_code
    const verificationUri = wire.verificationUri ?? wire.verification_uri
    if (!deviceCode || !userCode || !verificationUri) {
      throw new Error('kiro device authorization is missing deviceCode/userCode/verificationUri')
    }
    const intervalSec = typeof wire.interval === 'number' && wire.interval > 0
      ? wire.interval
      : DEFAULT_INTERVAL_SEC
    const expiresInSec = typeof wire.expiresIn === 'number' && wire.expiresIn > 0
      ? wire.expiresIn
      : typeof wire.expires_in === 'number' && wire.expires_in > 0
        ? wire.expires_in
        : DEFAULT_EXPIRES_IN_SEC

    const controller = new AbortController()
    let resolveToken
    let rejectToken
    const tokenPromise = new Promise((resolve, reject) => {
      resolveToken = resolve
      rejectToken = reject
    })
    tokenPromise.catch(() => undefined)

    const settle = (error, session) => {
      if (this.attempts.get(provider) !== attempt) return
      this.attempts.delete(provider)
      if (error) rejectToken(error)
      else resolveToken(session)
    }

    const attempt = {
      verificationUrl: wire.verificationUriComplete ?? wire.verification_uri_complete ?? verificationUri,
      verificationUri,
      userCode,
      kind,
      waitToken: () => tokenPromise,
      cancel: () => {
        controller.abort(new Error('login cancelled'))
        settle(new Error('login cancelled'))
      },
    }
    this.attempts.set(provider, attempt)

    void (async () => {
      let intervalMs = intervalSec * 1000
      const deadline = Date.now() + expiresInSec * 1000
      while (!controller.signal.aborted) {
        await sleep(intervalMs, controller.signal)
        if (Date.now() >= deadline) throw new Error(`login timed out after ${Math.round(expiresInSec)}s`)
        const polled = await postJson(`${oidcEndpoint(region)}/token`, {
          clientId: registered.clientId,
          clientSecret: registered.clientSecret,
          grantType: 'urn:ietf:params:oauth:grant-type:device_code',
          deviceCode,
        }, fetchFn, controller.signal)
        const access = polled.body.accessToken ?? polled.body.access_token
        if (polled.ok && access) {
          settle(undefined, kiroIdcSession(polled.body, registered, { kind }))
          return
        }
        const error = polled.body.error
        if (error === 'authorization_pending') continue
        if (error === 'slow_down') {
          intervalMs += 5000
          continue
        }
        if (error === 'expired_token') throw new Error('the device code expired before authorization completed')
        if (error === 'access_denied') throw new Error('login declined on the authorization page')
        throw new Error(`kiro device-flow polling failed: ${polled.body.error_description ?? error ?? `HTTP ${polled.status}`}`)
      }
    })().catch((error) => {
      settle(error instanceof Error ? error : new Error(String(error)))
    })

    return attempt
  }
}
