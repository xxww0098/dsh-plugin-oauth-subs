/**
 * Per-installation Sign in with ChatGPT state, beside auth.json:
 *
 * - `hostId` — the stable, opaque `ext_agent_host_id` (`urn:uuid:<v4>`),
 *   chosen once before the first sign-in and reused for every later one.
 * - `registrations` — issued client id → verified account (subject, email,
 *   vault key). Kept after sign-out or a dead refresh token so the next
 *   sign-in reauthorizes the same registration instead of registering a new
 *   client. Holds no token.
 */

import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { readPrivateText, writePrivateText } from '../../utils/private-text.js'

const FILE = 'chatgpt.json'
const HOST_ID = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const chains = new Map<string, Promise<any>>()

function fileOf(authPath) {
  return join(dirname(authPath), FILE)
}

async function readState(file) {
  const text = await readPrivateText(file, 'chatgpt state')
  if (text === undefined) return { registrations: {} }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`chatgpt state at ${file} is not valid JSON; fix or delete it`)
  }
  const registrations = parsed?.registrations && typeof parsed.registrations === 'object' && !Array.isArray(parsed.registrations)
    ? parsed.registrations
    : {}
  return {
    ...(typeof parsed?.hostId === 'string' && HOST_ID.test(parsed.hostId) ? { hostId: parsed.hostId } : {}),
    registrations,
  }
}

function serialize<T>(file, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(file) ?? Promise.resolve()
  const next = previous.then(task, task)
  const settled = next.catch(() => undefined)
  chains.set(file, settled)
  settled.then(() => { if (chains.get(file) === settled) chains.delete(file) })
  return next
}

export function isChatgptHostId(value) {
  return typeof value === 'string' && HOST_ID.test(value)
}

/** The persisted host id; minted (UUIDv4, `urn:uuid:`) and saved on first use. */
export function ensureChatgptHostId(authPath) {
  const file = fileOf(authPath)
  return serialize(file, async () => {
    const state = await readState(file)
    if (state.hostId) return state.hostId
    const hostId = `urn:uuid:${randomUUID()}`
    await writePrivateText(file, `${JSON.stringify({ ...state, hostId }, null, 2)}\n`)
    return hostId
  })
}

export async function chatgptRegistrations(authPath) {
  const state = await readState(fileOf(authPath))
  return Object.entries(state.registrations)
    .filter(([clientId, row]: any) => clientId && row && typeof row === 'object')
    .map(([clientId, row]: any) => ({ clientId, subject: row.subject, email: row.email, accountKey: row.accountKey }))
}

export async function chatgptRegistration(authPath, clientId) {
  return (await chatgptRegistrations(authPath)).find((row) => row.clientId === clientId)
}

export function rememberChatgptRegistration(authPath, { clientId, subject, email, accountKey }) {
  const file = fileOf(authPath)
  return serialize(file, async () => {
    const state = await readState(file)
    state.registrations[clientId] = {
      subject,
      ...(email ? { email } : {}),
      ...(accountKey ? { accountKey } : {}),
    }
    await writePrivateText(file, `${JSON.stringify(state, null, 2)}\n`)
  })
}
