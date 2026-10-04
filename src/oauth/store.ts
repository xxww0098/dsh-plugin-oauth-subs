/**
 * On-disk OAuth session store at `<dataDir>/auth.json`.
 *
 * The file is a JSON object keyed by provider id. Writes are atomic
 * (tmp file + rename) with mode 0600 because they carry bearer tokens.
 */

import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { chmod, mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { formatPlanLabel } from './plan.js'
import { kiroAccountId, kiroMethodLabel } from './kiro/index.js'
import { displayGlmAccount } from './glm/index.js'
import { displayCursorAccount } from './cursor/index.js'
import { ollamaSourceLabel } from '../apikey/ollama/index.js'
import { commandCodeDefaultAccount, commandCodeSourceLabel, pickCommandCodeHumanAccount } from '../apikey/command-code/index.js'
import { kimiSourceLabel } from './kimi/index.js'
import { copilotSourceLabel } from './copilot/index.js'
import { devinSourceLabel, pickDevinHumanAccount } from './devin/index.js'
import { clineSourceLabel } from './cline/index.js'
import { readPrivateText, writePrivateText } from '../utils/private-text.js'

export { readPrivateText, writePrivateText }

/** Dropped families: their vault is never read and leaves the file with its next write. */
const RETIRED_PROVIDER_IDS = Object.freeze(['anthropic', 'workbuddy', 'workbuddy-ai'])

/**
 * One stored login. The store's hard floor is a usable accessToken; every
 * other field (credentials, identity labels, hydrated hints) is family
 * territory and arrives as an open shape — assertSessionShape enforces the
 * credential triple when the file is read.
 */
export interface StoredSession {
  accessToken: string
  /** Credential triple the loader asserts on every entry it reads. */
  refreshToken?: string
  expiresAt: number
  [key: string]: unknown
}

/** One provider's entry in auth.json: its logins plus rotation bookkeeping. */
export interface SessionVault {
  activeId: string | undefined
  accounts: Record<string, StoredSession>
  /** Opaque change token per account id — rotated on every save. */
  generations: Record<string, string>
}

/** A stored login plus the change tokens refresh bookkeeping compares on. */
export interface StoredAccount {
  id: string
  session: StoredSession
  active: boolean
  generation: string
  version: string
}

/** The parsed auth.json: provider-keyed JSON, values still raw until asVault. */
export type SessionStore = Record<string, unknown>

export const PROVIDER_IDS = Object.freeze(['codex', 'chatgpt', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'ollama', 'kimi', 'copilot', 'devin', 'cline', 'command-code'])

export function defaultDataDir(): string {
  return join(homedir(), '.dsh', 'plugins', 'oauth-subs')
}

export function authFilePath(dataDir = defaultDataDir()): string {
  return join(dataDir, 'auth.json')
}



function assertSessionShape(provider: string, value: unknown) {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`oauth-subs auth store: entry "${provider}" is not an object; fix or delete the store file`)
  }
  const record = value as Record<string, unknown>
  if (typeof record.accessToken !== 'string' || record.accessToken.length === 0
    || typeof record.refreshToken !== 'string' || record.refreshToken.length === 0
    || typeof record.expiresAt !== 'number' || !Number.isFinite(record.expiresAt)) {
    throw new Error(
      `oauth-subs auth store: entry "${provider}" is missing accessToken/refreshToken/expiresAt; fix or delete the store file`,
    )
  }
}

export function accountIdOf(provider: string, session: StoredSession | null | undefined): string {
  if (!session || typeof session !== 'object') return `${provider}-account`
  if (provider === 'codex') {
    const id = session.emailAddress || session.accountId
    if (typeof id === 'string' && id.trim()) return id.trim()
  } else if (provider === 'chatgpt') {
    // One vault row per issued client (user + workspace): the same email can
    // hold several registrations, so the key carries a hash of the client.
    if (typeof session.accountKey === 'string' && session.accountKey.trim()) return session.accountKey.trim()
  } else if (provider === 'glm') {
    const account = typeof session.account === 'string' && session.account.trim()
      ? session.account.trim()
      : 'glm'
    const region = session.region === 'bigmodel' ? 'bigmodel' : 'zai'
    return `${account}@${region}`
  } else if (provider === 'kiro') {
    return kiroAccountId(session)
  } else if (provider === 'command-code') {
    // Human identity first (userName/account/email — opaque fingerprints are
    // filtered); the user uuid, then a sha256 fingerprint — never the raw
    // key tail the generic fallback would use.
    const id = pickCommandCodeHumanAccount(session.userName, session.account, session.email)
      ?? (typeof session.userId === 'string' && session.userId.trim() ? session.userId.trim() : undefined)
      ?? commandCodeDefaultAccount(session.accessToken)
    return id
  } else if (typeof session.account === 'string' && session.account.trim()) {
    return session.account.trim()
  }
  if (typeof session.refreshToken === 'string' && session.refreshToken.length >= 8) {
    return `${provider}-${session.refreshToken.slice(-8)}`
  }
  return `${provider}-account`
}

