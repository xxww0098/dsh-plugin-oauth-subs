/**
 * Local dev build stamp. `npm run dev-build` bumps `.dev-build.json`
 * (git-ignored) so a linked working tree reports `0.0.105-dev.<n>` in About
 * instead of the release number — the repo manifest itself stays a release
 * version, and every dev build is distinguishable from the previous one.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const DEV_BUILD_FILE = '.dev-build.json'

export function devBuildPath(root) {
  return join(String(root ?? ''), DEV_BUILD_FILE)
}

/** `{ base, n, at }` from a stamp file; undefined when missing or malformed. */
export function parseDevBuild(text) {
  try {
    const parsed = JSON.parse(String(text ?? ''))
    const base = typeof parsed?.base === 'string' ? parsed.base.trim() : ''
    const n = Number(parsed?.n)
    if (!base || !Number.isInteger(n) || n < 1) return undefined
    return { base, n, at: typeof parsed?.at === 'string' ? parsed.at : undefined }
  } catch {
    return undefined
  }
}

/** Next stamp: the same base keeps counting, a new release version restarts at 1. */
export function nextDevBuild(previous, base, at) {
  const n = previous && previous.base === base ? previous.n + 1 : 1
  return { base, n, at }
}

/** `0.0.105-dev.3` when the linked tree carries a stamp for the running version. */
export function readDevVersion(root, base, { readFileFn = readFileSync }: any = {}) {
  if (!root || !base) return undefined
  let text
  try {
    text = readFileFn(devBuildPath(root), 'utf8')
  } catch {
    return undefined
  }
  const stamp = parseDevBuild(text)
  if (!stamp || stamp.base !== base) return undefined
  return `${base}-dev.${stamp.n}`
}
