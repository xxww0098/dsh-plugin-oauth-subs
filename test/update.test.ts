import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classifyAsset,
  compareVersions,
  fetchLatest,
  hostPlatform,
  pickDownloads,
  RELEASES_API,
} from '../lib/utils/update.js'

test('hostPlatform maps node platforms', () => {
  assert.equal(hostPlatform('win32'), 'win')
  assert.equal(hostPlatform('darwin'), 'mac')
  assert.equal(hostPlatform('linux'), 'linux')
})

test('classifyAsset reads win/mac/linux names and falls back to any', () => {
  assert.equal(classifyAsset('oauth-subs-win.zip'), 'win')
  assert.equal(classifyAsset('oauth-subs-macos.tgz'), 'mac')
  assert.equal(classifyAsset('oauth-subs-linux.tar.gz'), 'linux')
  assert.equal(classifyAsset('dsh-plugin-oauth-subs-0.0.15.zip'), 'any')
})

test('compareVersions orders semver tags', () => {
  assert.equal(compareVersions('v0.0.16', '0.0.15') > 0, true)
  assert.equal(compareVersions('0.0.15', 'v0.0.15'), 0)
  assert.equal(compareVersions('0.0.14', '0.0.15') < 0, true)
})

test('pickDownloads shares a generic zip across win/mac/linux', () => {
  const rows = pickDownloads([
    { name: 'dsh-plugin-oauth-subs-0.0.15.zip', browser_download_url: 'https://example/a.zip', size: 10 },
  ], 'linux')
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map((row) => row.platform), ['win', 'mac', 'linux'])
  assert.equal(rows.every((row) => row.url === 'https://example/a.zip'), true)
  assert.equal(rows.find((row) => row.platform === 'linux').current, true)
  assert.equal(rows.find((row) => row.platform === 'win').generic, true)
})

test('pickDownloads prefers a platform-named asset', () => {
  const rows = pickDownloads([
    { name: 'plugin.zip', browser_download_url: 'https://example/any.zip' },
    { name: 'plugin-win.zip', browser_download_url: 'https://example/win.zip' },
  ], 'win')
  assert.equal(rows.find((row) => row.platform === 'win').url, 'https://example/win.zip')
  assert.equal(rows.find((row) => row.platform === 'win').generic, false)
  assert.equal(rows.find((row) => row.platform === 'mac').url, 'https://example/any.zip')
})

test('fetchLatest compares installed version against GitHub latest', async () => {
  const calls = []
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), ua: init.headers['user-agent'] })
    return new Response(JSON.stringify({
      tag_name: 'v0.0.15',
      name: '0.0.15',
      html_url: 'https://github.com/xxww0098/dsh-plugin-oauth-subs/releases/tag/v0.0.15',
      published_at: '2026-08-30T12:18:09Z',
      assets: [{
        name: 'dsh-plugin-oauth-subs-0.0.15.zip',
        browser_download_url: 'https://github.com/xxww0098/dsh-plugin-oauth-subs/releases/download/v0.0.15/dsh-plugin-oauth-subs-0.0.15.zip',
        size: 42,
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const update = await fetchLatest({ fetchFn, current: '0.0.14', platform: 'darwin' })
  assert.equal(calls[0].url, RELEASES_API)
  assert.equal(update.status, 'update')
  assert.equal(update.platform, 'mac')
  assert.equal(update.latest.tag, 'v0.0.15')
  assert.equal(update.assets.length, 3)
  const ahead = await fetchLatest({ fetchFn, current: '0.0.16', platform: 'linux' })
  assert.equal(ahead.status, 'ahead')
  const current = await fetchLatest({ fetchFn, current: '0.0.15', platform: 'win32' })
  assert.equal(current.status, 'current')
})
