import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  classifyAsset,
  compareVersions,
  fetchLatest,
  formatPublishedAt,
  fresherVersion,
  hostPlatform,
  installedPackageDirs,
  installedVersion,
  installRelease,
  isElectronManagedProfile,
  localUpdateInfo,
  pickDownloads,
  pluginAddArgs,
  pluginUpdateArgs,
  pluginUpdateCommand,
  profileFromBaseUrl,
  profilePluginPackageJson,
  readPackageVersion,
  releaseInstallSource,
  releaseTarballUrl,
  workaroundCommand,
  REPO_URL,
  REPO_SLUG,
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

test('compareVersions handles prerelease semver comparisons correctly', () => {
  assert.equal(compareVersions('0.1.3-alpha.1', '0.1.2-rc.1') > 0, true)
  assert.equal(compareVersions('0.1.2-rc.1', '0.1.2-alpha.5') > 0, true)
  assert.equal(compareVersions('0.1.2', '0.1.2-rc.1') > 0, true)
  assert.equal(compareVersions('0.1.2-rc.1', '0.1.2') < 0, true)
  assert.equal(compareVersions('dsh-v0.1.3-alpha.1', '0.1.3-alpha.1'), 0)
})

test('installedVersion accepts injected manifest reads for diagnostics', () => {
  assert.equal(installedVersion({ readFileFn: () => { throw new Error('no') } }), '')
  assert.equal(installedVersion({ readFileFn: () => '{"version":"0.0.70"}' }), '0.0.70')
  assert.equal(installedVersion({ readFileFn: () => '{"version":"0.0.71"}' }), '0.0.71')
})

