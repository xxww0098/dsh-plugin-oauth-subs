/**
 * ZCode CLI poll login. The browser opens authorize_url; the plugin polls
 * until the flow is ready. No loopback, no PKCE, no user code.
 * `region` is `zai` (global) or `bigmodel` (China); the CLI provider id
 * posted to /oauth/cli/init is `zai` or `bigmodel`.
 */

import { GlmBusinessError, GlmHttpError, completeGlmCli, glmCliInit, glmCliPoll } from './index.js'

/**
 * Official poll loop (auth-login-polling.ts): transport errors and
 * 5xx / 408 / 429 retry at the server interval; 4xx and business-envelope
 * failures are terminal. A `failed` poll state is terminal immediately —
 * the browser page it belongs to already gave up.
 */
function isTransientGlmPollError(error) {
  if (error instanceof GlmHttpError) {
    return error.status === 408 || error.status === 429 || error.status >= 500
  }
  if (error instanceof GlmBusinessError) return false
  return true
}

/**
 * Upstream OAuth incidents the client cannot fix. `3004 invalid_flow` is the
 * server killing the flow while exchanging the browser code — reported for
 * BigModel with the desktop app fully out of the loop (zai-org/feedback#718,
 * related #705). `500 { code: 2007 }` is the token endpoint itself failing
 * (zai-org/feedback#523). Both leave a working fallback: the other region
 * button, or a pasted Coding Plan API key.
 */
export function glmLoginFailureMessage(error) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/invalid_flow/i.test(message)) {
    return 'glm authorization failed upstream (invalid_flow): the OAuth server rejected the code exchange — BigModel login is broken server-side (zai-org/feedback#718); retry the other region, or paste a Coding Plan API key in the GLM tab'
  }
  if (/\b2007\b|http error/i.test(message)) {
    return 'glm authorization failed upstream (2007 http error): the OAuth token endpoint is failing (zai-org/feedback#523); retry later, or paste a Coding Plan API key in the GLM tab'
  }
  return message
}

function sleep(ms, signal) {
  return new Promise<void>((resolve, reject) => {
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

export class GlmCliFlowManager {
  declare attempts: Map<string, any>

  constructor() {
    this.attempts = new Map()
  }

  isBusy(provider) {
    return this.attempts.has(provider)
  }

  pending(provider) {
    return this.attempts.get(provider)
  }

  async start(provider, { region = 'zai', fetchFn = fetch } = {}) {
    if (this.attempts.has(provider)) {
      throw new Error(`a ${provider} login attempt is already in progress`)
    }
    const started = await glmCliInit({ region, fetchFn })
    const controller = new AbortController()
    let resolveToken
    let rejectToken
    const tokenPromise = new Promise((resolve, reject) => {
      resolveToken = resolve
      rejectToken = reject
    })
    tokenPromise.catch(() => undefined)

    const settle = (error, ready?) => {
      if (this.attempts.get(provider) !== attempt) return
      this.attempts.delete(provider)
      if (error) rejectToken(error)
      else resolveToken(ready)
    }

    const attempt = {
      authorizeUrl: started.authorizeUrl,
      flowId: started.flowId,
      mode: 'cli',
      waitToken: () => tokenPromise,
      cancel: () => {
        controller.abort(new Error('login cancelled'))
        settle(new Error('login cancelled'))
      },
    }
    this.attempts.set(provider, attempt)

    void (async () => {
      try {
        while (!controller.signal.aborted) {
          if (Date.now() >= started.expiresAt) throw new Error('glm login timed out')
          let poll
          try {
            poll = await glmCliPoll({
              flowId: started.flowId,
              pollToken: started.pollToken,
              region,
              fetchFn,
            })
          } catch (error) {
            if (!isTransientGlmPollError(error)) throw error
            await sleep(started.intervalMs, controller.signal)
            continue
          }
          if (poll.ready) {
            const session = await completeGlmCli(poll, { fetchFn, region })
            settle(undefined, session)
            return
          }
          if (poll.failed) {
            throw new Error(poll.message
              ? `glm authorization failed: ${poll.message}`
              : 'glm authorization failed; start a new login')
          }
          if (poll.unknown) {
            throw new Error(`glm login poll returned status "${poll.status}"`)
          }
          await sleep(started.intervalMs, controller.signal)
        }
      } catch (error) {
        settle(new Error(glmLoginFailureMessage(error)))
      }
    })()

    return attempt
  }
}
