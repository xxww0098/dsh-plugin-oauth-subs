/**
 * Bump the local dev build stamp after a normal build (`npm run dev-build`).
 * The stamp is git-ignored local state: a linked working tree reads it in About
 * as `0.0.105-dev.<n>`, so every dev build is distinguishable without touching
 * the release version in package.json.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { devBuildPath, nextDevBuild, parseDevBuild } from '../lib/utils/dev-version.js'

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const base = String(manifest.version ?? '').trim()
if (!base) throw new Error('package.json has no version')

let previous
try {
  previous = parseDevBuild(readFileSync(devBuildPath(root), 'utf8'))
} catch {
  // first dev build in this checkout
}
const stamp = nextDevBuild(previous, base, new Date().toISOString())
writeFileSync(devBuildPath(root), JSON.stringify(stamp, null, 2) + '\n')

console.log(`dev build ${base}-dev.${stamp.n} — About 的「当前版本」会显示这个号`)
