/**
 * Local version + GitHub latest-release check, then the host plugin updater.
 *
 * About "当前版本" is the package this process actually loaded
 * (`import.meta.url` → `../../package.json`). Profile
 * `node_modules/dsh-plugin-oauth-subs/package.json` can already be newer
 * (pnpm `github:` write) while Cordis still requires another copy.
 * Compare GitHub against the running module. When disk is latest but the
 * process is behind, still `add <repo>#vX.Y.Z`. `.dsh-module-fallback` and
 * `$DSH_HOME/profiles/node_modules` are extra copies we report, not the
 * About version.
 *
 * `dsh plugin update` is `pnpm update` and can no-op on a git spec.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export function modulePackageJsonPath() {
  return fileURLToPath(new URL('../../package.json', import.meta.url))
}

export const REPO_SLUG = 'xxww0098/dsh-plugin-oauth-subs'
export const REPO_URL = 'https://github.com/xxww0098/dsh-plugin-oauth-subs'
export const RELEASES_API = `https://api.github.com/repos/${REPO_SLUG}/releases/latest`
export const RELEASES_LATEST_HTML = `${REPO_URL}/releases/latest`
export const PLATFORMS = Object.freeze(['win', 'mac', 'linux'])
export const PLUGIN_NAME = 'dsh-plugin-oauth-subs'
export const DEFAULT_PROFILE = 'web'
export const DSH_BIN = 'dsh'
export const GH_BIN = 'gh'
export const PLUGIN_UPDATE_TIMEOUT_MS = 180_000
export const GH_API_TIMEOUT_MS = 5_000

/** Version of the module this process actually loaded. Always re-reads disk. */
export function installedVersion({ readFileFn } = {}) {
  return readPackageVersion(modulePackageJsonPath(), { readFileFn })
}

/** Newer of two semver-ish tags. Empty / unparseable values lose. */
export function fresherVersion(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a && b) return compareVersions(a.raw, b.raw) >= 0 ? a.raw : b.raw
  if (a) return a.raw
  if (b) return b.raw
  const fallback = [left, right].find((value) => typeof value === 'string' && value.trim())
  return fallback ? String(fallback).trim() : ''
}

export function parseVersion(tag) {
  const match = String(tag ?? '').trim().match(/(?:v|dsh-v)?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/)
  if (!match) return undefined
  const prerelease = match[4] || ''
  const raw = prerelease ? `${match[1]}.${match[2]}.${match[3]}-${prerelease}` : `${match[1]}.${match[2]}.${match[3]}`
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
    raw,
  }
}

export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return 0
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch

  // Non-prerelease is greater than prerelease (e.g. 0.1.2 > 0.1.2-rc.1)
  if (!a.prerelease && b.prerelease) return 1
  if (a.prerelease && !b.prerelease) return -1
  if (!a.prerelease && !b.prerelease) return 0

  const aParts = a.prerelease.split('.')
  const bParts = b.prerelease.split('.')
  const len = Math.max(aParts.length, bParts.length)
  for (let i = 0; i < len; i++) {
    const aPart = aParts[i]
    const bPart = bParts[i]
    if (aPart === undefined) return -1
    if (bPart === undefined) return 1
    if (aPart === bPart) continue

    const aNum = Number(aPart)
    const bNum = Number(bPart)
    const aIsNum = !Number.isNaN(aNum) && String(aNum) === aPart
    const bIsNum = !Number.isNaN(bNum) && String(bNum) === bPart

    if (aIsNum && bIsNum) return aNum - bNum
    if (aIsNum && !bIsNum) return -1
    if (!aIsNum && bIsNum) return 1
    return aPart.localeCompare(bPart)
  }
  return 0
}

export function hostPlatform(platform = process.platform) {
  if (platform === 'win32') return 'win'
  if (platform === 'darwin') return 'mac'
  return 'linux'
}

export function classifyAsset(name) {
  const n = String(name ?? '').toLowerCase()
  if (/(windows|win32|win64|\bwin\b)/.test(n)) return 'win'
  if (/(darwin|macos|\bmac\b|\bosx\b)/.test(n)) return 'mac'
  if (/(linux|gnu)/.test(n)) return 'linux'
  return 'any'
}

export function pickDownloads(assets, host) {
  const named = { win: undefined, mac: undefined, linux: undefined }
  for (const asset of Array.isArray(assets) ? assets : []) {
    const name = asset?.name
    const url = asset?.browser_download_url || asset?.url
    if (typeof name !== 'string' || typeof url !== 'string' || !url) continue
    const kind = classifyAsset(name)
    if (kind === 'any' || named[kind]) continue
    named[kind] = { name, url, size: Number.isFinite(asset.size) ? asset.size : undefined }
  }
  return PLATFORMS.flatMap((platform) => {
    const hit = named[platform]
    if (!hit) return []
    return [{
      platform,
      current: platform === host,
      name: hit.name,
      url: hit.url,
      size: hit.size,
    }]
  })
}

