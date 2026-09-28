/**
 * Auto-update preference + last-run outcome, persisted in the plugin data
 * dir (`update-prefs.json` / `update-state.json` next to auth.json). Desktop
 * specialization: self-install is the only update path, so the pref is a
 * single boolean and the state is the last install attempt's result.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { writePrivateText } from './private-text.js'

/** 15-minute cadence — the cadence the About card advertises. */
export const AUTO_UPDATE_INTERVAL_MS = 15 * 60_000

export const updatePrefsPath = (authPath) => join(dirname(authPath), 'update-prefs.json')
export const updateStatePath = (authPath) => join(dirname(authPath), 'update-state.json')

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

const writeJson = (path, value) => writePrivateText(path, `${JSON.stringify(value, null, 2)}\n`)

export async function readUpdatePrefs(path) {
  const raw = await readJson(path, undefined)
  return { autoUpdate: raw?.autoUpdate === true }
}

export const writeUpdatePrefs = (path, prefs) =>
  writeJson(path, { autoUpdate: prefs?.autoUpdate === true })

export async function readUpdateState(path) {
  const raw = await readJson(path, undefined)
  return raw && typeof raw === 'object' ? raw : undefined
}

export const writeUpdateState = (path, state) => writeJson(path, state)
