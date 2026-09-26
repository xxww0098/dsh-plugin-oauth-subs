import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { accountIdOf, getSession, listStoredSessions, replaceAccountId, saveSession, updateAccountSession } from '../lib/oauth/store.js'
import { kiroSession } from '../lib/oauth/kiro/index.js'
import { createProxy } from '../lib/oauth/proxy.js'
import { CODEX_API_URL, CODEX_TOKEN_URL } from '../lib/oauth/codex/index.js'
import { ANTIGRAVITY_GENERATE_URL } from '../lib/oauth/antigravity/index.js'

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function account(name, expired = false) {
  return kiroSession({
    accessToken: `access-${name}`,
    refreshToken: `rt_${name.repeat(120)}`,
    account: `${name}@example.test`,
    authMethod: 'social',
    expiresAt: Date.now() + (expired ? -1000 : 3_600_000),
  })
}

async function fixture(t, fetchFn, onAuthChanged) {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-lifecycle-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const authPath = join(dir, 'auth.json')
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    fetchFn,
    onAuthChanged,
    readFileFn: () => { throw new Error('fixture has no installed package metadata') },
    cursorAutoImport: false,
    ollamaAutoImport: false,
    kimiAutoImport: false,
    copilotAutoImport: false,
  })
  await controller.prefsReady
  return { controller, authPath }
}

test('switching accounts during refresh keeps new requests and persistence on the selected account', { timeout: 5000 }, async (t) => {
  const refreshing = deferred()
  const release = deferred()
  const switched = deferred()
  const a = account('a', true)
  const b = account('b')
  const { controller, authPath } = await fixture(t, async (url) => {
    if (String(url).endsWith('/refreshToken')) {
      refreshing.resolve()
      await release.promise
      return Response.json({ accessToken: 'refreshed-a', refreshToken: a.refreshToken, expiresIn: 3600 })
    }
    return Response.json({})
  }, () => switched.resolve())
  await saveSession('kiro', b, authPath)
  await saveSession('kiro', a, authPath)

  const first = controller.tokens.kiro.session()
  await refreshing.promise
  const switching = controller.switchAccount('kiro', accountIdOf('kiro', b))
  await switched.promise
  const second = controller.tokens.kiro.session()
  release.resolve()
  const [oldRequest, newRequest] = await Promise.all([first, second, switching])

  assert.equal(oldRequest.account, a.account)
  assert.equal(newRequest.account, b.account)
  assert.equal(newRequest.accessToken, b.accessToken)
  assert.equal((await getSession('kiro', authPath)).account, b.account)
  const rows = await listStoredSessions('kiro', authPath)
  assert.equal(rows.find((row) => row.session.account === a.account).session.accessToken, 'refreshed-a')
})

test('a permanent refresh failure removes only its originating account after a switch', { timeout: 5000 }, async (t) => {
  const refreshing = deferred()
  const release = deferred()
  const switched = deferred()
  const a = account('a', true)
  const b = account('b')
  const { controller, authPath } = await fixture(t, async (url) => {
    if (String(url).endsWith('/refreshToken')) {
      refreshing.resolve()
      await release.promise
      return Response.json({ error: 'invalid_grant' }, { status: 400 })
    }
    return Response.json({})
  }, () => switched.resolve())
  await saveSession('kiro', b, authPath)
  await saveSession('kiro', a, authPath)

  const failed = assert.rejects(controller.tokens.kiro.session(), /login expired/)
  await refreshing.promise
  const switching = controller.switchAccount('kiro', accountIdOf('kiro', b))
  await switched.promise
  release.resolve()
  await Promise.all([failed, switching])

  assert.equal((await getSession('kiro', authPath))?.accessToken, b.accessToken)
  assert.deepEqual((await listStoredSessions('kiro', authPath)).map((row) => row.session.account), [b.account])
})

test('logout while refresh is pending cannot restore the removed login', { timeout: 5000 }, async (t) => {
  const refreshing = deferred()
  const release = deferred()
  const a = account('a', true)
  const { controller, authPath } = await fixture(t, async (url) => {
    assert.ok(String(url).endsWith('/refreshToken'))
    refreshing.resolve()
    await release.promise
    return Response.json({ accessToken: 'refreshed-a', refreshToken: a.refreshToken, expiresIn: 3600 })
  })
  await saveSession('kiro', a, authPath)
  const result = controller.tokens.kiro.session().then((session) => ({ session }), (error) => ({ error }))
  await refreshing.promise
  await controller.logout('kiro', accountIdOf('kiro', a))
  assert.equal(await getSession('kiro', authPath), undefined)
  release.resolve()
  const settled = await result
  assert.equal(await getSession('kiro', authPath), undefined)
  assert.match(settled.error?.message ?? '', /session changed/)
})