export function localUpdateInfo(platform = process.platform, opts = {}) {
  const runningPath = modulePackageJsonPath()
  const running = installedVersion({ readFileFn: opts.readFileFn })
  const diskPath = profilePluginPackageJson(opts.profile, opts.env)
  const disk = readPackageVersion(diskPath, { readFileFn: opts.readFileFn })
  const resolvedPath = resolveProfilePluginManifest(opts.profile, opts.env, { resolveFn: opts.resolveFn })
  const resolved = resolvedPath ? readPackageVersion(resolvedPath, { readFileFn: opts.readFileFn }) : ''
  const copies = extraPluginManifests(opts.profile, opts.env)
    .map((path) => ({ path, version: readPackageVersion(path, { readFileFn: opts.readFileFn }) }))
    .filter((row) => row.version)
  const staleProcess = Boolean(
    disk && running && parseVersion(disk) && parseVersion(running) && compareVersions(disk, running) !== 0,
  )
  const staleLoad = Boolean(
    staleProcess && canonicalPath(runningPath, opts) !== canonicalPath(diskPath, opts),
  )
  return {
    version: running,
    running,
    disk: disk || undefined,
    resolved: resolved || undefined,
    runningPath,
    diskPath,
    resolvedPath,
    copies,
    staleProcess,
    staleLoad,
    platform: hostPlatform(platform),
    repo: REPO_URL,
    repoSlug: REPO_SLUG,
  }
}

export function githubRequestHeaders(userAgent, env = process.env) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': userAgent,
  }
  const token = String(env?.GITHUB_TOKEN || env?.GH_TOKEN || '').trim()
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

/** `/releases/tag/v0.0.84` or `/tags/dsh-v0.1.5-alpha.2` from a github.com URL. */
export function tagFromGithubReleaseUrl(url) {
  const match = String(url ?? '').match(/\/(?:releases\/tag|tags)\/([^/?#]+)/)
  if (!match) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function ghBins(env = process.env, existsSyncFn = existsSync) {
  const pinned = String(env?.GH_BIN || '').trim()
  if (pinned) return [pinned]
  const bins = [GH_BIN]
  for (const abs of ['/opt/homebrew/bin/gh', '/usr/local/bin/gh']) {
    if (existsSyncFn(abs) && !bins.includes(abs)) bins.push(abs)
  }
  return bins
}

function spawnGhJsonOnce(spawnFn, bin, args, env, timeoutMs) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawnFn(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      resolve({ enoent: error?.code === 'ENOENT' })
      return
    }
    let stdout = ''
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM') } catch { /* already gone */ }
      finish({})
    }, timeoutMs)
    child.stdout?.on?.('data', (chunk) => { stdout += chunk })
    child.stderr?.on?.('data', () => { /* ignore; may contain auth hints */ })
    child.once('error', (error) => {
      finish({ enoent: error?.code === 'ENOENT' })
    })
    child.once('close', (code) => {
      if (code !== 0) {
        finish({})
        return
      }
      try {
        finish({ json: JSON.parse(stdout) })
      } catch {
        finish({})
      }
    })
  })
}

async function runGhApiJson({
  spawnFn = spawn,
  args,
  env = process.env,
  timeoutMs = GH_API_TIMEOUT_MS,
  existsSyncFn = existsSync,
} = {}) {
  if (!Array.isArray(args) || args.length === 0) return undefined
  for (const bin of ghBins(env, existsSyncFn)) {
    const result = await spawnGhJsonOnce(spawnFn, bin, args, env, timeoutMs)
    if (result?.json !== undefined) return result.json
    if (!result?.enoent) return undefined
  }
  return undefined
}

async function fetchGithubLatestHtml(fetchFn, htmlUrl, { userAgent, signal } = {}) {
  const response = await fetchFn(htmlUrl, {
    headers: {
      accept: 'text/html',
      'user-agent': userAgent || 'dsh-plugin-oauth-subs',
    },
    redirect: 'manual',
    signal,
  })
  const location = typeof response.headers?.get === 'function' ? response.headers.get('location') : undefined
  const tag = tagFromGithubReleaseUrl(location) || tagFromGithubReleaseUrl(response.url)
  if (!tag) return undefined
  const url = location && /^https?:/i.test(location)
    ? location
    : `${String(htmlUrl).replace(/\/releases\/latest$/, '')}/releases/tag/${tag}`
  return { tag, url }
}

/** GitHub `published_at` as `YYYY-MM-DD HH:mm:ss` in Asia/Shanghai. */
export function formatPublishedAt(iso) {
  if (typeof iso !== 'string' || !iso.trim()) return undefined
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.trim()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const pick = (type) => parts.find((part) => part.type === type)?.value || ''
  const hour = pick('hour') === '24' ? '00' : pick('hour')
  return `${pick('year')}-${pick('month')}-${pick('day')} ${hour}:${pick('minute')}:${pick('second')}`
}

