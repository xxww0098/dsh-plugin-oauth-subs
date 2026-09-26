import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  AUTO_UPDATE_INTERVAL_MS,
  readUpdatePrefs,
  readUpdateState,
  updatePrefsPath,
  updateStatePath,
  writeUpdatePrefs,
  writeUpdateState,
} from '../lib/utils/update-prefs.js'

test('update prefs live next to auth.json and default to off', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const authPath = join(dir, 'auth.json')
  assert.equal(updatePrefsPath(authPath), join(dir, 'update-prefs.json'))
  assert.equal(updateStatePath(authPath), join(dir, 'update-state.json'))
  assert.deepEqual(await readUpdatePrefs(updatePrefsPath(authPath)), { autoUpdate: false })
  assert.equal(await readUpdateState(updateStatePath(authPath)), undefined)
})

test('writeUpdatePrefs normalizes to a single boolean', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const path = updatePrefsPath(join(dir, 'auth.json'))
  await writeUpdatePrefs(path, { autoUpdate: true, dsh: true })
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { autoUpdate: true })
  await writeUpdatePrefs(path, { autoUpdate: 'yes' })
  assert.deepEqual(await readUpdatePrefs(path), { autoUpdate: false })
})

test('writeUpdateState round-trips the last run outcome', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const path = updateStatePath(join(dir, 'auth.json'))
  const state = { at: '2026-09-25T12:00:00.000Z', status: 'installed', version: '0.0.104' }
  await writeUpdateState(path, state)
  assert.deepEqual(await readUpdateState(path), state)
  assert.equal(AUTO_UPDATE_INTERVAL_MS, 3_600_000)
})
