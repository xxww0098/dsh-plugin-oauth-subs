import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  defaultUpdatePrefs,
  normalizeUpdatePrefs,
  readUpdatePrefs,
  writeUpdatePrefs,
  updatePrefsPath,
  UPDATE_PREFS_FILE,
} from '../lib/utils/update-prefs.js'

test('normalizeUpdatePrefs defaults both checkboxes off', () => {
  assert.deepEqual(normalizeUpdatePrefs(undefined), { plugin: false, dsh: false })
  assert.deepEqual(normalizeUpdatePrefs({ plugin: 1, dsh: 'yes' }), { plugin: false, dsh: false })
  assert.deepEqual(normalizeUpdatePrefs({ plugin: true, dsh: true }), { plugin: true, dsh: true })
})

test('writeUpdatePrefs round-trips independent flags', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-prefs-'))
  const path = updatePrefsPath(dir)
  assert.equal(path.endsWith(UPDATE_PREFS_FILE), true)
  const saved = await writeUpdatePrefs(path, { plugin: true, dsh: false })
  assert.deepEqual(saved, { plugin: true, dsh: false })
  const text = await readFile(path, 'utf8')
  assert.equal(JSON.parse(text).plugin, true)
  assert.equal(JSON.parse(text).dsh, false)
  const loaded = await readUpdatePrefs(path)
  assert.deepEqual(loaded, { plugin: true, dsh: false })
})

test('readUpdatePrefs returns defaults when the file is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-prefs-'))
  assert.deepEqual(await readUpdatePrefs(join(dir, 'nope.json')), defaultUpdatePrefs())
})
