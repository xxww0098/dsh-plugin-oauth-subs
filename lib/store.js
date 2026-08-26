/**
 * On-disk OAuth session store at `<dataDir>/auth.json`.
 *
 * The file is a JSON object keyed by provider id. Writes are atomic
 * (tmp file + rename) with mode 0600 because they carry bearer tokens.
 */

import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { formatPlanLabel } from './plan.js'

export const PROVIDER_IDS = Object.freeze(['codex', 'grok'])

export function defaultDataDir() {
  return join(homedir(), '.dsh', 'plugins', 'oauth-subs')
}

export function authFilePath(dataDir = defaultDataDir()) {
  return join(dataDir, 'auth.json')
}

function assertSessionShape(provider, value) {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`oauth-subs auth store: entry "${provider}" is not an object; fix or delete the store file`)
  }
  if (typeof value.accessToken !== 'string' || value.accessToken.length === 0
    || typeof value.refreshToken !== 'string' || value.refreshToken.length === 0
    || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)) {
    throw new Error(
      `oauth-subs auth store: entry "${provider}" is missing accessToken/refreshToken/expiresAt; fix or delete the store file`,
    )
  }
}

function parseStore(text, path) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`oauth-subs auth store at ${path} is not valid JSON; fix or delete the file`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`oauth-subs auth store at ${path} must be a JSON object keyed by provider; fix or delete the file`)
  }
  for (const provider of PROVIDER_IDS) {
    if (parsed[provider] !== undefined) assertSessionShape(provider, parsed[provider])
  }
  return parsed
}

export async function loadStore(path) {
  const file = path ?? authFilePath()
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
  return parseStore(text, file)
}

async function writeStore(store, path) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
  try {
    await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
    await chmod(tmp, 0o600)
    await rename(tmp, path)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}

const writeChains = new Map()

async function serialize(path, action) {
  const previous = writeChains.get(path) ?? Promise.resolve()
  const next = previous.then(action, action)
  const tail = next.then(() => undefined, () => undefined)
  writeChains.set(path, tail)
  try {
    return await next
  } finally {
    if (writeChains.get(path) === tail) writeChains.delete(path)
  }
}

export async function getSession(provider, path) {
  return (await loadStore(path))[provider]
}

export async function saveSession(provider, session, path) {
  const file = path ?? authFilePath()
  return serialize(file, async () => {
    const store = await loadStore(file)
    store[provider] = session
    await writeStore(store, file)
  })
}

export async function deleteSession(provider, path) {
  const file = path ?? authFilePath()
  return serialize(file, async () => {
    const store = await loadStore(file)
    if (store[provider] === undefined) return
    delete store[provider]
    await writeStore(store, file)
  })
}

export function publicSession(provider, session) {
  if (session === undefined) return undefined
  const planType = session.planType
  const planLabel = formatPlanLabel(planType)
  if (provider === 'codex') {
    return {
      account: session.emailAddress ?? session.accountId,
      planType,
      planLabel,
      expiresAt: session.expiresAt,
    }
  }
  return {
    account: session.account,
    planType,
    planLabel,
    scopes: session.scopes,
    expiresAt: session.expiresAt,
  }
}
