import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { deleteSession, getSession, listAccounts, loadStore, saveSession, switchAccount } from '../lib/oauth/store.js'

test('saveSession writes atomically with mode 0600 and preserves siblings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const path = join(dir, 'auth.json')
  await saveSession('codex', {
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: 1,
    accountId: 'acct',
  }, path)
  await saveSession('grok', {
    accessToken: 'g',
    refreshToken: 'gr',
    expiresAt: 2,
    tokenEndpoint: 'https://auth.x.ai/oauth2/token',
  }, path)
  const store = await loadStore(path)
  assert.equal((await getSession('codex', path)).accountId, 'acct')
  assert.equal(store.codex.activeId, 'acct')
  assert.equal(store.codex.accounts.acct.accountId, 'acct')
  assert.equal((await getSession('grok', path)).accessToken, 'g')
  const mode = (await stat(path)).mode & 0o777
  assert.equal(mode, 0o600)
  await deleteSession('codex', path)
  assert.equal(await getSession('codex', path), undefined)
  assert.equal((await getSession('grok', path)).accessToken, 'g')
  JSON.parse(await readFile(path, 'utf8'))
})

test('loadStore returns empty for a missing file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  assert.deepEqual(await loadStore(join(dir, 'missing.json')), {})
})

test('saveSession creates its credential directory with mode 0700', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const privateDir = join(dir, 'private')
  await saveSession('codex', { accessToken: 'a', refreshToken: 'r', expiresAt: 1 }, join(privateDir, 'auth.json'))
  assert.equal((await stat(privateDir)).mode & 0o777, 0o700)
})

test('loadStore rejects credentials exposed to other users', { skip: process.platform === 'win32' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const path = join(dir, 'auth.json')
  await writeFile(path, '{"codex":{"accessToken":"a","refreshToken":"r","expiresAt":1}}')
  await chmod(path, 0o644)
  await assert.rejects(loadStore(path), /group or other users/)
})

test('loadStore rejects a symbolic-link credential path', { skip: process.platform === 'win32' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const target = join(dir, 'target.json')
  const path = join(dir, 'auth.json')
  await writeFile(target, '{"codex":{"accessToken":"a","refreshToken":"r","expiresAt":1}}', { mode: 0o600 })
  await symlink(target, path)
  await assert.rejects(loadStore(path), /symbolic link/)
})

test('legacy single-session files still load as the active account', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const path = join(dir, 'auth.json')
  await writeFile(path, JSON.stringify({
    codex: { accessToken: 'a', refreshToken: 'r', expiresAt: 1, emailAddress: 'old@x' },
  }), { mode: 0o600 })
  const session = await getSession('codex', path)
  assert.equal(session.emailAddress, 'old@x')
  const roster = await listAccounts('codex', path)
  assert.equal(roster.length, 1)
  assert.equal(roster[0].id, 'old@x')
  assert.equal(roster[0].active, true)
})

test('saveSession keeps multiple Codex accounts and switchAccount picks the active one', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const path = join(dir, 'auth.json')
  await saveSession('codex', {
    accessToken: 'a1', refreshToken: 'r1', expiresAt: 1, emailAddress: 'one@x',
  }, path)
  await saveSession('codex', {
    accessToken: 'a2', refreshToken: 'r2', expiresAt: 2, emailAddress: 'two@x',
  }, path)
  assert.equal((await getSession('codex', path)).emailAddress, 'two@x')
  await switchAccount('codex', 'one@x', path)
  assert.equal((await getSession('codex', path)).emailAddress, 'one@x')
  const roster = await listAccounts('codex', path)
  assert.equal(roster.length, 2)
  assert.equal(roster.find((row) => row.active).id, 'one@x')
  await deleteSession('codex', path, 'one@x')
  assert.equal((await getSession('codex', path)).emailAddress, 'two@x')
  await deleteSession('codex', path)
  assert.equal(await getSession('codex', path), undefined)
})