export async function fetchLatest({
  fetchFn = fetch,
  spawnFn = spawn,
  current,
  platform = process.platform,
  timeoutMs = 10_000,
  profile,
  env,
  readFileFn,
  existsSyncFn,
} = {}) {
  const local = localUpdateInfo(platform, { profile, env, readFileFn })
  const installed = parseVersion(current ?? local.version)?.raw ?? local.version
  const wait = new AbortController()
  const timer = setTimeout(() => wait.abort(), timeoutMs)
  const userAgent = `dsh-plugin-oauth-subs/${installed || 'dev'}`
  try {
    let payload
    let apiStatus
    try {
      const response = await fetchFn(RELEASES_API, {
        headers: githubRequestHeaders(userAgent, env),
        signal: wait.signal,
      })
      if (response.ok) payload = await response.json()
      else apiStatus = response.status
    } catch (error) {
      if (wait.signal.aborted) throw error
      apiStatus = 0
    }
    if (!payload) {
      try {
        const gh = await runGhApiJson({
          spawnFn,
          args: ['api', `repos/${REPO_SLUG}/releases/latest`],
          env,
          existsSyncFn,
        })
        if (gh && (gh.tag_name || gh.name)) payload = gh
      } catch {
        // keep apiStatus
      }
    }
    if (!payload) {
      try {
        const html = await fetchGithubLatestHtml(fetchFn, RELEASES_LATEST_HTML, {
          userAgent,
          signal: wait.signal,
        })
        if (html) payload = { tag_name: html.tag, html_url: html.url, assets: [] }
      } catch {
        // keep apiStatus
      }
    }
    if (!payload) throw new Error(apiStatus ? `GitHub releases ${apiStatus}` : 'GitHub releases unavailable')
    const tag = payload?.tag_name || payload?.name
    const latest = parseVersion(tag)
    const cmp = latest ? compareVersions(latest.raw, installed) : 0
    const status = !latest ? 'unknown' : cmp > 0 ? 'update' : cmp < 0 ? 'ahead' : 'current'
    const html = typeof payload?.html_url === 'string' ? payload.html_url : `${REPO_URL}/releases/latest`
    return {
      ...local,
      version: installed,
      status,
      latest: {
        tag: typeof tag === 'string' ? tag : undefined,
        name: typeof payload?.name === 'string' ? payload.name : undefined,
        url: html,
        publishedAt: formatPublishedAt(payload?.published_at),
      },
      assets: pickDownloads(payload?.assets, local.platform),
    }
  } finally {
    clearTimeout(timer)
  }
}

/** `$DSH_HOME/profiles/<name>` from Cordis `ctx.baseUrl`, else web. */
export function profileFromBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.startsWith('file:')) return DEFAULT_PROFILE
  try {
    const path = fileURLToPath(baseUrl).replace(/\\/g, '/')
    const parts = path.split('/').filter(Boolean)
    const i = parts.lastIndexOf('profiles')
    if (i >= 0 && parts[i + 1]) return parts[i + 1]
  } catch {
    // not a file URL we can parse
  }
  return DEFAULT_PROFILE
}

export function pluginUpdateArgs(profile = DEFAULT_PROFILE) {
  return ['plugin', '--profile', String(profile || DEFAULT_PROFILE), 'update', PLUGIN_NAME]
}

export function pluginUpdateCommand(profile = DEFAULT_PROFILE) {
  return [DSH_BIN, ...pluginUpdateArgs(profile)].join(' ')
}

export function pluginAddArgs(profile = DEFAULT_PROFILE, source = REPO_URL) {
  return ['plugin', '--profile', String(profile || DEFAULT_PROFILE), 'add', String(source || REPO_URL)]
}

export function pluginRemoveArgs(profile = DEFAULT_PROFILE) {
  return ['plugin', '--profile', String(profile || DEFAULT_PROFILE), 'remove', PLUGIN_NAME]
}

/** GitHub tag → `dsh plugin add` source. `v0.0.71` and `0.0.71` both pin `#v0.0.71`. */
export function releaseInstallSource(tag) {
  const parsed = parseVersion(tag)
  if (!parsed) return REPO_URL
  return `${REPO_URL}#v${parsed.raw}`
}

export function workaroundCommand(profile = DEFAULT_PROFILE, source = REPO_URL) {
  return `${[DSH_BIN, ...pluginRemoveArgs(profile)].join(' ')} && ${[DSH_BIN, ...pluginAddArgs(profile, source)].join(' ')}`
}

export function profilePluginPackageJson(profile = DEFAULT_PROFILE, env = process.env) {
  return join(dshHome(env), 'profiles', String(profile || DEFAULT_PROFILE), 'node_modules', PLUGIN_NAME, 'package.json')
}

