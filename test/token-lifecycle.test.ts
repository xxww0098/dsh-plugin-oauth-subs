import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { accountIdOf, getSession, listStoredSessions, replaceAccountId, saveSession } from '../lib/oauth/store.js'
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
