/**
 * Quota across stored accounts: live-session resolution (stale imported
 * logins carry their reason), per-account quota hydration with the identity
 * write-backs it triggers, the Settings refresh RPC, and reset-card spending.
 */

import { accountIdOf, getStoredSession, listStoredSessions, PROVIDER_IDS, publicSession } from './store.js'
import { cursorCatalogModels } from './cursor/catalog.js'
import { ollamaCatalogModels } from '../apikey/ollama/catalog.js'
import { kiroCatalogModels, resetKiroCatalogCache } from './kiro/catalog.js'
import { kimiCatalogModels } from './kimi/catalog.js'
import { copilotCatalogModels } from './copilot/catalog.js'
import { devinCatalogModels } from './devin/catalog.js'
import { clineCatalogModels } from './cline/catalog.js'
import { ImportedLoginStale } from './tokens.js'
import { QUOTA_USED_TTL_MS } from './quota.js'
import { rememberCommandCodeIdentity } from '../apikey/command-code/accounts.js'
import { discoverOllama, rememberOllamaIdentity } from '../apikey/ollama/accounts.js'
import { probeAntigravity, rememberAntigravityPlan } from './antigravity/accounts.js'
import { discoverCline, rememberClineIdentity } from './cline/accounts.js'
import { discoverChatgpt } from './chatgpt/accounts.js'
import { chatgptCatalogModels } from './chatgpt/catalog.js'
import type { AuthController } from './controller.js'
import { discoverCopilot, rememberCopilotIdentity } from './copilot/accounts.js'
import { discoverCursor, rememberCursorPlan } from './cursor/accounts.js'
import { discoverDevin, rememberDevinIdentity } from './devin/accounts.js'
import { discoverKimi, rememberKimiIdentity } from './kimi/accounts.js'
import { discoverKiro, rememberKiroProfile } from './kiro/accounts.js'

export async function liveAccounts(ctl: AuthController, provider) {
  const rows = await listStoredSessions(provider, ctl.authPath)
  const live = await Promise.all(rows.map(async (row) => {
    try {
      return await ctl.tokens[provider].account(row.id)
    } catch (error) {
      // A transient refresh failure can still use the stored access token.
      // Permanent failures and logout remove the row instead of reviving it.
      const stored = await getStoredSession(provider, row.id, ctl.authPath)
      // An imported login whose CLI store also expired: the stored token is
      // dead too, so carry the actionable reason instead of letting the quota
      // read hit upstream and surface the vendor's 401 text.
      if (stored && error instanceof ImportedLoginStale && !(stored.session?.expiresAt > Date.now())) {
        return { ...stored, stale: error.message }
      }
      return stored
    }
  }))
  return live.filter(Boolean)
}

export async function ensureAccountQuota(ctl: AuthController, provider, revalidateQuota = false) {
  const rows = await liveAccounts(ctl, provider)
  if (rows.length === 0) {
    ctl.quota.clear(provider)
    return []
  }
  await Promise.all(rows.map(async (row) => {
    if (row.stale) {
      ctl.quota.fail(provider, row.id, row.stale)
      return
    }
    // An entry revalidation only tightens the freshness floor: readings
    // younger than QUOTA_USED_TTL_MS still serve, everything older is
    // re-read behind the cached answer (never blocking the snapshot).
    const quota = await ctl.quota.ensure(provider, row.id, row.session, revalidateQuota ? QUOTA_USED_TTL_MS : undefined)
    if (provider === 'kiro') await rememberKiroProfile(ctl, row, quota)
    if (provider === 'antigravity') await rememberAntigravityPlan(ctl, row, quota)
    if (provider === 'cursor') await rememberCursorPlan(ctl, row, quota)
    if (provider === 'ollama') await rememberOllamaIdentity(ctl, row, quota)
    if (provider === 'kimi') await rememberKimiIdentity(ctl, row, quota)
    if (provider === 'devin') await rememberDevinIdentity(ctl, row, quota)
    if (provider === 'cline') await rememberClineIdentity(ctl, row, quota)
    if (provider === 'command-code') await rememberCommandCodeIdentity(ctl, row, quota)
  }))
  return rows
}

export async function accountsWithQuota(ctl: AuthController, provider) {
  const rows = await listStoredSessions(provider, ctl.authPath)
  return rows
    .map((row) => ({
      id: row.id,
      active: row.active,
      ...publicSession(provider, row.session),
      quota: ctl.quota.peek(provider, row.id),
    }))
    .sort((left, right) => Number(right.active) - Number(left.active) || left.id.localeCompare(right.id))
}