export function extraPluginManifests(profile = DEFAULT_PROFILE, env = process.env) {
  const home = dshHome(env)
  const name = String(profile || DEFAULT_PROFILE)
  return [
    join(home, 'profiles', 'node_modules', PLUGIN_NAME, 'package.json'),
    join(home, 'profiles', name, '.dsh-module-fallback', 'node_modules', PLUGIN_NAME, 'package.json'),
  ]
}

export function resolveProfilePluginManifest(profile = DEFAULT_PROFILE, env = process.env, { resolveFn } = {}) {
  const manifest = join(dshHome(env), 'profiles', String(profile || DEFAULT_PROFILE), 'package.json')
  try {
    const resolve = resolveFn || createRequire(existsSync(manifest) ? manifest : import.meta.url).resolve
    return resolve(`${PLUGIN_NAME}/package.json`)
  } catch {
    return undefined
  }
}

export function canonicalPath(path, { realpathFn } = {}) {
  if (!path) return ''
  try {
    return String((realpathFn || realpathSync)(path))
  } catch {
    return String(path)
  }
}

export function readPackageVersion(path, { readFileFn = readFileSync } = {}) {
  try {
    const raw = readFileFn(path, 'utf8')
    const text = typeof raw === 'string' ? raw : String(raw ?? '')
    const parsed = JSON.parse(text)
    return typeof parsed?.version === 'string' ? parsed.version : ''
  } catch {
    return ''
  }
}

/** True when `after` reached `latest`, or moved forward when latest is unknown. */
export function versionAdvanced(before, after, latest) {
  const next = parseVersion(after)
  if (!next) return false
  const want = parseVersion(latest)
  if (want && compareVersions(next.raw, want.raw) >= 0) return true
  const prev = parseVersion(before)
  return Boolean(prev && compareVersions(next.raw, prev.raw) > 0)
}

function dshHome(env = process.env) {
  const home = env.DSH_HOME
  if (typeof home === 'string' && home.trim()) return home.trim()
  return join(homedir(), '.dsh')
}

function clip(text) {
  const raw = String(text ?? '').trim().replace(/\s+/g, ' ')
  return raw.length > 400 ? `${raw.slice(0, 400)}…` : raw
}

