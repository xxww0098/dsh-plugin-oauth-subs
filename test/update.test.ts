import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, writeFile } from 'node:fs/promises'
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
  installedVersion,
  pickDownloads,
  applyHostUpdate,
  localUpdateInfo,
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
  DSH_REPO_URL,
  DSH_NPM_PACKAGE,
  resolveDshInstall,
  localDshInfo,
  fetchDshLatest,
  dshUpdateArgs,
  dshUpdateCommand,
  dshInstallPrefix,
  applyHostDshUpdate,
  listDshInstallVersions,
  scheduleDshWebRestart,
  stampDshHostVersion,
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

test('installedVersion re-reads package.json and never falls back to a module-load freeze', () => {
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

test('runPluginUpdate spawns the running DSH binary when PATH has no dsh', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-bin-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.5-alpha.1' }))
  const bin = join(dir, 'dsh')
  await writeFile(bin, '#!/bin/sh\n')
  const seen = []
  const spawnFn = (cmd, args, opts) => {
    seen.push({ cmd, args })
    return fakeChild({ code: 0 })(cmd, args, opts)
  }
  const result = await runPluginUpdate({
    spawnFn,
    profile: 'web',
    env: { DSH_HOME: process.cwd(), DSH_BIN_PATH: bin, PATH: '' },
  })
  assert.equal(result.ok, true)
  assert.equal(seen[0].cmd, bin)
  assert.deepEqual(seen[0].args, ['plugin', '--profile', 'web', 'update', 'dsh-plugin-oauth-subs'])
  assert.equal(result.command, `${bin} plugin --profile web update dsh-plugin-oauth-subs`)
})

test('runPluginUpdate runs a .js DSH entry with process.execPath', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-js-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.5-alpha.1' }))
  const bin = join(dir, 'cli.js')
  await writeFile(bin, '#!/usr/bin/env node\n')
  const seen = []
  const spawnFn = (cmd, args, opts) => {
    seen.push({ cmd, args })
    return fakeChild({ code: 0 })(cmd, args, opts)
  }
  const execPath = '/usr/bin/node'
  const result = await runPluginUpdate({
    spawnFn,
    profile: 'web',
    execPath,
    env: { DSH_HOME: process.cwd(), DSH_BIN_PATH: bin, PATH: '' },
  })
  assert.equal(result.ok, true)
  assert.equal(seen[0].cmd, execPath)
  assert.deepEqual(seen[0].args, [bin, 'plugin', '--profile', 'web', 'update', 'dsh-plugin-oauth-subs'])
})

function versionReader(versions) {
  let i = 0
  return () => JSON.stringify({ version: versions[Math.min(i++, versions.length - 1)] })
}

