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
function cordisLike(allowed, extras = {}) {
  const prefixes = extras.prefixes ?? new Map()
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
        if (extras.connection) return extras.connection
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
  const calls = []
  const ctx = {
    logger: { warn() {} },
    inject(deps, callback) {
      const { scope, prefixes } = cordisLike(deps)
      callback(scope)
      calls.push({ deps, prefixes })
    },
  }

  try {
    registerRpc(ctx, { snapshot: async () => snapshot })
  } catch {
    // Cordis fiber logs this and leaves the channel unmounted.
  }

  const web = calls.find((call) => call.deps.includes('webServer'))
  const handler = web?.prefixes.get('/oauth-subs-auth')
  assert.equal(
    typeof handler,
    'function',
    `channel missing after inject ${JSON.stringify(calls.map((call) => call.deps))}; SPA fallback would 405 POST /oauth-subs-auth/status`,
  )
  const result = await handler('status', {})
  assert.deepEqual(result, { ok: true, value: snapshot })
})

test('RPC fetch routes mount under /api when webServer is disabled', async () => {
  const snapshot = { version: '0.0.93', accounts: {} }
  const routes = new Map()
  const connection = {
    fetch: {
      register(route) {
        routes.set(route.path, route)
        return () => routes.delete(route.path)
      },
    },
  }
  const ctx = {
    logger: { warn() {}, info() {} },
    inject(deps, callback) {
      // Electron desktop composition disables the webserver row, so an
      // inject list that includes it never fires.
      if (deps.includes('webServer')) return
      if (deps.includes('connection')) callback({ connection })
    },
  }

  registerRpc(ctx, { snapshot: async () => snapshot })

  const route = routes.get('/api/oauth-subs-auth/status')
  assert.equal(typeof route?.fetch, 'function', 'missing POST /api/oauth-subs-auth/status')
  assert.deepEqual(route.methods, ['POST'])
  const response = await route.fetch(new Request('http://127.0.0.1/api/oauth-subs-auth/status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'r1',
      method: 'oauth-subs-auth/status',
      payload: {},
    }),
  }))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.type, 'server-response')
  assert.equal(body.rpcId, 'r1')
  assert.deepEqual(body.result, { ok: true, value: snapshot })
})

test('RPC fetch routes mount via ctx.get when inject never fires', async () => {
  const snapshot = { version: '0.0.93', accounts: { grok: { id: 'g1' } } }
  const routes = new Map()
  const connection = {
    fetch: {
      register(route) {
        routes.set(route.path, route)
        return () => routes.delete(route.path)
      },
    },
  }
  const ctx = {
    logger: { warn() {} },
    get(name) {
      if (name === 'connection') return connection
      throw new Error(`cannot get property "${name}" without inject`)
    },
    inject() {
      // Desktop host: inject callbacks for connection do not run.
    },
  }

  registerRpc(ctx, { snapshot: async () => snapshot })

  const route = routes.get('/api/oauth-subs-auth/status')
  assert.equal(typeof route?.fetch, 'function')
  const response = await route.fetch(new Request('http://127.0.0.1/api/oauth-subs-auth/status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rpcId: 'r2', method: 'status', payload: {} }),
  }))
  const body = await response.json()
  assert.deepEqual(body.result, { ok: true, value: snapshot })
})