export async function refreshQuota(ctl: AuthController, provider, accountId?) {
  if (provider === 'opencode-go') return ctl.refreshOpencodeGoQuota(accountId)
  if (PROVIDER_IDS.includes(provider)) {
    const rows = await liveAccounts(ctl, provider)
    const targets = accountId
      ? rows.filter((row) => row.id === accountId)
      : rows
    if (accountId && targets.length === 0) throw new Error(`${provider} account ${accountId} is not signed in`)
    if (targets.length === 0) return ctl.quota.peek(provider)
    await Promise.all(targets.map((row) => row.stale
      ? ctl.quota.fail(provider, row.id, row.stale)
      : ctl.quota.refresh(provider, row.id, row.session)))
    if (provider === 'cursor') {
      await Promise.all(targets.map((row) => rememberCursorPlan(ctl, row, ctl.quota.peek(provider, row.id))))
    }
    if (provider === 'ollama') {
      await Promise.all(targets.map((row) => rememberOllamaIdentity(ctl, row, ctl.quota.peek(provider, row.id))))
    }
    if (provider === 'antigravity') {
      await Promise.all(targets.map((row) => probeAntigravity(ctl, row)))
    }
    if (provider === 'cursor') {
      const before = cursorCatalogModels().map((model) => model.id).join('\0')
      await Promise.all(targets.map((row) => discoverCursor(ctl, row.session)))
      if (ctl.settings && cursorCatalogModels().map((model) => model.id).join('\0') !== before) {
        await ctl.sync().catch(() => undefined)
      }
    }
    if (provider === 'ollama') {
      const before = ollamaCatalogModels().map((model) => model.id).join('\0')
      await Promise.all(targets.map((row) => discoverOllama(ctl, row.session)))
      if (ctl.settings && ollamaCatalogModels().map((model) => model.id).join('\0') !== before) {
        await ctl.sync().catch(() => undefined)
      }
    }
    if (provider === 'kiro') {
      const before = kiroCatalogModels().map((model) => model.id).join('\0')
      // A manual refresh re-asks: the list follows the egress region, and a
      // system VPN change is invisible to the token + proxy cache key.
      resetKiroCatalogCache()
      await Promise.all(targets.map((row) => discoverKiro(ctl, row.session)))
      if (ctl.settings && kiroCatalogModels().map((model) => model.id).join('\0') !== before) {
        await ctl.sync().catch(() => undefined)
      }
    }
    if (provider === 'kimi') {
      await Promise.all(targets.map((row) => rememberKimiIdentity(ctl, row, ctl.quota.peek(provider, row.id))))
      const before = kimiCatalogModels().map((model) => model.id).join('\0')
      await Promise.all(targets.map((row) => discoverKimi(ctl, row.session)))
      if (ctl.settings && kimiCatalogModels().map((model) => model.id).join('\0') !== before) {
        await ctl.sync().catch(() => undefined)
      }
    }
    if (provider === 'copilot') {
      await Promise.all(targets.map((row) => rememberCopilotIdentity(ctl, row, ctl.quota.peek(provider, row.id))))
      const before = copilotCatalogModels().map((model) => model.id).join('\0')
      await Promise.all(targets.map((row) => discoverCopilot(ctl, row.session)))
      if (ctl.settings && copilotCatalogModels().map((model) => model.id).join('\0') !== before) {
        await ctl.sync().catch(() => undefined)
      }
    }
    if (provider === 'devin') {
      await Promise.all(targets.map((row) => rememberDevinIdentity(ctl, row, ctl.quota.peek(provider, row.id))))
      const before = devinCatalogModels().map((model) => model.id).join('\0')
      await Promise.all(targets.map((row) => discoverDevin(ctl, row.session)))
      if (ctl.settings && devinCatalogModels().map((model) => model.id).join('\0') !== before) {
        await ctl.sync().catch(() => undefined)
      }
    }
    if (provider === 'cline') {
      await Promise.all(targets.map((row) => rememberClineIdentity(ctl, row, ctl.quota.peek(provider, row.id))))
      const before = clineCatalogModels().map((model) => model.id).join('\0')
      await Promise.all(targets.map((row) => discoverCline(ctl, row.session)))
      if (ctl.settings && clineCatalogModels().map((model) => model.id).join('\0') !== before) {
        await ctl.sync().catch(() => undefined)
      }
    }
    // No quota endpoint: a refresh re-reads the account's own model list.
    if (provider === 'chatgpt') {
      const before = chatgptCatalogModels().map((model) => model.id).join('\0')
      await Promise.all(targets.map((row) => discoverChatgpt(ctl, row.session)))
      if (ctl.settings && chatgptCatalogModels().map((model) => model.id).join('\0') !== before) {
        await ctl.sync().catch(() => undefined)
      }
    }
    // whoami rides the quota chain and promotes the opaque vault id
    if (provider === 'command-code') {
      await Promise.all(targets.map((row) => rememberCommandCodeIdentity(ctl, row, ctl.quota.peek(provider, row.id))))
    }
    const latest = provider === 'ollama' || provider === 'kimi' || provider === 'copilot' || provider === 'devin' || provider === 'cline' || provider === 'command-code' ? await liveAccounts(ctl, provider) : rows
    if (accountId) {
      const hit = latest.find((row) => row.id === accountId) ?? latest.find((row) => row.active)
      return ctl.quota.peek(provider, hit?.id ?? accountId)
    }
    const active = latest.find((row) => row.active)
    return ctl.quota.peek(provider, active?.id)
  }
  const all = await Promise.all(PROVIDER_IDS.map((family) => ctl.refreshQuota(family)))
  return Object.fromEntries(PROVIDER_IDS.map((family, index) => [family, all[index]]))
}

export async function consumeReset(ctl: AuthController, provider, accountId, creditId?) {
  if (provider === 'glm') {
    const live = await ctl.tokens.glm.session(accountId)
    return ctl.quota.consume('glm', accountIdOf('glm', live), live, creditId)
  }
  if (provider === 'grok') {
    const live = await ctl.tokens.grok.session(accountId)
    return ctl.quota.consume('grok', accountIdOf('grok', live), live, creditId)
  }
  if (provider !== 'codex') throw new Error('only ChatGPT Codex, Grok and GLM can reset quota')
  const live = await ctl.tokens.codex.session(accountId)
  return ctl.quota.consume('codex', accountIdOf('codex', live), live)
}