test('applyHostUpdate reports installed only when the on-disk version advanced', async () => {
  let diskReads = 0
  const result = await applyHostUpdate({
    spawnFn: fakeChild({ code: 0 }),
    profile: 'web',
    latest: 'v0.0.71',
    env: { DSH_HOME: process.cwd() },
    readFileFn: (path) => {
      const p = String(path).replace(/\\/g, '/')
      if (p.includes('/node_modules/dsh-plugin-oauth-subs/package.json')) {
        return JSON.stringify({ version: diskReads++ === 0 ? '0.0.70' : '0.0.71' })
      }
      return '{"version":"0.0.71"}'
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'installed')
  assert.equal(result.before, '0.0.70')
  assert.equal(result.after, '0.0.71')
  assert.equal(result.command, 'dsh plugin --profile web update dsh-plugin-oauth-subs')
})

test('applyHostUpdate still adds #tag when disk is latest but the process is behind', async () => {
  const seen = []
  const result = await applyHostUpdate({
    spawnFn: (cmd, args, opts) => {
      seen.push(args)
      return fakeChild({ code: 0 })(cmd, args, opts)
    },
    profile: 'web',
    latest: 'v0.0.71',
    env: { DSH_HOME: process.cwd() },
    readFileFn: splitVersionReader('0.0.70', '0.0.71'),
  })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'installed')
  assert.deepEqual(seen[1], ['plugin', '--profile', 'web', 'add', `${REPO_URL}#v0.0.71`])
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

test('compareVersions handles prerelease semver comparisons correctly', () => {
  assert.equal(compareVersions('0.1.3-alpha.1', '0.1.2-rc.1') > 0, true)
  assert.equal(compareVersions('0.1.2-rc.1', '0.1.2-alpha.5') > 0, true)
  assert.equal(compareVersions('0.1.2', '0.1.2-rc.1') > 0, true)
  assert.equal(compareVersions('0.1.2-rc.1', '0.1.2') < 0, true)
  assert.equal(compareVersions('dsh-v0.1.3-alpha.1', '0.1.3-alpha.1'), 0)
})

test('dshUpdateArgs and dshUpdateCommand construct global npm install args', () => {
  assert.deepEqual(dshUpdateArgs(), ['install', '-g', '@deepseek-ai/dsh@latest'])
  assert.deepEqual(dshUpdateArgs('0.1.3-alpha.1'), ['install', '-g', '@deepseek-ai/dsh@0.1.3-alpha.1'])
  assert.equal(dshUpdateCommand(), 'npm install -g @deepseek-ai/dsh@latest')
  assert.equal(dshUpdateCommand('0.1.2-rc.1'), 'npm install -g @deepseek-ai/dsh@0.1.2-rc.1')
  assert.deepEqual(dshUpdateArgs('0.1.2-rc.1', '/opt/homebrew'), ['install', '-g', '--prefix', '/opt/homebrew', '@deepseek-ai/dsh@0.1.2-rc.1'])
})

test('dshInstallPrefix derives the npm global prefix only from npm layouts', () => {
  assert.equal(dshInstallPrefix('/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/package.json', 'darwin'), '/opt/homebrew')
  assert.equal(dshInstallPrefix('C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\package.json', 'win32'), 'C:\\Users\\me\\AppData\\Roaming\\npm')
  assert.equal(dshInstallPrefix('/Users/me/Library/pnpm/global/5/node_modules/@deepseek-ai/dsh/package.json', 'darwin'), '')
  assert.equal(dshInstallPrefix('', 'darwin'), '')
})

test('localDshInfo returns default repo info even if DSH binary is not found', () => {
  const info = localDshInfo('linux', { env: { PATH: '' }, existsSyncFn: () => false })
  assert.equal(info.repo, DSH_REPO_URL)
  assert.equal(info.npmPackage, DSH_NPM_PACKAGE)
  assert.equal(info.platform, 'linux')
})

test('resolveDshInstall ignores PATH, $_ and global-prefix copies that are not this process', () => {
  const existsSyncFn = (p) => p.startsWith('/other/')
  const realpathFn = () => '/other/lib/node_modules/@deepseek-ai/dsh/lib/bin.js'
  const readFileFn = () => JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.2-rc.1' })
  const env = { PATH: '/other/bin', _: '/other/bin/dsh' }
  assert.equal(resolveDshInstall('linux', env, { existsSyncFn, realpathFn, readFileFn }), undefined)
})

test('resolveDshInstall locates package via binary realpath tree', () => {
  const existsSyncFn = (p) => p === '/custom/bin/dsh' || p === '/custom/package.json'
  const realpathFn = () => '/custom/bin/dsh'
  const readFileFn = (p) => {
    if (p === '/custom/package.json') {
      return JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.2' })
    }
    return ''
  }
  const result = resolveDshInstall('linux', { DSH_BIN_PATH: '/custom/bin/dsh', PATH: '' }, { existsSyncFn, realpathFn, readFileFn })
  assert.equal(result?.version, '0.1.2')
  assert.equal(result?.binPath, '/custom/bin/dsh')
  assert.equal(result?.packagePath, '/custom/package.json')
})

test('fetchDshLatest reports update when npm has a newer version', async () => {
  const fetchFn = async (url) => {
    const s = String(url)
    if (s.includes('/tags')) {
      return new Response(JSON.stringify([{ name: 'dsh-v0.1.3' }]))
    }
    if (s.includes('registry.npmjs.org')) {
      return new Response(JSON.stringify({
        'dist-tags': { latest: '0.1.3' },
        time: { '0.1.3': '2026-09-05T10:00:00Z' },
      }))
    }
    return new Response('{}')
  }
  const info = await fetchDshLatest({ fetchFn, current: '0.1.2-rc.1', env: { PATH: '' } })
  assert.equal(info.status, 'update')
  assert.equal(info.canUpdate, true)
  assert.equal(info.npm?.version, '0.1.3')
  assert.equal(info.latestTag?.tag, 'dsh-v0.1.3')
})

test('fetchDshLatest reports github-only when GitHub tag is newer but npm is not', async () => {
  const fetchFn = async (url) => {
    const s = String(url)
    if (s.includes('/tags')) {
      return new Response(JSON.stringify([{ name: 'dsh-v0.1.3-alpha.1' }]))
    }
    if (s.includes('registry.npmjs.org')) {
      return new Response(JSON.stringify({
        'dist-tags': { latest: '0.1.2-rc.1' },
        time: { '0.1.2-rc.1': '2026-09-03T06:21:52Z' },
      }))
    }
    return new Response('{}')
  }
  const info = await fetchDshLatest({ fetchFn, current: '0.1.2-rc.1', env: { PATH: '' } })
  assert.equal(info.status, 'github-only')
  assert.equal(info.canUpdate, false)
  assert.equal(info.latestTag?.tag, 'dsh-v0.1.3-alpha.1')
  assert.equal(info.npm?.version, '0.1.2-rc.1')
})

test('fetchDshLatest reports current when installed matches latest release', async () => {
  const fetchFn = async (url) => {
    const s = String(url)
    if (s.includes('/tags')) {
      return new Response(JSON.stringify([{ name: 'dsh-v0.1.2' }]))
    }
    if (s.includes('registry.npmjs.org')) {
      return new Response(JSON.stringify({
        'dist-tags': { latest: '0.1.2' },
      }))
    }
    return new Response('{}')
  }
  const info = await fetchDshLatest({ fetchFn, current: '0.1.2', env: { PATH: '' } })
  assert.equal(info.status, 'current')
  assert.equal(info.canUpdate, false)
})

function fakeDshFs(version) {
  const bin = '/opt/homebrew/bin/dsh'
  const pkg = '/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/package.json'
  const state = { version }
  return {
    state,
    env: { DSH_BIN_PATH: bin, PATH: '' },
    existsSyncFn: (p) => p === bin || p === pkg,
    realpathFn: () => '/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
    readFileFn: (p) => (p === pkg ? JSON.stringify({ name: '@deepseek-ai/dsh', version: state.version }) : ''),
  }
}

test('applyHostDshUpdate installs into the running prefix and reports installed once the copy matches', async () => {
  const fs = fakeDshFs('0.1.2-alpha.5')
  const seen = []
  const spawnFn = (cmd, args, opts) => {
    seen.push({ cmd, args })
    fs.state.version = '0.1.2-rc.1'
    return fakeChild({ code: 0 })(cmd, args, opts)
  }
  const result = await applyHostDshUpdate({ spawnFn, targetVersion: '0.1.2-rc.1', ...fs })
  assert.equal(result.ok, true)
  assert.equal(result.status, 'installed')
  assert.equal(result.before, '0.1.2-alpha.5')
  assert.equal(result.after, '0.1.2-rc.1')
  assert.equal(seen[0].cmd, 'npm')
  assert.deepEqual(seen[0].args, ['install', '-g', '--prefix', '/opt/homebrew', '@deepseek-ai/dsh@0.1.2-rc.1'])
})

test('applyHostDshUpdate is not ok when npm exits 0 but the running copy keeps the old version', async () => {
  const fs = fakeDshFs('0.1.2-alpha.5')
  const result = await applyHostDshUpdate({ spawnFn: fakeChild({ code: 0 }), targetVersion: '0.1.2-rc.1', ...fs })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'installed-unchanged')
  assert.equal(result.after, '0.1.2-alpha.5')
  assert.match(result.error, /0\.1\.2-alpha\.5 · \/opt\/homebrew\/lib\/node_modules\/@deepseek-ai\/dsh/)
})

test('applyHostDshUpdate reports failed on nonzero exit', async () => {
  const spawnFn = fakeChild({ code: 1, stderr: 'EACCES permission denied' })
  const result = await applyHostDshUpdate({
    spawnFn,
    env: { PATH: '/bin:/usr/bin' },
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'failed')
  assert.match(result.error, /permission denied/)
})

test('applyHostDshUpdate reports missing-npm on ENOENT', async () => {
  const spawnFn = () => {
    const err = new Error('spawn npm ENOENT')
    err.code = 'ENOENT'
    throw err
  }
  const result = await applyHostDshUpdate({ spawnFn, env: { PATH: '' } })
  assert.equal(result.ok, false)
  assert.equal(result.status, 'missing-npm')
})


test('listDshInstallVersions sorts npm versions newest first and includes dist-tags', () => {
  const rows = listDshInstallVersions({
    versions: { '0.1.2-alpha.5': {}, '0.1.2-rc.1': {}, '0.1.1': {} },
    'dist-tags': { latest: '0.1.2-rc.1', alpha: '0.1.2-alpha.5' },
  })
  assert.deepEqual(rows, ['0.1.2-rc.1', '0.1.2-alpha.5', '0.1.1'])
})

test('fetchDshLatest returns installable npm versions for the picker', async () => {
  const fetchFn = async (url) => {
    const s = String(url)
    if (s.includes('/tags')) return new Response(JSON.stringify([{ name: 'dsh-v0.1.3-alpha.1' }]))
    if (s.includes('registry.npmjs.org')) {
      return new Response(JSON.stringify({
        'dist-tags': { latest: '0.1.2-rc.1', alpha: '0.1.2-alpha.5' },
        versions: { '0.1.2-rc.1': {}, '0.1.2-alpha.5': {}, '0.1.1': {} },
        time: { '0.1.2-rc.1': '2026-09-03T06:21:52Z' },
      }))
    }
    return new Response('{}')
  }
  const info = await fetchDshLatest({ fetchFn, current: '0.1.2-rc.1', env: { PATH: '' } })
  assert.deepEqual(info.npm?.versions, ['0.1.2-rc.1', '0.1.2-alpha.5', '0.1.1'])
})

test('scheduleDshWebRestart spawns a delayed detached re-exec', () => {
  const seen = []
  const spawnFn = (cmd, args, opts) => {
    seen.push({ cmd, args, detached: opts.detached, stdio: opts.stdio })
    return { unref() {} }
  }
  const result = scheduleDshWebRestart({
    spawnFn,
    delaySec: 2,
    execPath: '/usr/bin/node',
    argv: ['node', '/Users/me/.local/bin/dsh', 'web'],
    cwd: '/tmp',
    platform: 'linux',
    env: { PATH: '/bin' },
  })
  assert.equal(result.ok, true)
  assert.equal(seen[0].cmd, '/bin/sh')
  assert.equal(seen[0].args[0], '-c')
  assert.match(seen[0].args[1], /sleep 2; exec /)
  assert.match(seen[0].args[1], /dsh/)
  assert.equal(seen[0].detached, true)
})

test('stampDshHostVersion rewrites the served client.js sentinel', () => {
  let written = ''
  const ok = stampDshHostVersion('client.js', '0.1.2-rc.1', {
    readFileFn: () => "const DSH_HOST_VERSION_STAMP = ''\nconst x = 1\n",
    writeFileFn: (_path, text) => { written = String(text) },
  })
  assert.equal(ok, true)
  assert.match(written, /const DSH_HOST_VERSION_STAMP = "0\.1\.2-rc\.1"/)
})

