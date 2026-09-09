import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerRpc } from '../lib/index.js'

/**
 * Cordis-like inject scope: undeclared service reads throw the same class of
 * error as `cannot get property "webServer" without inject`. DSH
 * `rpc.handle` then does `owner.webServer.register` on that accessing
 * context; missing webServer means the `/oauth-subs-auth` prefix never
 * mounts and the SPA fallback answers POST with 405.
 */
function cordisLike(allowed) {
  const prefixes = new Map()
  const scope = new Proxy(Object.create(null), {
    get(_target, prop) {
      if (prop === 'get') {
        return (name) => {
          if (!allowed.includes(name)) {
            throw new Error(`cannot get property "${name}" without inject`)
          }
          return scope[name]
        }
      }
      if (typeof prop !== 'string') return undefined
      if (!allowed.includes(prop)) {
        throw new Error(`cannot get property "${prop}" without inject`)
      }
      if (prop === 'connection') {
        const original = {
          ctx: {},
          get rpc() {
            const owner = this.ctx
            return {
              handle(channel, handler) {
                owner.webServer.register({
                  kind: 'prefix',
                  path: channel,
                  handler,
                })
                prefixes.set(channel, handler)
                return () => prefixes.delete(channel)
              },
            }
          },
        }
        const traced = Object.create(original)
        traced[Symbol.for('cordis.original')] = original
        return traced
      }
      if (prop === 'webServer') {
        return {
          register(route) {
            prefixes.set(route.path, route)
            return () => prefixes.delete(route.path)
          },
        }
      }
      return undefined
    },
  })
  return { scope, prefixes }
}

test('RPC status mounts on /oauth-subs-auth when webServer is in the inject scope', async () => {
  const snapshot = { version: '0.0.83', accounts: {} }
  let captured
  const ctx = {
    logger: { warn() {} },
    inject(deps, callback) {
      const { scope, prefixes } = cordisLike(deps)
      callback(scope)
      captured = { deps, prefixes }
    },
  }

  try {
    registerRpc(ctx, { snapshot: async () => snapshot })
  } catch {
    // Cordis fiber logs this and leaves the channel unmounted.
  }

  const handler = captured?.prefixes.get('/oauth-subs-auth')
  assert.equal(
    typeof handler,
    'function',
    `channel missing after inject ${JSON.stringify(captured.deps)}; SPA fallback would 405 POST /oauth-subs-auth/status`,
  )
  const result = await handler('status', {})
  assert.deepEqual(result, { ok: true, value: snapshot })
})