test('Settings hydration and real proxy chat redeem a rotating refresh token only once', { timeout: 5000 }, async (t) => {
  const refreshing = deferred()
  const release = deferred()
  const arrived = deferred()
  const refreshTokens = []
  const fetchFn = async (url, init) => {
    if (String(url) === CODEX_TOKEN_URL) {
      refreshTokens.push(JSON.parse(init.body).refresh_token)
      const attempt = refreshTokens.length
      refreshing.resolve()
      await release.promise
      return attempt === 1
        ? Response.json({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600 })
        : Response.json({ error: 'invalid_grant' }, { status: 400 })
    }
    return Response.json({})
  }
  const { controller, authPath } = await fixture(t, fetchFn)
  await saveSession('codex', {
    accessToken: 'old-access', refreshToken: 'single-use-refresh', expiresAt: Date.now() - 1000,
    emailAddress: 'codex@example.test', accountId: 'codex-account',
  }, authPath)
  const proxy = createProxy({
    port: 0, apiKey: 'local-test', tokens: controller.tokens,
    fetchFn: async (url, init) => {
      assert.equal(String(url), CODEX_API_URL)
      return Response.json({ authorization: init.headers.authorization })
    },
  })
  const server = await proxy.listen()
  t.after(() => proxy.close())
  const snapshot = controller.snapshot()
  await refreshing.promise
  server.once('request', () => arrived.resolve())
  const chat = fetch(`http://127.0.0.1:${server.address().port}/codex/v1/responses`, {
    method: 'POST', headers: { authorization: 'Bearer local-test', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-test', input: 'hello' }),
  })
  await arrived.promise
  await controller.status('codex')
  release.resolve()
  const [response, snap] = await Promise.all([chat, snapshot])
  assert.equal(response.status, 200)
  assert.equal((await response.json()).authorization, 'Bearer rotated-access')
  assert.equal(snap.accounts.codex.loggedIn, true)
  assert.equal((await getSession('codex', authPath)).refreshToken, 'rotated-refresh')
  assert.deepEqual(refreshTokens, ['single-use-refresh'])
})


test('a late proxy validation result updates its source account without switching or flagging another login', { timeout: 5000 }, async (t) => {
  const upstream = deferred()
  const release = deferred()
  const { controller, authPath } = await fixture(t, async () => Response.json({}))
  const a = { accessToken: 'ag-a', refreshToken: 'ag-r-a', expiresAt: Date.now() + 3_600_000, account: 'a@example.test', projectId: 'a-project' }
  const b = { ...a, accessToken: 'ag-b', refreshToken: 'ag-r-b', account: 'b@example.test', projectId: 'b-project' }
  await saveSession('antigravity', b, authPath)
  await saveSession('antigravity', a, authPath)
  const proxy = createProxy({
    port: 0, apiKey: 'local-test', tokens: controller.tokens,
    fetchFn: async () => {
      upstream.resolve()
      await release.promise
      return Response.json({ error: {
        message: 'Verify your account to continue.',
        details: [{ reason: 'VALIDATION_REQUIRED', metadata: { validation_url: 'https://accounts.google.com/signin/continue?test=a' } }],
      } }, { status: 403 })
    },
  })
  const server = await proxy.listen()
  t.after(() => proxy.close())
  const chat = fetch(`http://127.0.0.1:${server.address().port}/antigravity/v1/chat/completions`, {
    method: 'POST', headers: { authorization: 'Bearer local-test', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gemini-test', messages: [{ role: 'user', content: 'hello' }] }),
  })
  await upstream.promise
  await controller.switchAccount('antigravity', b.account)
  release.resolve()
  const response = await chat
  assert.equal(response.status, 400)
  await response.text()
  const rows = await listStoredSessions('antigravity', authPath)
  assert.equal(rows.find((row) => row.id === a.account).session.needsValidation, true)
  assert.equal(rows.find((row) => row.id === b.account).session.needsValidation, undefined)
  assert.equal((await getSession('antigravity', authPath)).accessToken, b.accessToken)
})


test('an identical-credential new login supersedes an older pending refresh', { timeout: 5000 }, async (t) => {
  const refreshing = deferred()
  const release = deferred()
  const a = account('a', true)
  const { controller, authPath } = await fixture(t, async (url) => {
    assert.ok(String(url).endsWith('/refreshToken'))
    refreshing.resolve()
    await release.promise
    return Response.json({ accessToken: 'old-login-rotated', refreshToken: a.refreshToken, expiresIn: 3600 })
  })
  await saveSession('kiro', a, authPath)
  const result = controller.tokens.kiro.session().then((session) => ({ session }), (error) => ({ error }))
  await refreshing.promise
  // Login/import commits a new lifetime even when the user imports the same token bytes.
  await saveSession('kiro', a, authPath)
  release.resolve()
  const settled = await result
  assert.equal((await getSession('kiro', authPath)).accessToken, a.accessToken)
  assert.match(settled.error?.message ?? '', /session changed/)
})


test('identity rekey during refresh retains both the new identity and rotated credentials', { timeout: 5000 }, async (t) => {
  const refreshing = deferred()
  const release = deferred()
  const a = account('a', true)
  const { controller, authPath } = await fixture(t, async (url) => {
    assert.ok(String(url).endsWith('/refreshToken'))
    refreshing.resolve()
    await release.promise
    return Response.json({ accessToken: 'rotated-after-rekey', refreshToken: a.refreshToken, expiresIn: 3600 })
  })
  const source = await saveSession('kiro', a, authPath)
  const result = controller.tokens.kiro.session()
  await refreshing.promise
  const renamed = { ...a, account: 'resolved@example.test', planType: 'pro' }
  await replaceAccountId('kiro', source, renamed, authPath)
  release.resolve()
  const live = await result
  assert.equal(live.account, renamed.account)
  assert.equal(live.planType, 'pro')
  assert.equal(live.accessToken, 'rotated-after-rekey')
  const rows = await listStoredSessions('kiro', authPath)
  assert.deepEqual(rows.map((row) => row.id), [accountIdOf('kiro', renamed)])
  assert.equal((await getSession('kiro', authPath)).accessToken, 'rotated-after-rekey')
})


test('refreshQuota clears stored Antigravity validation flags after verification succeeds', async (t) => {
  let probes = 0
  const { controller, authPath } = await fixture(t, async (url) => {
    if (String(url) === ANTIGRAVITY_GENERATE_URL) probes++
    return Response.json({})
  })
  const account = 'verified@example.test'
  await saveSession('antigravity', {
    accessToken: 'ag-verified', refreshToken: 'ag-refresh', expiresAt: Date.now() + 3_600_000,
    account, projectId: 'verified-project', needsValidation: true,
    validationUrl: 'https://accounts.google.com/signin/continue?test=verify',
  }, authPath)
  await controller.refreshQuota('antigravity', account)
  assert.equal(probes, 1)
  const stored = await getSession('antigravity', authPath)
  assert.equal(Object.hasOwn(stored, 'needsValidation'), false)
  assert.equal(Object.hasOwn(stored, 'validationUrl'), false)
  assert.equal(stored.accessToken, 'ag-verified')
})


test('successful validation removes old flags without deleting concurrently learned metadata', { timeout: 5000 }, async (t) => {
  const probing = deferred()
  const release = deferred()
  const { controller, authPath } = await fixture(t, async (url) => {
    if (String(url) === ANTIGRAVITY_GENERATE_URL) {
      probing.resolve()
      await release.promise
    }
    return Response.json({})
  })
  const account = 'concurrent@example.test'
  await saveSession('antigravity', {
    accessToken: 'ag-concurrent', refreshToken: 'ag-refresh', expiresAt: Date.now() + 3_600_000,
    account, projectId: 'concurrent-project', needsValidation: true,
    validationUrl: 'https://accounts.google.com/signin/continue?test=concurrent',
  }, authPath)
  const source = await controller.tokens.antigravity.session()
  const refreshingQuota = controller.refreshQuota('antigravity', account)
  await probing.promise
  await controller.tokens.antigravity.remember(source, { planType: 'pro' })
  release.resolve()
  await refreshingQuota
  const stored = await getSession('antigravity', authPath)
  assert.equal(stored.planType, 'pro')
  assert.equal(Object.hasOwn(stored, 'needsValidation'), false)
  assert.equal(Object.hasOwn(stored, 'validationUrl'), false)
  assert.equal(stored.accessToken, 'ag-concurrent')
})


test('an upstream 401 refreshes the login once and retries with the rotated token', { timeout: 5000 }, async (t) => {
  let refreshes = 0
  const upstreamCalls = []
  const { controller, authPath } = await fixture(t, async (url) => {
    if (String(url) === CODEX_TOKEN_URL) {
      refreshes++
      return Response.json({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600 })
    }
    return Response.json({})
  })
  await saveSession('codex', {
    accessToken: 'stale-access', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000,
    emailAddress: 'codex@example.test', accountId: 'acct-1',
  }, authPath)
  const proxy = createProxy({
    port: 0, apiKey: 'local-test', tokens: controller.tokens,
    fetchFn: async (url, init) => {
      upstreamCalls.push(init.headers.authorization)
      return upstreamCalls.length === 1
        ? Response.json({ error: { message: 'token expired' } }, { status: 401 })
        : Response.json({ ok: true })
    },
  })
  const server = await proxy.listen()
  t.after(() => proxy.close())
  const response = await fetch(`http://127.0.0.1:${server.address().port}/codex/v1/responses`, {
    method: 'POST', headers: { authorization: 'Bearer local-test', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-test', input: 'hi' }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(upstreamCalls, ['Bearer stale-access', 'Bearer rotated-access'])
  assert.equal(refreshes, 1)
  assert.equal((await getSession('codex', authPath)).accessToken, 'rotated-access')
})


test('an upstream 401 forwards the upstream body when the refresh fails', { timeout: 5000 }, async (t) => {
  let refreshes = 0
  const upstreamCalls = []
  const { controller, authPath } = await fixture(t, async (url) => {
    if (String(url) === CODEX_TOKEN_URL) {
      refreshes++
      return Response.json({ error: 'temporarily_unavailable' }, { status: 500 })
    }
    return Response.json({})
  })
  await saveSession('codex', {
    accessToken: 'stale-access', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000,
    emailAddress: 'codex@example.test', accountId: 'acct-1',
  }, authPath)
  const proxy = createProxy({
    port: 0, apiKey: 'local-test', tokens: controller.tokens,
    fetchFn: async () => {
      upstreamCalls.push(1)
      return Response.json({ error: { message: 'token expired' } }, { status: 401 })
    },
  })
  const server = await proxy.listen()
  t.after(() => proxy.close())
  const response = await fetch(`http://127.0.0.1:${server.address().port}/codex/v1/responses`, {
    method: 'POST', headers: { authorization: 'Bearer local-test', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-test', input: 'hi' }),
  })
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.message, 'token expired')
  assert.equal(upstreamCalls.length, 1)
  assert.equal(refreshes, 1)
})


test('a transient refresh failure serves the still-valid token and backs off the endpoint', { timeout: 5000 }, async (t) => {
  let refreshes = 0
  const { controller, authPath } = await fixture(t, async (url) => {
    if (String(url).endsWith('/refreshToken')) {
      refreshes++
      return Response.json({ error: 'boom' }, { status: 500 })
    }
    return Response.json({})
  })
  const a = account('a')
  // Inside the 2min preempt window but still valid: refresh is due, yet a
  // transient endpoint failure must not fail the request.
  a.expiresAt = Date.now() + 60_000
  await saveSession('kiro', a, authPath)
  const first = await controller.tokens.kiro.session()
  assert.equal(first.accessToken, a.accessToken)
  await drained(controller.tokens.kiro)
  const second = await controller.tokens.kiro.session()
  assert.equal(second.accessToken, a.accessToken)
  await drained(controller.tokens.kiro)
  assert.equal(refreshes, 1)
})

async function drained(manager) {
  await Promise.allSettled([...manager.inflight.values()])
}

test('an expired token retries the refresh instead of replaying a backed-off failure', { timeout: 5000 }, async (t) => {
  let refreshes = 0
  const { controller, authPath } = await fixture(t, async (url) => {
    if (String(url).endsWith('/refreshToken')) {
      refreshes++
      return refreshes === 1
        ? Response.json({ error: 'boom' }, { status: 500 })
        : Response.json({ accessToken: 'recovered', refreshToken: 'rt_' + 'r'.repeat(200), expiresIn: 3600 })
    }
    return Response.json({})
  })
  await saveSession('kiro', account('a', true), authPath)
  await assert.rejects(controller.tokens.kiro.session())
  const next = await controller.tokens.kiro.session()
  assert.equal(next.accessToken, 'recovered')
  assert.equal(refreshes, 2)
})

test('a due-but-valid token is served without waiting on its refresh', { timeout: 5000 }, async (t) => {
  const release = deferred()
  const { controller, authPath } = await fixture(t, async (url) => {
    if (String(url).endsWith('/refreshToken')) {
      await release.promise
      return Response.json({ accessToken: 'background', refreshToken: 'rt_' + 'b'.repeat(200), expiresIn: 3600 })
    }
    return Response.json({})
  })
  const a = account('a')
  a.expiresAt = Date.now() + 60_000
  await saveSession('kiro', a, authPath)
  const served = await controller.tokens.kiro.session()
  assert.equal(served.accessToken, a.accessToken)
  release.resolve()
  await drained(controller.tokens.kiro)
  assert.equal((await getSession('kiro', authPath)).accessToken, 'background')
})

test('a hung refresh times out the waiting request but keeps one refresh owner', { timeout: 5000 }, async (t) => {
  const release = deferred()
  let refreshes = 0
  const { controller, authPath } = await fixture(t, async (url) => {
    if (String(url).endsWith('/refreshToken')) {
      refreshes++
      await release.promise
      return Response.json({ accessToken: 'late', refreshToken: 'rt_' + 'l'.repeat(200), expiresIn: 3600 })
    }
    return Response.json({})
  })
  controller.tokens.kiro.refreshWaitMs = 50
  await saveSession('kiro', account('a', true), authPath)
  await assert.rejects(controller.tokens.kiro.session(), /timed out/)
  await assert.rejects(controller.tokens.kiro.session(), /timed out/)
  assert.equal(refreshes, 1)
  release.resolve()
  await drained(controller.tokens.kiro)
  assert.equal((await controller.tokens.kiro.session()).accessToken, 'late')
})

test('invalid_grant after another writer rotated the login adopts the rotated session', { timeout: 5000 }, async (t) => {
  const a = account('a', true)
  let authPath
  const { controller, authPath: path } = await fixture(t, async (url) => {
    if (String(url).endsWith('/refreshToken')) {
      const [source] = await listStoredSessions('kiro', authPath)
      await updateAccountSession('kiro', source, { ...source.session, accessToken: 'other-writer', expiresAt: Date.now() + 3_600_000 }, authPath)
      return Response.json({ error: 'invalid_grant' }, { status: 400 })
    }
    return Response.json({})
  })
  authPath = path
  await saveSession('kiro', a, authPath)
  const live = await controller.tokens.kiro.session()
  assert.equal(live.accessToken, 'other-writer')
  assert.equal((await listStoredSessions('kiro', authPath)).length, 1)
})

test('upstream Retry-After reaches the client on a forwarded 429', { timeout: 5000 }, async (t) => {
  const { controller, authPath } = await fixture(t, async () => Response.json({}))
  await saveSession('codex', {
    accessToken: 'live', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000,
    emailAddress: 'codex@example.test', accountId: 'acct-1',
  }, authPath)
  const proxy = createProxy({
    port: 0, apiKey: 'local-test', tokens: controller.tokens,
    fetchFn: async () => Response.json({ error: { message: 'slow down' } }, { status: 429, headers: { 'retry-after': '7' } }),
  })
  const server = await proxy.listen()
  t.after(() => proxy.close())
  const response = await fetch(`http://127.0.0.1:${server.address().port}/codex/v1/responses`, {
    method: 'POST', headers: { authorization: 'Bearer local-test', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-test', input: 'hi' }),
  })
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '7')
  await response.text()
})


test('re-login under the same account id keeps hydrated fields but replaces credentials', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-merge-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const authPath = join(dir, 'auth.json')
  const account = 'merge@example.test'
  await saveSession('antigravity', {
    accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: Date.now() + 3_600_000,
    account, projectId: 'hydrated-project', needsValidation: true,
  }, authPath)
  await saveSession('antigravity', {
    accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: Date.now() + 3_600_000,
    account,
  }, authPath)
  const stored = await getSession('antigravity', authPath)
  assert.equal(stored.accessToken, 'new-access')
  assert.equal(stored.refreshToken, 'new-refresh')
  assert.equal(stored.projectId, 'hydrated-project')
  assert.equal(stored.needsValidation, true)
})


test('the token sweep refreshes an expired login before any request arrives', { timeout: 5000 }, async (t) => {
  let refreshes = 0
  const { controller, authPath } = await fixture(t, async (url) => {
    if (String(url).endsWith('/refreshToken')) {
      refreshes++
      return Response.json({ accessToken: 'swept-access', refreshToken: 'rt_' + 's'.repeat(200), expiresIn: 3600 })
    }
    return Response.json({})
  })
  await saveSession('kiro', account('a', true), authPath)
  await controller.sweepTokensOnce()
  assert.equal(refreshes, 1)
  assert.equal((await getSession('kiro', authPath)).accessToken, 'swept-access')
})

