import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { deleteSession, getSession, loadStore, saveSession } from '../lib/store.js'

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
  assert.equal(store.codex.accountId, 'acct')
  assert.equal(store.grok.accessToken, 'g')
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