function isSessionEntry(value: unknown): value is StoredSession {
  return !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).accessToken === 'string'
}

function isVaultEntry(value: unknown): value is { accounts: Record<string, unknown>; generations?: Record<string, unknown>; activeId?: unknown } {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && !!(value as Record<string, unknown>).accounts
    && typeof (value as Record<string, unknown>).accounts === 'object'
    && !Array.isArray((value as Record<string, unknown>).accounts)
    && !isSessionEntry(value)
}

function legacyGeneration(provider: string, id: string, session: unknown): string {
  return createHash('sha256').update(JSON.stringify([provider, id, session])).digest('hex')
}

export function asVault(provider: string, entry: unknown): SessionVault {
  if (entry === undefined) return { activeId: undefined, accounts: {}, generations: {} }
  if (isVaultEntry(entry)) {
    const accounts: Record<string, StoredSession> = {}
    const generations: Record<string, string> = {}
    for (const [rawId, session] of Object.entries(entry.accounts)) {
      if (!isSessionEntry(session)) continue
      const id = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : accountIdOf(provider, session)
      accounts[id] = session
      generations[id] = typeof entry.generations?.[rawId] === 'string'
        ? entry.generations[rawId]
        : legacyGeneration(provider, id, session)
    }
    const requested = typeof entry.activeId === 'string' ? entry.activeId : undefined
    const activeId = requested && accounts[requested] ? requested : Object.keys(accounts)[0]
    return { activeId, accounts, generations }
  }
  if (isSessionEntry(entry)) {
    const id = accountIdOf(provider, entry)
    return { activeId: id, accounts: { [id]: entry }, generations: { [id]: legacyGeneration(provider, id, entry) } }
  }
  throw new Error(`oauth-subs auth store: entry "${provider}" is not an object; fix or delete the store file`)
}

function parseStore(text: string, path: string): SessionStore {
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
    if (parsed[provider] === undefined) continue
    if (isVaultEntry(parsed[provider])) {
      for (const [id, session] of Object.entries(parsed[provider].accounts ?? {})) {
        assertSessionShape(`${provider}:${id}`, session)
      }
    } else {
      assertSessionShape(provider, parsed[provider])
    }
  }
  for (const provider of RETIRED_PROVIDER_IDS) delete parsed[provider]
  return parsed
}

export async function loadStore(path?: string): Promise<SessionStore> {
  const file = path ?? authFilePath()
  const text = await readPrivateText(file, 'oauth-subs auth store')
  if (text === undefined) return {}
  return parseStore(text, file)
}

async function writeStore(store: SessionStore, path: string): Promise<void> {
  await writePrivateText(path, `${JSON.stringify(store, null, 2)}\n`)
}

const writeChains = new Map<string, Promise<void>>()

