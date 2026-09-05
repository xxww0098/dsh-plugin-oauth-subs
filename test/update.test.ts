import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import {
  classifyAsset,
  compareVersions,
  fetchLatest,
  formatPublishedAt,
  hostPlatform,
  pickDownloads,
  applyHostUpdate,
  pluginAddArgs,
  pluginUpdateArgs,
  pluginUpdateCommand,
  profileFromBaseUrl,
  profilePluginPackageJson,
  readPackageVersion,
  releaseInstallSource,
  runPluginUpdate,
  versionAdvanced,
  workaroundCommand,
  REPO_URL,
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

test('formatPublishedAt converts GitHub UTC to Asia/Shanghai', () => {
  assert.equal(formatPublishedAt('2026-08-30T15:37:53Z'), '2026-08-30 23:37:53')
  assert.equal(formatPublishedAt('2026-08-30T16:00:00.000Z'), '2026-08-31 00:00:00')
  assert.equal(formatPublishedAt('2026-08-30T00:00:00+08:00'), '2026-08-30 00:00:00')
  assert.equal(formatPublishedAt(''), undefined)
  assert.equal(formatPublishedAt(undefined), undefined)
})

test('pickDownloads ignores a generic zip', () => {
  const rows = pickDownloads([
    { name: 'dsh-plugin-oauth-subs-0.0.15.zip', browser_download_url: 'https://example/a.zip', size: 10 },
  ], 'linux')
  assert.deepEqual(rows, [])
})

test('pickDownloads lists only platform-named assets', () => {
  const rows = pickDownloads([
    { name: 'plugin.zip', browser_download_url: 'https://example/any.zip' },
    { name: 'plugin-win.zip', browser_download_url: 'https://example/win.zip' },
  ], 'win')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].platform, 'win')
  assert.equal(rows[0].url, 'https://example/win.zip')
  assert.equal(rows[0].current, true)
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
  assert.equal(update.latest.publishedAt, '2026-08-30 20:18:09')
  assert.equal(update.assets.length, 0)
  const ahead = await fetchLatest({ fetchFn, current: '0.0.16', platform: 'linux' })
  assert.equal(ahead.status, 'ahead')
  const current = await fetchLatest({ fetchFn, current: '0.0.15', platform: 'win32' })
  assert.equal(current.status, 'current')
})

test('profileFromBaseUrl reads $DSH_HOME/profiles/<name>', () => {
  assert.equal(profileFromBaseUrl('file:///Users/me/.dsh/profiles/web'), 'web')
  assert.equal(profileFromBaseUrl('file:///home/me/.dsh/profiles/headless/'), 'headless')
  assert.equal(profileFromBaseUrl('https://example'), 'web')
  assert.equal(profileFromBaseUrl(undefined), 'web')
})

test('pluginUpdateArgs targets this package on the named profile', () => {
  assert.deepEqual(pluginUpdateArgs('web'), ['plugin', '--profile', 'web', 'update', 'dsh-plugin-oauth-subs'])
  assert.equal(pluginUpdateCommand('web'), 'dsh plugin --profile web update dsh-plugin-oauth-subs')
  assert.deepEqual(pluginAddArgs('web', `${REPO_URL}#v0.0.71`), [
    'plugin', '--profile', 'web', 'add', `${REPO_URL}#v0.0.71`,
  ])
  assert.equal(releaseInstallSource('v0.0.71'), `${REPO_URL}#v0.0.71`)
  assert.equal(releaseInstallSource('0.0.71'), `${REPO_URL}#v0.0.71`)
  assert.match(workaroundCommand('web'), /plugin --profile web remove dsh-plugin-oauth-subs && dsh plugin --profile web add /)
})

test('profilePluginPackageJson reads $DSH_HOME/profiles/<name>/node_modules', () => {
  const path = profilePluginPackageJson('web', { DSH_HOME: '/tmp/dsh-home' })
  assert.equal(path.replace(/\\/g, '/'), '/tmp/dsh-home/profiles/web/node_modules/dsh-plugin-oauth-subs/package.json')
})

test('readPackageVersion and versionAdvanced require a real bump', () => {
  assert.equal(readPackageVersion('/nope.json', { readFileFn: () => { throw new Error('missing') } }), '')
  assert.equal(readPackageVersion('/x.json', { readFileFn: () => '{"version":"0.0.71"}' }), '0.0.71')
  assert.equal(versionAdvanced('0.0.70', '0.0.70', '0.0.71'), false)
  assert.equal(versionAdvanced('0.0.70', '0.0.71', '0.0.71'), true)
  assert.equal(versionAdvanced('', '0.0.71', '0.0.71'), true)
  assert.equal(versionAdvanced('', '', '0.0.71'), false)
})

