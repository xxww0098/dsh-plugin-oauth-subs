/**
 * Local version + GitHub latest-release check.
 * One zip is enough for all hosts; win/mac/linux rows share it unless
 * the release ships platform-named assets.
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json')

export const REPO_SLUG = 'xxww0098/dsh-plugin-oauth-subs'
export const REPO_URL = 'https://github.com/xxww0098/dsh-plugin-oauth-subs'
export const RELEASES_API = `https://api.github.com/repos/${REPO_SLUG}/releases/latest`
export const PLATFORMS = Object.freeze(['win', 'mac', 'linux'])

export function installedVersion() {
  return String(pkg.version ?? '')
}

export function parseVersion(tag) {
  const match = String(tag ?? '').trim().match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return undefined
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), raw: `${match[1]}.${match[2]}.${match[3]}` }
}

export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return 0
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
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
  const generic = []
  for (const asset of Array.isArray(assets) ? assets : []) {
    const name = asset?.name
    const url = asset?.browser_download_url || asset?.url
    if (typeof name !== 'string' || typeof url !== 'string' || !url) continue
    const row = { name, url, size: Number.isFinite(asset.size) ? asset.size : undefined }
    const kind = classifyAsset(name)
    if (kind === 'any') generic.push(row)
    else if (!named[kind]) named[kind] = row
  }
  const fallback = generic[0]
  return PLATFORMS.map((platform) => {
    const hit = named[platform] || fallback
    if (!hit) return undefined
    return {
      platform,
      current: platform === host,
      name: hit.name,
      url: hit.url,
      size: hit.size,
      generic: !named[platform],
    }
  }).filter(Boolean)
}

export function localUpdateInfo(platform = process.platform) {
  return {
    version: installedVersion(),
    platform: hostPlatform(platform),
    repo: REPO_URL,
    repoSlug: REPO_SLUG,
  }
}

export async function fetchLatest({ fetchFn = fetch, current, platform = process.platform, timeoutMs = 10_000 } = {}) {
  const local = localUpdateInfo(platform)
  const installed = parseVersion(current ?? local.version)?.raw ?? local.version
  const wait = new AbortController()
  const timer = setTimeout(() => wait.abort(), timeoutMs)
  try {
    const response = await fetchFn(RELEASES_API, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': `dsh-plugin-oauth-subs/${installed || 'dev'}`,
      },
      signal: wait.signal,
    })
    if (!response.ok) throw new Error(`GitHub releases ${response.status}`)
    const payload = await response.json()
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
        publishedAt: typeof payload?.published_at === 'string' ? payload.published_at : undefined,
      },
      assets: pickDownloads(payload?.assets, local.platform),
    }
  } finally {
    clearTimeout(timer)
  }
}