function describeSpawnError(error, bin = DSH_BIN) {
  if (error?.code === 'ENOENT') {
    if (typeof bin === 'string' && bin !== DSH_BIN) {
      return `could not spawn DSH at ${bin}. Confirm DeepSeek Harness is still installed, then try again.`
    }
    return 'dsh was not found on PATH. Confirm DeepSeek Harness is installed, then try again.'
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * `dsh plugin …` must hit the copy serving this page. PATH `dsh` is often
 * missing in a GUI-launched process, and when present it may be a different
 * install than `DSH_BIN_PATH` / `process.argv[1]`.
 */
export function dshPluginBin(env = process.env) {
  return resolveDshInstall(process.platform, env)?.binPath || DSH_BIN
}

function dshSpawnSpec(bin, execPath = process.execPath) {
  if (typeof bin === 'string' && /\.[cm]?js$/i.test(bin)) {
    return { cmd: execPath, prefix: [bin] }
  }
  return { cmd: bin, prefix: [] }
}

function unchangedHint(profile, onDisk, latest) {
  const source = releaseInstallSource(latest)
  const ver = parseVersion(onDisk)?.raw || onDisk || 'unknown'
  const want = parseVersion(latest)?.raw || latest || 'unknown'
  return `on-disk version is still ${ver} (latest ${want}). Remove and re-add from GitHub: ${workaroundCommand(profile, source)}`
}

/**
 * Spawn the running DSH with the given plugin args. Exit 0 is only a spawn
 * success — `applyHostUpdate` re-reads the profile package.json.
 */
export function runDshPlugin({
  spawnFn = spawn,
  profile = DEFAULT_PROFILE,
  args,
  timeoutMs = PLUGIN_UPDATE_TIMEOUT_MS,
  env = process.env,
  execPath = process.execPath,
} = {}) {
  const argv = Array.isArray(args) && args.length ? args : pluginUpdateArgs(profile)
  const bin = dshPluginBin(env)
  const spec = dshSpawnSpec(bin, execPath)
  const spawnArgs = [...spec.prefix, ...argv]
  const command = [bin, ...argv].join(' ')
  const home = dshHome(env)
  const cwd = existsSync(home) ? home : undefined
  return new Promise((resolve) => {
    let child
    try {
      child = spawnFn(spec.cmd, spawnArgs, {
        env,
        ...(cwd ? { cwd } : {}),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({ ok: false, status: error?.code === 'ENOENT' ? 'missing-dsh' : 'failed', command, error: describeSpawnError(error, bin) })
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM') } catch { /* already gone */ }
      finish({ ok: false, status: 'timeout', command, error: `dsh plugin update timed out after ${timeoutMs}ms` })
    }, timeoutMs)

    child.stdout?.on?.('data', (chunk) => { stdout += chunk })
    child.stderr?.on?.('data', (chunk) => { stderr += chunk })
    child.once('error', (error) => {
      finish({
        ok: false,
        status: error?.code === 'ENOENT' ? 'missing-dsh' : 'failed',
        command,
        error: describeSpawnError(error, bin),
      })
    })
    child.once('close', (code) => {
      if (code === 0) {
        finish({ ok: true, status: 'spawned', command })
        return
      }
      const detail = clip(stderr) || clip(stdout) || `dsh plugin update exited ${code}`
      finish({ ok: false, status: 'failed', command, error: detail })
    })
  })
}

/**
 * Spawn `dsh plugin update` via the running DSH copy. Exit 0 is spawn-only;
 * prefer `applyHostUpdate` when the on-disk version must have moved.
 */
export function runPluginUpdate({
  spawnFn = spawn,
  profile = DEFAULT_PROFILE,
  timeoutMs = PLUGIN_UPDATE_TIMEOUT_MS,
  env = process.env,
  execPath = process.execPath,
} = {}) {
  return runDshPlugin({ spawnFn, profile, args: pluginUpdateArgs(profile), timeoutMs, env, execPath })
}

/**
 * Apply a host update and confirm the profile's package.json moved.
 * `dsh plugin update` is `pnpm update` and can no-op on a git-pinned
 * install; if the version did not reach `latest`, retry
 * `dsh plugin add <repo>#vX.Y.Z`.
 */
export async function applyHostUpdate({
  spawnFn = spawn,
  profile = DEFAULT_PROFILE,
  latest,
  timeoutMs = PLUGIN_UPDATE_TIMEOUT_MS,
  env,
  readFileFn,
} = {}) {
  const homeEnv = env ?? process.env
  const fileFn = readFileFn ?? readFileSync
  const running = installedVersion({ readFileFn: fileFn })
  const manifest = profilePluginPackageJson(profile, homeEnv)
  const before = readPackageVersion(manifest, { readFileFn: fileFn })
  const want = parseVersion(latest)?.raw
  const runningBehind = Boolean(want && parseVersion(running) && compareVersions(running, want) < 0)
  const diskReady = (value) => Boolean(want && parseVersion(value) && compareVersions(value, want) >= 0)
  const first = await runDshPlugin({
    spawnFn,
    profile,
    args: pluginUpdateArgs(profile),
    timeoutMs,
    env: homeEnv,
  })
  if (!first.ok && first.status !== 'failed') {
    return { ...first, before, after: before }
  }
  let after = readPackageVersion(manifest, { readFileFn: fileFn })
  if (first.ok && diskReady(after) && !runningBehind) {
    return { ok: true, status: 'installed', command: first.command, before, after }
  }
  if (want) {
    const second = await runDshPlugin({
      spawnFn,
      profile,
      args: pluginAddArgs(profile, releaseInstallSource(latest)),
      timeoutMs,
      env: homeEnv,
    })
    after = readPackageVersion(manifest, { readFileFn: fileFn })
    if (!second.ok && second.status !== 'failed') {
      return { ...second, before, after }
    }
    if (second.ok && (diskReady(after) || versionAdvanced(before, after, want))) {
      return { ok: true, status: 'installed', command: second.command, before, after }
    }
    if (!second.ok) return { ...second, before, after }
    return {
      ok: false,
      status: 'unchanged',
      command: second.command,
      before,
      after,
      error: unchangedHint(profile, after || before, latest),
    }
  }
  if (!first.ok) return { ...first, before, after }
  return {
    ok: false,
    status: 'unchanged',
    command: first.command,
    before,
    after,
    error: unchangedHint(profile, after || before, latest),
  }
}
export const DSH_REPO_SLUG = 'deepseek-ai/deepseek-harness'
export const DSH_REPO_URL = 'https://github.com/deepseek-ai/deepseek-harness'
export const DSH_TAGS_API = `https://api.github.com/repos/${DSH_REPO_SLUG}/tags`
export const DSH_RELEASES_API = `https://api.github.com/repos/${DSH_REPO_SLUG}/releases`
export const DSH_RELEASES_LATEST_HTML = `${DSH_REPO_URL}/releases/latest`
export const DSH_NPM_PACKAGE = '@deepseek-ai/dsh'
export const DSH_NPM_REGISTRY_API = `https://registry.npmjs.org/${DSH_NPM_PACKAGE}`
export const DSH_UPDATE_TIMEOUT_MS = 180_000

/** npm registry versions newest-first; only these can be installed with npm -g. */
export function listDshInstallVersions(npmData) {
  const fromVersions = Object.keys(npmData?.versions || {})
  const fromTags = Object.values(npmData?.['dist-tags'] || {}).filter((value) => typeof value === 'string')
  const unique = [...new Set([...fromVersions, ...fromTags])]
  return unique.filter((value) => parseVersion(value)).sort((left, right) => compareVersions(right, left))
}

/**
 * The `@deepseek-ai/dsh` copy this process runs from: `DSH_BIN_PATH`, else the
 * entry script (`process.argv[1]`), realpath'd and walked up to its
 * package.json. Nothing else is consulted: `$_`, PATH `dsh`, global prefixes
 * and `dsh --version` all named some *other* install (the running Homebrew
 * copy vs `npm prefix -g`), so About flipped between versions and the updater
 * chased a copy that was not the one serving the page.
 */
export function resolveDshInstall(
  _platform = process.platform,
  env = process.env,
  { realpathFn = realpathSync, readFileFn = readFileSync, existsSyncFn = existsSync } = {},
) {
  const candidates = [env.DSH_BIN_PATH, process.argv?.[1]].filter((value) => typeof value === 'string' && value)
  for (const bin of candidates) {
    if (!existsSyncFn(bin)) continue
    try {
      const real = realpathFn(bin)
      let dir = dirname(real)
      for (let i = 0; i < 5; i++) {
        const pkgPath = join(dir, 'package.json')
        if (existsSyncFn(pkgPath)) {
          const parsed = JSON.parse(String(readFileFn(pkgPath, 'utf8') ?? ''))
          if (parsed?.name === DSH_NPM_PACKAGE) {
            return {
              binPath: bin,
              realPath: real,
              packagePath: pkgPath,
              version: typeof parsed.version === 'string' ? parsed.version : '',
            }
          }
        }
        const parent = dirname(dir)
        if (parent === dir) break
        dir = parent
      }
    } catch {
      // try next
    }
  }
  return undefined
}

export function localDshInfo(platform = process.platform, opts = {}) {
  const env = opts.env ?? process.env
  const fileFn = opts.readFileFn ?? readFileSync
  const realFn = opts.realpathFn ?? realpathSync
  const existsFn = opts.existsSyncFn ?? existsSync
  const resolved = resolveDshInstall(platform, env, { realpathFn: realFn, readFileFn: fileFn, existsSyncFn: existsFn })
  const version = resolved?.version || ''
  return {
    version,
    binPath: resolved?.binPath,
    realPath: resolved?.realPath,
    packagePath: resolved?.packagePath,
    platform: hostPlatform(platform),
    repo: DSH_REPO_URL,
    repoSlug: DSH_REPO_SLUG,
    npmPackage: DSH_NPM_PACKAGE,
  }
}

export async function fetchDshLatest({
  fetchFn = fetch,
  spawnFn = spawn,
  current,
  platform = process.platform,
  timeoutMs = 10_000,
  env,
  readFileFn,
  realpathFn,
  existsSyncFn,
} = {}) {
  const local = localDshInfo(platform, { env, readFileFn, realpathFn, existsSyncFn })
  const installed = parseVersion(current ?? local.version)?.raw ?? local.version
  const wait = new AbortController()
  const timer = setTimeout(() => wait.abort(), timeoutMs)
  try {
    let githubTag
    let githubVersion
    let githubTagPublishedAt
    let githubTagUrl
    let githubName

    const userAgent = `dsh-plugin-oauth-subs/${installed || 'dev'}`
    const ghHeaders = githubRequestHeaders(userAgent, env)

    try {
      const tagsResp = await fetchFn(DSH_TAGS_API, { headers: ghHeaders, signal: wait.signal })
      if (tagsResp.ok) {
        const tags = await tagsResp.json()
        if (Array.isArray(tags) && tags.length > 0) {
          const first = tags[0]
          githubTag = typeof first?.name === 'string' ? first.name : undefined
          githubVersion = parseVersion(githubTag)?.raw || githubTag
          githubTagUrl = `${DSH_REPO_URL}/releases/tag/${githubTag}`
        }
      }
    } catch {
      // ignore tag fetch failure
    }

    if (!githubTag) {
      try {
        const tags = await runGhApiJson({
          spawnFn,
          args: ['api', `repos/${DSH_REPO_SLUG}/tags`],
          env,
          existsSyncFn,
        })
        if (Array.isArray(tags) && typeof tags[0]?.name === 'string') {
          githubTag = tags[0].name
          githubVersion = parseVersion(githubTag)?.raw || githubTag
          githubTagUrl = `${DSH_REPO_URL}/releases/tag/${githubTag}`
        }
      } catch {
        // ignore gh fallback failure
      }
    }

    if (!githubTag) {
      try {
        const html = await fetchGithubLatestHtml(fetchFn, DSH_RELEASES_LATEST_HTML, {
          userAgent,
          signal: wait.signal,
        })
        if (html) {
          githubTag = html.tag
          githubVersion = parseVersion(githubTag)?.raw || githubTag
          githubTagUrl = html.url
        }
      } catch {
        // ignore html fallback failure
      }
    }

    if (githubTag) {
      try {
        const relResp = await fetchFn(`${DSH_RELEASES_API}/tags/${githubTag}`, { headers: ghHeaders, signal: wait.signal })
        if (relResp.ok) {
          const rel = await relResp.json()
          githubName = typeof rel?.name === 'string' ? rel.name : undefined
          githubTagPublishedAt = formatPublishedAt(rel?.published_at)
          if (typeof rel?.html_url === 'string') githubTagUrl = rel.html_url
        }
      } catch {
        // ignore release fetch failure
      }
    }

    let npmVersion
    let npmStable
    let npmPublishedAt
    let npmDistTags = {}
    let npmVersions = []
    try {
      const npmResp = await fetchFn(DSH_NPM_REGISTRY_API, {
        headers: { accept: 'application/json' },
        signal: wait.signal,
      })
      if (npmResp.ok) {
        const npmData = await npmResp.json()
        npmDistTags = npmData?.['dist-tags'] || {}
        npmVersions = listDshInstallVersions(npmData)
        // Newest published version — matches the npm page's version tab. The
        // `latest` tag can trail `next` (0.1.5-rc.2 shipped under `next` while
        // `latest` stayed 0.1.5-rc.1), so the tag is only the fallback.
        npmVersion = npmVersions[0] || npmDistTags.latest || npmDistTags.next || npmDistTags.alpha
        // Stable channel: the `latest` dist-tag, never the newest prerelease.
        npmStable = npmDistTags.latest || npmDistTags.next || npmDistTags.alpha
        if (npmVersion && npmData?.time?.[npmVersion]) {
          npmPublishedAt = formatPublishedAt(npmData.time[npmVersion])
        }
      }
    } catch {
      // ignore npm fetch failure
    }

    const canUpdate = Boolean(npmVersion && installed && compareVersions(npmVersion, installed) > 0)

    let status = 'unknown'
    if (canUpdate) {
      status = 'update'
    } else if (githubVersion && installed && compareVersions(githubVersion, installed) > 0) {
      status = 'github-only'
    } else if (installed && npmVersion && compareVersions(installed, npmVersion) === 0) {
      status = 'current'
    } else if (installed && githubVersion && compareVersions(installed, githubVersion) > 0) {
      status = 'ahead'
    } else if (installed) {
      status = 'current'
    }

    return {
      ...local,
      version: installed,
      status,
      canUpdate,
      latestTag: githubTag ? {
        tag: githubTag,
        version: githubVersion,
        name: githubName,
        url: githubTagUrl || `${DSH_REPO_URL}/tags`,
        publishedAt: githubTagPublishedAt,
      } : undefined,
      npm: npmVersion ? {
        version: npmVersion,
        stable: npmStable,
        publishedAt: npmPublishedAt,
        distTags: npmDistTags,
        versions: npmVersions,
      } : undefined,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * npm global prefix that owns `packagePath` — `<prefix>/lib/node_modules/…`
 * on POSIX, `<prefix>/node_modules/…` on Windows. '' for pnpm / bun / unknown
 * layouts, which fall back to npm's own `prefix -g`.
 */
export function dshInstallPrefix(packagePath, platform = process.platform) {
  const parts = String(packagePath || '').split(/[\\/]/)
  const idx = parts.lastIndexOf('node_modules')
  if (idx < 1 || parts.slice(idx + 1).join('/') !== `${DSH_NPM_PACKAGE}/package.json`) return ''
  const head = parts.slice(0, idx)
  if (platform === 'win32') return head.join('\\')
  if (head.pop() !== 'lib') return ''
  return head.join('/')
}

export function dshUpdateArgs(targetVersion, prefix = '') {
  const pkg = targetVersion ? `${DSH_NPM_PACKAGE}@${targetVersion}` : `${DSH_NPM_PACKAGE}@latest`
  return ['install', '-g', ...(prefix ? ['--prefix', prefix] : []), pkg]
}

export function dshUpdateCommand(targetVersion, prefix = '') {
  return ['npm', ...dshUpdateArgs(targetVersion, prefix)].join(' ')
}

export const DSH_HOST_VERSION_STAMP_RE = /const DSH_HOST_VERSION_STAMP = (['"])([^'"]*)\1/

export function pluginClientJsPath() {
  return fileURLToPath(new URL('../ui/client.js', import.meta.url))
}

/** Write local DSH version into the served client.js static file. */
export function stampDshHostVersion(clientPath, version, { readFileFn = readFileSync, writeFileFn = writeFileSync } = {}) {
  if (typeof clientPath !== 'string' || !clientPath) return false
  const raw = typeof version === 'string' ? version.trim() : ''
  if (!raw || !parseVersion(raw)) return false
  const text = String(readFileFn(clientPath, 'utf8') ?? '')
  if (!DSH_HOST_VERSION_STAMP_RE.test(text)) return false
  const next = text.replace(DSH_HOST_VERSION_STAMP_RE, 'const DSH_HOST_VERSION_STAMP = ' + JSON.stringify(raw))
  if (next === text) return true
  writeFileFn(clientPath, next)
  return true
}

/** Detached re-exec of this dsh web process after the listen port is free. */
export function scheduleDshWebRestart({
  spawnFn = spawn,
  env = process.env,
  delaySec = 2,
  execPath = process.execPath,
  argv = process.argv,
  cwd = process.cwd(),
  platform = process.platform,
} = {}) {
  const args = Array.isArray(argv) ? argv.slice(1) : []
  const isWin = platform === 'win32'
  const quoted = [execPath, ...args].map((value) => {
    const text = String(value)
    return isWin ? '"' + text.replace(/"/g, '\\"') + '"' : JSON.stringify(text)
  }).join(' ')
  const shellCmd = isWin
    ? 'timeout /t ' + delaySec + ' /nobreak >nul & ' + quoted
    : 'sleep ' + delaySec + '; exec ' + quoted
  const child = spawnFn(isWin ? 'cmd.exe' : '/bin/sh', isWin ? ['/c', shellCmd] : ['-c', shellCmd], {
    env,
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child?.unref?.()
  return { ok: true, command: shellCmd }
}

export async function applyHostDshUpdate({
  spawnFn = spawn,
  targetVersion,
  timeoutMs = DSH_UPDATE_TIMEOUT_MS,
  env,
  readFileFn,
  realpathFn,
  existsSyncFn,
} = {}) {
  const homeEnv = env ?? process.env
  const beforeInfo = localDshInfo(process.platform, { env: homeEnv, readFileFn, realpathFn, existsSyncFn })
  const before = beforeInfo.version || 'unknown'
  // Install over the copy this process runs from; `npm prefix -g` may point elsewhere and leave it untouched.
  const argv = dshUpdateArgs(targetVersion, dshInstallPrefix(beforeInfo.packagePath, process.platform))
  const command = ['npm', ...argv].join(' ')

  const pathWithDefaults = (current) => {
    const isWin = process.platform === 'win32'
    const userHome = homedir()
    const extras = isWin
      ? [join(userHome, 'AppData', 'Roaming', 'npm')]
      : [join(userHome, '.local', 'bin'), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin']
    const sep = isWin ? ';' : ':'
    const existing = (current || '').split(sep).filter(Boolean)
    for (const extra of extras) {
      if (!existing.includes(extra)) existing.unshift(extra)
    }
    return existing.join(sep)
  }

  const runEnv = {
    ...homeEnv,
    PATH: pathWithDefaults(homeEnv.PATH),
  }

  return new Promise((resolve) => {
    let child
    try {
      child = spawnFn('npm', argv, {
        env: runEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({
        ok: false,
        status: error?.code === 'ENOENT' ? 'missing-npm' : 'failed',
        command,
        before,
        after: before,
        error: describeSpawnError(error),
      })
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM') } catch { /* no-op */ }
      finish({ ok: false, status: 'timeout', command, before, after: before, error: `npm install -g timed out after ${timeoutMs}ms` })
    }, timeoutMs)

    child.stdout?.on?.('data', (chunk) => { stdout += chunk })
    child.stderr?.on?.('data', (chunk) => { stderr += chunk })
    child.once('error', (error) => {
      finish({
        ok: false,
        status: error?.code === 'ENOENT' ? 'missing-npm' : 'failed',
        command,
        before,
        after: before,
        error: describeSpawnError(error),
      })
    })
    child.once('close', (code) => {
      const afterInfo = localDshInfo(process.platform, { env: homeEnv, readFileFn, realpathFn, existsSyncFn })
      const after = afterInfo.version || before
      if (code === 0) {
        // Exit 0 only proves npm ran. Restart only once the running copy reports the target exactly;
        // otherwise the re-exec'd dsh is still behind, sees the same update, installs and restarts forever.
        const want = parseVersion(targetVersion)?.raw
        const landed = want ? parseVersion(after)?.raw === want : after !== before
        if (landed) {
          finish({ ok: true, status: 'installed', command, before, after })
          return
        }
        finish({
          ok: false,
          status: 'installed-unchanged',
          command,
          before,
          after,
          error: afterInfo.packagePath ? `${after} · ${dirname(afterInfo.packagePath)}` : after,
        })
        return
      }
      const detail = clip(stderr) || clip(stdout) || `npm install -g exited ${code}`
      finish({
        ok: false,
        status: 'failed',
        command,
        before,
        after,
        error: detail,
      })
    })
  })
}