function fakeChild({ code = 0, error, stderr = '', stdout = '' } = {}) {
  return (_cmd, _args, _opts) => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => undefined
    queueMicrotask(() => {
      if (stdout) child.stdout.emit('data', stdout)
      if (stderr) child.stderr.emit('data', stderr)
      if (error) child.emit('error', error)
      else child.emit('close', code)
    })
    return child
  }
}

test('runPluginUpdate spawns PATH dsh and reports spawn success', async () => {
  const seen = []
  const spawnFn = (cmd, args, opts) => {
    seen.push({ cmd, args, cwd: opts.cwd, stdio: opts.stdio })
    return fakeChild({ code: 0 })(cmd, args, opts)
  }
  const result = await runPluginUpdate({ spawnFn, profile: 'web', env: { DSH_HOME: process.cwd() } })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'spawned')
  assert.equal(result.command, 'dsh plugin --profile web update dsh-plugin-oauth-subs')
  assert.equal(seen[0].cmd, 'dsh')
  assert.deepEqual(seen[0].args, ['plugin', '--profile', 'web', 'update', 'dsh-plugin-oauth-subs'])
})

function versionReader(versions) {
  let i = 0
  return () => JSON.stringify({ version: versions[Math.min(i++, versions.length - 1)] })
}

test('applyHostUpdate reports installed only when the on-disk version advanced', async () => {
  const result = await applyHostUpdate({
    spawnFn: fakeChild({ code: 0 }),
    profile: 'web',
    latest: 'v0.0.71',
    env: { DSH_HOME: process.cwd() },
    readFileFn: versionReader(['0.0.70', '0.0.71']),
  })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'installed')
  assert.equal(result.before, '0.0.70')
  assert.equal(result.after, '0.0.71')
  assert.equal(result.command, 'dsh plugin --profile web update dsh-plugin-oauth-subs')
})

test('applyHostUpdate retries add #tag when update exits 0 but version is unchanged', async () => {
  const seen = []
  const spawnFn = (cmd, args, opts) => {
    seen.push(args)
    return fakeChild({ code: 0 })(cmd, args, opts)
  }
  const result = await applyHostUpdate({
    spawnFn,
    profile: 'web',
    latest: 'v0.0.71',
    env: { DSH_HOME: process.cwd() },
    readFileFn: versionReader(['0.0.70', '0.0.70', '0.0.71']),
  })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'installed')
  assert.deepEqual(seen[0], ['plugin', '--profile', 'web', 'update', 'dsh-plugin-oauth-subs'])
  assert.deepEqual(seen[1], ['plugin', '--profile', 'web', 'add', `${REPO_URL}#v0.0.71`])
  assert.equal(result.command, `dsh plugin --profile web add ${REPO_URL}#v0.0.71`)
})

test('applyHostUpdate does not claim installed when the on-disk version stays put', async () => {
  const result = await applyHostUpdate({
    spawnFn: fakeChild({ code: 0 }),
    profile: 'web',
    latest: 'v0.0.71',
    env: { DSH_HOME: process.cwd() },
    readFileFn: versionReader(['0.0.70', '0.0.70', '0.0.70']),
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'unchanged')
  assert.match(result.error, /still 0\.0\.70/)
  assert.match(result.error, /remove dsh-plugin-oauth-subs/)
  assert.match(result.error, /add https:\/\/github.com\/xxww0098\/dsh-plugin-oauth-subs#v0\.0\.71/)
})

test('runPluginUpdate maps ENOENT to missing-dsh', async () => {
  const result = await runPluginUpdate({
    spawnFn: fakeChild({ error: Object.assign(new Error('spawn dsh ENOENT'), { code: 'ENOENT' }) }),
    profile: 'web',
    env: { DSH_HOME: process.cwd() },
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'missing-dsh')
  assert.match(result.error, /not found on PATH/)
})

test('runPluginUpdate surfaces a nonzero exit', async () => {
  const result = await runPluginUpdate({
    spawnFn: fakeChild({ code: 1, stderr: 'ERR_PNPM_NO_IMPORTER  no pnpm-workspace.yaml' }),
    profile: 'web',
    env: { DSH_HOME: process.cwd() },
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'failed')
  assert.match(result.error, /no pnpm-workspace/)
})