async function serialize<T>(path: string, action: () => Promise<T>): Promise<T> {
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

export async function getSession(provider: string, path?: string): Promise<StoredSession | undefined> {
  return (await getStoredSession(provider, undefined, path))?.session
}

export async function listAccounts(provider: string, path?: string): Promise<Record<string, unknown>[]> {
  const vault = asVault(provider, (await loadStore(path))[provider])
  return Object.entries(vault.accounts)
    .map(([id, session]) => ({
      id,
      active: id === vault.activeId,
      ...publicSession(provider, session),
    }))
    .sort((left, right) => Number(right.active) - Number(left.active) || left.id.localeCompare(right.id))
}

function storedAccount(vault: SessionVault, id: string | undefined): StoredAccount | undefined {
  if (!id || !Object.hasOwn(vault.accounts, id)) return undefined
  const session = vault.accounts[id]
  const generation = vault.generations[id]
  const version = createHash('sha256').update(JSON.stringify([
    generation, session.accessToken, session.refreshToken, session.expiresAt,
  ])).digest('hex')
  return { id, session, active: id === vault.activeId, generation, version }
}

function matchingAccount(vault: SessionVault, source: StoredAccount): StoredAccount | undefined {
  // Identity hydration may rename the key while a refresh is in flight.
  const id = vault.generations[source.id] === source.generation
    ? source.id
    : Object.keys(vault.accounts).find((key) => vault.generations[key] === source.generation)
  const current = storedAccount(vault, id)
  return current?.version === source.version ? current : undefined
}

export async function listStoredSessions(provider: string, path?: string): Promise<StoredAccount[]> {
  const vault = asVault(provider, (await loadStore(path))[provider])
  return Object.keys(vault.accounts).flatMap((id) => {
    const account = storedAccount(vault, id)
    return account ? [account] : []
  })
}

export async function getStoredSession(provider: string, id: string | undefined, path?: string): Promise<StoredAccount | undefined> {
  const file = path ?? authFilePath()
  // A read opened before rotation must settle before that rotation's owner retires.
  return serialize(file, async () => {
    const vault = asVault(provider, (await loadStore(file))[provider])
    const key = typeof id === 'string' && id.trim() ? id.trim() : vault.activeId
    return storedAccount(vault, key)
  })
}

/** Only update the login/credentials that produced the result; never activate it. */
export async function updateAccountSession(provider: string, source: StoredAccount, session: StoredSession, path?: string, nextId?: string): Promise<StoredAccount | undefined> {
  const file = path ?? authFilePath()
  return serialize(file, async () => {
    const store = await loadStore(file)
    const vault = asVault(provider, store[provider])
    const current = matchingAccount(vault, source)
    if (!current) return undefined
    // An identity label must not overwrite another login already using that id.
    const id = nextId && (!Object.hasOwn(vault.accounts, nextId) || nextId === current.id)
      ? nextId : current.id
    const merged = { ...current.session }
    const keys = new Set([...Object.keys(source.session), ...Object.keys(session)])
    for (const key of keys) {
      if (!Object.hasOwn(session, key)) delete merged[key]
      else if (!isDeepStrictEqual(session[key], source.session[key])) merged[key] = session[key]
    }
    vault.accounts[id] = merged
    vault.generations[id] = current.generation
    if (id !== current.id) {
      delete vault.accounts[current.id]
      delete vault.generations[current.id]
      if (vault.activeId === current.id) vault.activeId = id
    }
    store[provider] = vault
    await writeStore(store, file)
    return storedAccount(vault, id)
  })
}

export async function replaceAccountId(provider: string, source: StoredAccount, session: StoredSession, path?: string): Promise<StoredAccount | undefined> {
  return updateAccountSession(provider, source, session, path, accountIdOf(provider, session))
}

/**
 * Fields a fresh login always re-issues. Everything else the vault already
 * holds for the same account id — hydrated hints like Antigravity projectId,
 * Cursor cachedEmail, needsValidation — survives a re-login instead of being
 * dropped, the same merge CLIProxyAPI runs in MergeExistingAuthMetadata.
 * `source` is how the login was made: a browser login must not inherit an
 * import's read-only marker, or its own refresh token is never exchanged.
 */
const SESSION_CREDENTIAL_KEYS = new Set([
  'accessToken', 'refreshToken', 'idToken', 'expiresAt', 'sessionToken', 'tokenType', 'source',
])

function mergeSavedSession(existing: StoredSession | undefined, session: StoredSession): StoredSession {
  if (!existing || typeof existing !== 'object') return session
  const merged = { ...session }
  for (const [key, value] of Object.entries(existing)) {
    if (SESSION_CREDENTIAL_KEYS.has(key)) continue
    if (!Object.hasOwn(merged, key)) merged[key] = value
  }
  return merged
}

export async function saveSession(provider: string, session: StoredSession, path?: string, options?: { activate?: boolean; id?: string }): Promise<StoredAccount | undefined> {
  const file = path ?? authFilePath()
  const activate = options?.activate !== false
  return serialize(file, async () => {
    const store = await loadStore(file)
    const vault = asVault(provider, store[provider])
    const id = typeof options?.id === 'string' && options.id.trim()
      ? options.id.trim()
      : accountIdOf(provider, session)
    vault.accounts[id] = mergeSavedSession(vault.accounts[id], session)
    vault.generations[id] = randomUUID()
    if (activate || !vault.activeId || !vault.accounts[vault.activeId]) vault.activeId = id
    store[provider] = vault
    await writeStore(store, file)
    return storedAccount(vault, id)
  })
}

export async function switchAccount(provider: string, id: string, path?: string): Promise<void> {
  if (typeof id !== 'string' || !id.trim()) throw new Error(`${provider} account id is required`)
  const file = path ?? authFilePath()
  return serialize(file, async () => {
    const store = await loadStore(file)
    const vault = asVault(provider, store[provider])
    const key = id.trim()
    if (!vault.accounts[key]) throw new Error(`${provider} account ${key} is not signed in`)
    vault.activeId = key
    store[provider] = vault
    await writeStore(store, file)
  })
}

export async function deleteSession(provider: string, path?: string, id?: string, source?: StoredAccount): Promise<boolean> {
  const file = path ?? authFilePath()
  return serialize(file, async () => {
    const store = await loadStore(file)
    const vault = asVault(provider, store[provider])
    const target = source ? matchingAccount(vault, source)?.id
      : (typeof id === 'string' && id.trim() ? id.trim() : vault.activeId)
    if (!target || !Object.hasOwn(vault.accounts, target)) return false
    delete vault.accounts[target]
    delete vault.generations[target]
    if (vault.activeId === target) {
      vault.activeId = Object.keys(vault.accounts)[0]
    }
    if (!vault.activeId) delete store[provider]
    else store[provider] = vault
    await writeStore(store, file)
    return true
  })
}

export function publicSession(provider: string, session: StoredSession | undefined): Record<string, unknown> | undefined {
  if (session === undefined) return undefined
  const planType = session.planType
  const planLabel = formatPlanLabel(planType, provider)
  if (provider === 'codex') {
    return {
      account: session.emailAddress ?? session.accountId,
      planType,
      planLabel,
      expiresAt: session.expiresAt,
    }
  }
  if (provider === 'chatgpt') {
    // No client id, subject, scopes or tokens: only what the card shows.
    return {
      account: session.emailAddress,
      planType,
      planLabel,
      expiresAt: session.expiresAt,
    }
  }
  if (provider === 'glm') {
    return {
      account: displayGlmAccount(session),
      planType,
      planLabel,
      region: session.region === 'bigmodel' ? 'bigmodel' : 'zai',
      expiresAt: session.expiresAt,
    }
  }
  if (provider === 'kiro') {
    return {
      account: session.account,
      planType,
      planLabel,
      method: session.authMethod,
      methodLabel: kiroMethodLabel(session),
      expiresAt: session.expiresAt,
    }
  }
  if (provider === 'antigravity') {
    return {
      account: session.account,
      planType,
      planLabel,
      expiresAt: session.expiresAt,
      needsValidation: session.needsValidation === true,
      validationUrl: typeof session.validationUrl === 'string' && session.validationUrl.trim()
        ? session.validationUrl.trim()
        : undefined,
    }
  }
  if (provider === 'cursor') {
    return {
      account: displayCursorAccount(session),
      planType,
      planLabel,
      method: session.source,
      methodLabel: session.source === 'cli_keychain'
        ? 'CLI'
        : session.source === 'ide_vscdb'
          ? 'IDE'
          : session.source === 'env'
            ? 'env'
            : session.source === 'pkce'
              ? 'PKCE'
              : undefined,
      expiresAt: session.expiresAt,
    }
  }
  if (provider === 'ollama') {
    return {
      account: session.account,
      planType,
      planLabel,
      method: session.source,
      methodLabel: ollamaSourceLabel(session.source),
      expiresAt: session.expiresAt,
    }
  }
  if (provider === 'kimi') {
    return {
      account: session.account,
      planType,
      planLabel,
      method: session.source,
      methodLabel: kimiSourceLabel(session.source),
      expiresAt: session.expiresAt,
    }
  }
  if (provider === 'command-code') {
    return {
      account: pickCommandCodeHumanAccount(session.userName, session.account, session.email)
        ?? session.account,
      planType,
      planLabel,
      method: session.source,
      methodLabel: commandCodeSourceLabel(session.source),
      expiresAt: session.expiresAt,
    }
  }
  if (provider === 'copilot') {
    return {
      account: session.account,
      planType,
      planLabel,
      method: session.source,
      methodLabel: copilotSourceLabel(session.source),
      expiresAt: session.expiresAt,
    }
  }
  if (provider === 'devin') {
    return {
      account: pickDevinHumanAccount(session.account),
      planType,
      planLabel,
      method: session.source,
      methodLabel: devinSourceLabel(session.source),
      expiresAt: session.expiresAt,
    }
  }
  if (provider === 'cline') {
    return {
      account: session.account,
      planType,
      planLabel,
      method: session.source,
      methodLabel: clineSourceLabel(session.source),
      organizationName: session.organizationName,
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
