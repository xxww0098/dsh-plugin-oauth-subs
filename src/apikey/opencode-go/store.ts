/**
 * OpenCode Go cookie + workspace vault at <dataDir>/opencode-go.json.
 *
 * Not auth.json: the OAuth store requires accessToken / refreshToken /
 * expiresAt. The cookie never leaves this file in the Settings snapshot.
 */

import { dirname } from 'node:path'
import { readPrivateText, writePrivateText } from '../../utils/private-text.js'
import {
  isOpencodeGoCookieMask,
  normalizeOpencodeGoWorkspaceId,
  parseOpencodeGoCookie,
  publicOpencodeGo,
} from './index.js'
import { fetchOpencodeGoQuota } from './quota.js'

export function opencodeGoFilePath(authPath) {
  return dirname(authPath) + '/opencode-go.json'
}

function emptyEntry() {
  return { cookieHeader: '', workspaceId: '' }
}

export class OpencodeGoStore {
  constructor({ path, fetchFn = fetch, ttlMs = 10_000 } = {}) {
    this.path = path
    this.fetchFn = fetchFn
    this.ttlMs = ttlMs
    this.entry = emptyEntry()
    this.quota = { status: 'idle' }
    this.inflight = undefined
    this.ready = this.#load()
  }

  async #load() {
    const text = await readPrivateText(this.path, 'opencode-go config').catch(() => undefined)
    if (!text) {
      this.entry = emptyEntry()
      return
    }
    try {
      const parsed = JSON.parse(text)
      const cookieHeader = typeof parsed?.cookieHeader === 'string'
        ? parseOpencodeGoCookie(parsed.cookieHeader) ?? ''
        : ''
      const workspaceId = normalizeOpencodeGoWorkspaceId(parsed?.workspaceId) ?? ''
      this.entry = { cookieHeader, workspaceId }
    } catch {
      this.entry = emptyEntry()
    }
  }

  async #persist() {
    const body = JSON.stringify({
      cookieHeader: this.entry.cookieHeader,
      workspaceId: this.entry.workspaceId,
    }, null, 2)
    await writePrivateText(this.path, body + '\n')
  }

  async snapshot({ refresh = false } = {}) {
    await this.ready
    const stale = Date.now() - (this.quota.updatedAt ?? 0) > this.ttlMs
    const shouldRefresh = refresh
      || (this.entry.cookieHeader
        && (this.quota.status === 'idle' || (this.quota.status === 'error' && stale)))
    if (shouldRefresh) await this.refreshQuota().catch(() => undefined)
    return publicOpencodeGo(this.entry, this.quota)
  }

  async save({ cookie, workspace } = {}) {
    await this.ready
    let cookieHeader = this.entry.cookieHeader
    if (cookie !== undefined) {
      const raw = String(cookie ?? '')
      if (isOpencodeGoCookieMask(raw)) {
        // masked value: keep the stored cookie
      } else if (!raw.trim()) {
        cookieHeader = ''
      } else {
        const parsed = parseOpencodeGoCookie(raw)
        if (!parsed) throw new Error('OpenCode Go cookie must be an auth token or Cookie header')
        cookieHeader = parsed
      }
    }
    let workspaceId = this.entry.workspaceId
    if (workspace !== undefined) {
      const raw = String(workspace ?? '').trim()
      if (!raw) workspaceId = ''
      else {
        const parsed = normalizeOpencodeGoWorkspaceId(raw)
        if (!parsed) throw new Error('OpenCode Go workspace must be wrk_... or an opencode.ai/workspace/wrk_... URL')
        workspaceId = parsed
      }
    }
    this.entry = { cookieHeader, workspaceId }
    await this.#persist()
    if (cookieHeader) await this.refreshQuota()
    else this.quota = { status: 'idle' }
    return publicOpencodeGo(this.entry, this.quota)
  }

  async clear(field) {
    await this.ready
    if (field === 'cookie') this.entry = { ...this.entry, cookieHeader: '' }
    else if (field === 'workspace') this.entry = { ...this.entry, workspaceId: '' }
    else this.entry = emptyEntry()
    await this.#persist()
    if (this.entry.cookieHeader) await this.refreshQuota()
    else this.quota = { status: 'idle' }
    return publicOpencodeGo(this.entry, this.quota)
  }

  async refreshQuota() {
    await this.ready
    if (this.inflight) return this.inflight
    if (!this.entry.cookieHeader) {
      this.quota = { status: 'idle' }
      return publicOpencodeGo(this.entry, this.quota)
    }
    const previous = this.quota
    this.quota = {
      ...previous,
      status: previous?.status === 'ready' ? 'ready' : 'loading',
      updatedAt: previous?.updatedAt ?? Date.now(),
      rows: previous?.rows ?? [],
    }
    const run = this.#loadQuota(previous).finally(() => {
      this.inflight = undefined
    })
    this.inflight = run
    return run
  }

  async #loadQuota(previous) {
    try {
      const parsed = await fetchOpencodeGoQuota(this.entry, { fetchFn: this.fetchFn })
      if (parsed.workspaceId && parsed.workspaceId !== this.entry.workspaceId) {
        this.entry = { ...this.entry, workspaceId: parsed.workspaceId }
        await this.#persist()
      }
      this.quota = {
        status: 'ready',
        planType: parsed.planType,
        updatedAt: Date.now(),
        rows: parsed.rows ?? [],
      }
    } catch (error) {
      this.quota = {
        status: 'error',
        updatedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
        rows: previous?.rows ?? [],
      }
    }
    return publicOpencodeGo(this.entry, this.quota)
  }
}