test('fresherVersion picks the newer of two installed labels', () => {
  assert.equal(fresherVersion('0.0.71', '0.0.70'), '0.0.71')
  assert.equal(fresherVersion('0.0.70', '0.0.71'), '0.0.71')
  assert.equal(fresherVersion(undefined, '0.0.70'), '0.0.70')
  assert.equal(fresherVersion('0.0.71', undefined), '0.0.71')
  assert.equal(fresherVersion('', ''), '')
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

test('isElectronManagedProfile flags only the desktop profile', () => {
  assert.equal(isElectronManagedProfile('desktop'), true)
  assert.equal(isElectronManagedProfile('web'), false)
  assert.equal(isElectronManagedProfile('headless'), false)
  assert.equal(isElectronManagedProfile(undefined), false)
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

function splitVersionReader(running, disk) {
  return (path) => {
    const p = String(path).replace(/\\/g, '/')
    if (p.includes('/node_modules/dsh-plugin-oauth-subs/package.json')) return JSON.stringify({ version: disk })
    return JSON.stringify({ version: running })
  }
}

test('localUpdateInfo reports the running module when profile disk is newer', () => {
  const info = localUpdateInfo('linux', {
    profile: 'web',
    env: { DSH_HOME: '/tmp/dsh-home' },
    readFileFn: splitVersionReader('0.0.70', '0.0.71'),
  })
  assert.equal(info.version, '0.0.70')
  assert.equal(info.disk, '0.0.71')
  assert.equal(info.running, '0.0.70')
  assert.equal(info.staleProcess, true)
})

test('fetchLatest stays update when the process is behind even if disk matches GitHub', async () => {
  const fetchFn = async () => new Response(JSON.stringify({
    tag_name: 'v0.0.71',
    name: '0.0.71',
    html_url: 'https://github.com/xxww0098/dsh-plugin-oauth-subs/releases/tag/v0.0.71',
    published_at: '2026-09-05T03:08:56Z',
    assets: [],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  const update = await fetchLatest({
    fetchFn,
    platform: 'linux',
    profile: 'web',
    env: { DSH_HOME: '/tmp/dsh-home' },
    readFileFn: splitVersionReader('0.0.70', '0.0.71'),
  })
  assert.equal(update.status, 'update')
  assert.equal(update.version, '0.0.70')
  assert.equal(update.staleProcess, true)
  assert.equal(update.disk, '0.0.71')
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

function missingGh() {
  const err = new Error('spawn gh ENOENT')
  err.code = 'ENOENT'
  throw err
}

test('fetchLatest uses github.com latest redirect after API 403', async () => {
  const calls = []
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), redirect: init?.redirect, auth: init?.headers?.authorization })
    if (String(url).includes('api.github.com')) {
      return new Response('{"message":"API rate limit exceeded"}', { status: 403 })
    }
    return new Response(null, {
      status: 302,
      headers: { location: `${REPO_URL}/releases/tag/v0.0.84` },
    })
  }
  const update = await fetchLatest({ fetchFn, spawnFn: missingGh, current: '0.0.83', platform: 'darwin', env: {} })
  assert.equal(update.status, 'update')
  assert.equal(update.latest.tag, 'v0.0.84')
  assert.equal(update.latest.url, `${REPO_URL}/releases/tag/v0.0.84`)
  assert.equal(calls.some((call) => call.url.includes('/releases/latest') && call.redirect === 'manual'), true)
})

test('fetchLatest sends GITHUB_TOKEN as Bearer on the API request', async () => {
  const calls = []
  const fetchFn = async (url, init) => {
    calls.push(init?.headers?.authorization)
    return new Response(JSON.stringify({ tag_name: 'v0.0.84', html_url: `${REPO_URL}/releases/tag/v0.0.84`, assets: [] }), { status: 200 })
  }
  await fetchLatest({ fetchFn, current: '0.0.84', env: { GITHUB_TOKEN: 'ghs_test' } })
  assert.equal(calls[0], 'Bearer ghs_test')
})

test('fetchLatest uses gh api after GitHub API 403', async () => {
  const seen = []
  const fetchFn = async (url) => {
    if (String(url).includes('api.github.com')) return new Response('rate limit', { status: 403 })
    return new Response('nope', { status: 404 })
  }
  const spawnFn = (cmd, args) => {
    seen.push({ cmd, args })
    return fakeChild({
      code: 0,
      stdout: JSON.stringify({
        tag_name: 'v0.0.84',
        html_url: `${REPO_URL}/releases/tag/v0.0.84`,
        published_at: '2026-09-09T16:22:30Z',
        assets: [],
      }),
    })()
  }
  const update = await fetchLatest({
    fetchFn,
    spawnFn,
    current: '0.0.83',
    platform: 'darwin',
    env: {},
  })
  assert.equal(update.status, 'update')
  assert.equal(update.latest.tag, 'v0.0.84')
  assert.equal(update.latest.url, `${REPO_URL}/releases/tag/v0.0.84`)
  assert.equal(seen[0].cmd, 'gh')
  assert.deepEqual(seen[0].args, ['api', `repos/${REPO_SLUG}/releases/latest`])
})

test('readPackageVersion returns the manifest version or empty', () => {
  assert.equal(readPackageVersion('/nope.json', { readFileFn: () => { throw new Error('missing') } }), '')
  assert.equal(readPackageVersion('/x.json', { readFileFn: () => '{"version":"0.0.71"}' }), '0.0.71')
})

test('releaseTarballUrl pins the tag to the GitHub source archive', () => {
  assert.equal(releaseTarballUrl('v0.0.104'), `${REPO_URL}/archive/refs/tags/v0.0.104.tar.gz`)
  assert.equal(releaseTarballUrl('0.0.104'), `${REPO_URL}/archive/refs/tags/v0.0.104.tar.gz`)
  assert.equal(releaseTarballUrl('garbage'), undefined)
})

async function fakeInstalledCopy(home, profile = 'desktop', version = '0.0.103') {
  const dir = join(home, 'profiles', profile, 'node_modules', 'dsh-plugin-oauth-subs')
  await mkdir(join(dir, 'lib'), { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-plugin-oauth-subs', version }))
  await writeFile(join(dir, 'lib', 'stale-marker.txt'), 'old file that must not survive')
  return dir
}

test('installedPackageDirs lists the profile copy and shared copies, deduped', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-home-'))
  const dir = await fakeInstalledCopy(home)
  const shared = join(home, 'profiles', 'node_modules', 'dsh-plugin-oauth-subs')
  await mkdir(shared, { recursive: true })
  await writeFile(join(shared, 'package.json'), JSON.stringify({ name: 'dsh-plugin-oauth-subs', version: '0.0.1' }))
  const dirs = installedPackageDirs('desktop', { DSH_HOME: home }, { resolveFn: () => undefined })
  assert.equal(dirs.length, 2)
  assert.equal(dirs.includes(dir), true)
  assert.equal(dirs.includes(shared), true)
  assert.deepEqual(installedPackageDirs('desktop', { DSH_HOME: join(home, 'nope') }, { resolveFn: () => undefined }), [])
})

test('installRelease swaps every installed copy for the tag tarball', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-home-'))
  const dir = await fakeInstalledCopy(home)
  const shared = join(home, 'profiles', 'node_modules', 'dsh-plugin-oauth-subs')
  await mkdir(shared, { recursive: true })
  await writeFile(join(shared, 'package.json'), JSON.stringify({ name: 'dsh-plugin-oauth-subs', version: '0.0.1' }))
  const seen = []
  const fetchFn = async (url) => {
    seen.push(String(url))
    return new Response(Buffer.from('tarball-bytes'))
  }
  const extractFn = async (_archive, dest) => {
    const root = join(dest, 'xxww0098-dsh-plugin-oauth-subs-abc1234')
    await mkdir(join(root, 'lib'), { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'dsh-plugin-oauth-subs', version: '0.0.104' }))
    await writeFile(join(root, 'lib', 'index.js'), '// new build')
  }
  const result = await installRelease({
    tag: 'v0.0.104',
    profile: 'desktop',
    env: { DSH_HOME: home },
    fetchFn,
    extractFn,
    resolveFn: () => undefined,
  })
  assert.equal(result.status, 'installed')
  assert.equal(result.version, '0.0.104')
  assert.equal(result.restart, 'app')
  assert.equal(seen[0], `${REPO_URL}/archive/refs/tags/v0.0.104.tar.gz`)
  assert.equal(JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).version, '0.0.104')
  assert.equal(JSON.parse(await readFile(join(shared, 'package.json'), 'utf8')).version, '0.0.104')
  // Full replace: files dropped by the new release do not linger.
  assert.equal(existsSync(join(dir, 'lib', 'stale-marker.txt')), false)
  // No .bak / .work leftovers under node_modules.
  const leftovers = (await readFile(join(dir, 'package.json'), 'utf8')).includes('0.0.104')
  assert.equal(leftovers, true)
  const names = await import('node:fs/promises').then((fs) => fs.readdir(join(home, 'profiles', 'desktop', 'node_modules')))
  assert.equal(names.some((name) => name.includes('.work') || name.includes('.bak')), false)
})

test('installRelease on a web profile asks for a host restart', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-home-'))
  await fakeInstalledCopy(home, 'web')
  const result = await installRelease({
    tag: 'v0.0.104',
    profile: 'web',
    env: { DSH_HOME: home },
    fetchFn: async () => new Response(Buffer.from('x')),
    extractFn: async (_a, dest) => {
      const root = join(dest, 'xxww0098-dsh-plugin-oauth-subs-abc1234')
      await mkdir(root, { recursive: true })
      await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.0.104' }))
    },
    resolveFn: () => undefined,
  })
  assert.equal(result.status, 'installed')
  assert.equal(result.restart, 'host')
})

test('installRelease reports manual when nothing is installed on the profile', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-home-'))
  const result = await installRelease({
    tag: 'v0.0.104',
    profile: 'desktop',
    env: { DSH_HOME: home },
    fetchFn: async () => { throw new Error('must not fetch') },
    resolveFn: () => undefined,
  })
  assert.equal(result.status, 'manual')
  assert.match(result.command, /dsh plugin --profile desktop update/)
})

test('installRelease reports failed with the manual fallback command on fetch errors', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-home-'))
  await fakeInstalledCopy(home)
  const result = await installRelease({
    tag: 'v0.0.104',
    profile: 'desktop',
    env: { DSH_HOME: home },
    fetchFn: async () => new Response('rate limited', { status: 403 }),
    resolveFn: () => undefined,
  })
  assert.equal(result.status, 'failed')
  assert.match(result.error, /tarball 403/)
  assert.match(result.command, /plugin --profile desktop/)
})
