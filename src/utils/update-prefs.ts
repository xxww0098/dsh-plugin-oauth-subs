/**
 * Persist About-page auto-update checkboxes.
 * Keys are independent: plugin GitHub release vs npm @deepseek-ai/dsh.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const UPDATE_PREFS_FILE = 'update-prefs.json'
export const AUTO_UPDATE_INTERVAL_MS = 60 * 60 * 1000

export function defaultUpdatePrefs() {
  return { plugin: false, dsh: false }
}

export function updatePrefsPath(dataDir) {
  return join(dataDir, UPDATE_PREFS_FILE)
}

export function normalizeUpdatePrefs(raw) {
  return {
    plugin: raw?.plugin === true,
    dsh: raw?.dsh === true,
  }
}

export async function readUpdatePrefs(path) {
  try {
    const text = await readFile(path, 'utf8')
    return normalizeUpdatePrefs(JSON.parse(text))
  } catch {
    return defaultUpdatePrefs()
  }
}

export async function writeUpdatePrefs(path, prefs) {
  const next = normalizeUpdatePrefs(prefs)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(next) + '\n', 'utf8')
  return next
}
