/**
 * Family registry: the one table keyed by family id that the central
 * per-family dispatchers look up instead of growing `family === '<id>'`
 * chains — today the inbound cache rewrite (proxy-body.ts), the quota
 * fetch (quota.ts QuotaStore), the account-quota hydration hooks
 * (account-quota.ts), the login flow / paste completion / pasted-key
 * dispatch (login.ts), the passthrough Completions usage rewrite
 * (passthrough.ts), and the model-catalog bag every llm-pi-ai projection
 * consumes (familyCatalogInputs below; models.ts / harness-sync.ts).
 *
 * Contract (docs/rules.md):
 * - A row holds ONLY references to functions defined in the family folder
 *   (`src/oauth/<id>/`, `src/apikey/<id>/`) plus thin composition glue that
 *   mirrors what the old dispatch branch did. Never copy or re-implement a
 *   family function here; new vendor behavior belongs in that family's
 *   folder and a row references it. This file must not accrete vendor logic.
 * - Cache and session identity stay family-owned: every cache rewrite and
 *   session id below is computed by the family's own cache.ts, families
 *   never share cache helpers or ids, and nothing here invents ids (no
 *   Date.now()/random in a session-id position).
 * - `proxy.ts` keeps its explicit per-family route blocks (sanctioned
 *   style); every other central dispatcher imports a row from this table.
 */

import type { AuthController } from './controller.js'
import { codexRoutingHint } from './codex/index.js'
import { applyCodexCache } from './codex/cache.js'
import { normalizeCodexResponsesBody } from './codex/request.js'
import { fetchCodexQuota } from './codex/quota.js'
import { completeCodexPaste, loginCodex } from './codex/accounts.js'
import { importCodexAuth } from './codex/import.js'
import { applyGrokCache } from './grok/cache.js'
import { normalizeGrokResponsesBody } from './grok/request.js'
import { fetchGrokQuota } from './grok/quota.js'
import { completeGrokPaste, loginGrok } from './grok/accounts.js'
import { importGrokAuth } from './grok/import.js'
import { applyChatgptCache } from './chatgpt/cache.js'
import { normalizeChatgptResponsesBody } from './chatgpt/request.js'
import { chatgptQuota } from './chatgpt/index.js'
import { chatgptCatalogModels } from './chatgpt/catalog.js'
import { discoverChatgpt, loginChatgpt } from './chatgpt/accounts.js'
import { glmCacheSessionId } from './glm/cache.js'
import { mapGlmChatUsage, normalizeGlmAnthropicBody, normalizeGlmChatBody } from './glm/request.js'
import { fetchGlmQuota } from './glm/quota.js'
import { loginGlm, useGlmKey } from './glm/accounts.js'
import { importGlmAuth } from './glm/import.js'
import { kiroConversationId } from './kiro/cache.js'
import { fetchKiroQuota } from './kiro/quota.js'
import { kiroCatalogModels, resetKiroCatalogCache } from './kiro/catalog.js'
import {
  completeKiroPaste,
  discoverKiro,
  loginKiro,
  rememberKiroProfile,
  resumeKiroIdcPaste,
  useKiroKey,
} from './kiro/accounts.js'
import { importKiroAuth } from './kiro/import.js'
import { antigravitySessionIdOf } from './antigravity/cache.js'
import { fetchAntigravityQuota } from './antigravity/quota.js'
import {
  completeAntigravityPaste,
  loginAntigravity,
  probeAntigravity,
  rememberAntigravityPlan,
} from './antigravity/accounts.js'
import { importAntigravityAuth } from './antigravity/import.js'
import { applyCursorCache } from './cursor/cache.js'
import { fetchCursorQuota } from './cursor/quota.js'
import { cursorCatalogModels } from './cursor/catalog.js'
import { discoverCursor, importCursor, loginCursor, rememberCursorPlan } from './cursor/accounts.js'
import { applyOllamaCache } from '../apikey/ollama/cache.js'
import { fetchOllamaQuota } from '../apikey/ollama/quota.js'
import { ollamaCatalogModels } from '../apikey/ollama/catalog.js'
import {
  discoverOllama,
  importOllama,
  loginOllama,
  rememberOllamaIdentity,
  useOllamaKey,
} from '../apikey/ollama/accounts.js'
import { applyKimiCache } from './kimi/cache.js'
import { applyKimiStreamUsage, applyKimiThinking, mapKimiUsage } from './kimi/request.js'
import { fetchKimiQuota } from './kimi/quota.js'
import { kimiCatalogModels } from './kimi/catalog.js'
import { discoverKimi, importKimi, loginKimi, rememberKimiIdentity, useKimiKey } from './kimi/accounts.js'
import { applyCopilotCache, copilotHasVision, copilotInitiatorOf } from './copilot/cache.js'
import { applyCopilotStreamUsage, applyCopilotThinking, mapCopilotUsage } from './copilot/request.js'
import { fetchCopilotQuota } from './copilot/quota.js'
import { copilotCatalogModels } from './copilot/catalog.js'
import {
  discoverCopilot,
  importCopilot,
  loginCopilot,
  rememberCopilotIdentity,
  useCopilotKey,
} from './copilot/accounts.js'
import { applyDevinCache } from './devin/cache.js'
import { fetchDevinQuota } from './devin/quota.js'
import { devinCatalogModels } from './devin/catalog.js'
import {
  completeDevinPaste,
  discoverDevin,
  finishDevinSession,
  importDevin,
  loginDevin,
  rememberDevinIdentity,
  useDevinKey,
} from './devin/accounts.js'
import { applyClineCache } from './cline/cache.js'
import { applyClineMaxCompletionTokens, applyClineStreamUsage, applyClineThinking, mapClineUsage, unwrapClineEnvelope } from './cline/request.js'
import { fetchClineQuota } from './cline/quota.js'
import { clineCatalogModels } from './cline/catalog.js'
import { discoverCline, importCline, loginCline, rememberClineIdentity } from './cline/accounts.js'
import { applyCommandCodeCache } from '../apikey/command-code/cache.js'
import { commandCodeCatalogModels } from '../apikey/command-code/catalog.js'
import { fetchCommandCodeQuota } from '../apikey/command-code/quota.js'
import {
  importCommandCode,
  loginCommandCode,
  rememberCommandCodeIdentity,
  useCommandCodeKey,
} from '../apikey/command-code/accounts.js'
import { applyFastMode } from '../utils/fast-mode.js'

export type FamilyId =
  | 'codex' | 'chatgpt' | 'grok' | 'glm' | 'kiro' | 'antigravity' | 'cursor'
  | 'ollama' | 'kimi' | 'copilot' | 'devin' | 'cline' | 'command-code'

/** One family's inbound cache rewrite; extra keys ride along to the hop. */
export interface FamilyCacheRewrite {
  payload: any
  cacheSessionId?: string
  [extra: string]: unknown
}

/** refreshQuota: re-read this family's own model list, re-sync when it changed. */
export interface FamilyCatalogDiscovery {
  /** Current catalog rows; ids compared before/after discovery. */
  models: () => { id: string }[]
  /** Kiro only: the catalog follows the egress region, so a manual refresh re-asks. */
  reset?: () => void
  /** Catalog discovery for one stored account's session. */
  run: (ctl: AuthController, session: any) => unknown
}

/** Per-account quota side effects driven by src/oauth/account-quota.ts. */
export interface FamilyQuotaHooks {
  /** ensureAccountQuota: identity/plan write-back after one row's reading hydrated. */
  afterEnsure?: (ctl: AuthController, row: any, quota: any) => unknown
  /** refreshQuota: per-row identity write-back (quota.peek of that row). */
  remember?: (ctl: AuthController, row: any, quota: any) => unknown
  /** refreshQuota: per-row probe that needs no quota reading (Antigravity validation). */
  probe?: (ctl: AuthController, row: any) => unknown
  /** refreshQuota: re-read the account's own model list; see FamilyCatalogDiscovery. */
  discover?: FamilyCatalogDiscovery
  /** refreshQuota: the hooks above may rewrite stored rows — re-list them before peeking. */
  relistAccountsAfterRefresh?: boolean
}

/**
 * Per-family passthrough forward hooks driven by src/oauth/passthrough.ts:
 * Completions usage rewriting on the forwarded answer. The mappers and the
 * envelope unwrap stay in each family's own request.ts; a row only
 * references them (same contract as every other field on the row).
 */
export interface FamilyForwardHooks {
  /**
   * Resolve this request's Completions usage mapper; undefined = forward
   * the usage object untouched. GLM maps its chat wire only — Anthropic
   * usage is native already.
   */
  completionsUsage?: (wire?: string) => ((usage: any) => any) | undefined
  /** Unwrap a non-streaming Completions body before usage mapping (Cline `{success, data}`). */
  unwrapCompletionsBody?: (parsed: any) => any
}

/**
 * Per-family login hooks driven by src/oauth/login.ts: the flow start
 * (login), the loopback-paste completion (completePkce), and pasted keys
 * (useKey). The bodies live in each family's own accounts.ts; a row only
 * references them (same contract as every other field on the row).
 */
export interface FamilyLoginHooks {
  /** login(): start this family's browser / device / CLI flow. */
  attempt: (ctl: AuthController, payload: any) => unknown
  /** completePkce(): this family's loopback-callback completion, when it has one. */
  completePaste?: FamilyPasteHooks
  /** useKey(): accept a pasted key / CLI credential, when this family takes one. */
  useKey?: (ctl: AuthController, key: any, payload: any) => unknown
  /** importLocal(): read this family's local CLI/IDE credential store. */
  importLocal?: (ctl: AuthController) => Promise<any>
}

/** completePkce hooks: the code exchange plus the family's save-time side effects. */
export interface FamilyPasteHooks {
  /** Exchange the loopback code for a session (family index.ts owns the endpoint). */
  exchange: (ctl: AuthController, code: any, attempt: any) => any
  /**
   * Kiro only: the portal can pivot an organization login to the IdC device
   * flow (`login_option=awsidc`, issue #167); a true return settles the paste
   * through that device attempt instead of a code exchange.
   */
  resume?: (ctl: AuthController, code: any, claim: any) => boolean
  /** Finalize the session right before it is saved (Devin resolves identity first). */
  finish?: (ctl: AuthController, session: any) => any
  /** Awaited post-save catalog discovery, before the change notification. */
  discover?: (ctl: AuthController, session: any) => unknown
  /** Fire-and-forget validation after the quota refresh starts (Antigravity). */
  probe?: (ctl: AuthController, saved: any) => unknown
}

/** One family's row in the registry — references only, never implementations. */
export interface OAuthFamily {
  id: FamilyId
  /** proxy-body: rewrite the inbound body before the hop (family cache.ts owns it). */
  applyCache: (payload: any, extra: { wire?: string }) => FamilyCacheRewrite
  /** QuotaStore: one account's quota read (family quota.ts owns endpoints/parsing). */
  fetchQuota: (session: any, fetchFn: any) => any
  /** passthrough: Completions usage rewriting on forwarded answers, when this family maps any. */
  forward?: FamilyForwardHooks
  /** login.ts: flow start, paste completion, and pasted keys (family accounts.ts owns them). */
  login: FamilyLoginHooks
  /** account-quota: per-account hydration / refresh side effects, when this family has them. */
  quota?: FamilyQuotaHooks
  /**
   * models.ts buildProviders/catalogProviders: this family's catalog rows,
   * referencing its own catalog.ts export (never a copy). Families without a
   * slot here project their static MODEL rows directly inside models.ts
   * (codex, grok, antigravity). GLM deliberately has no sync accessor: its
   * rows are read behind the glm session load (controller `#glmModels`) and
   * ride into familyCatalogInputs pre-resolved.
   */
  catalogModels?: () => readonly { id: string }[]
}

const codexFamily: OAuthFamily = {
  id: 'codex',
  applyCache(payload) {
    // Codex Fast is Codex Priority: peel `-fast` into service_tier + routing hint.
    const { payload: next, cacheSessionId } = applyCodexCache(normalizeCodexResponsesBody(applyFastMode(payload)))
    return {
      payload: next,
      cacheSessionId,
      routingHint: codexRoutingHint(typeof next.model === 'string' ? next.model : '', next.service_tier),
    }
  },
  fetchQuota: fetchCodexQuota,
  login: {
    attempt: loginCodex,
    completePaste: { exchange: completeCodexPaste },
    importLocal: () => importCodexAuth() as any,
  },
}

const chatgptFamily: OAuthFamily = {
  id: 'chatgpt',
  applyCache(payload) {
    // No Fast rows on this route: a stray `-fast` id is not peeled into a
    // service tier (normalize drops service_tier; the public API has no Priority hint).
    const { payload: next, cacheSessionId } = applyChatgptCache(normalizeChatgptResponsesBody(payload))
    return { payload: next, cacheSessionId }
  },
  // No quota endpoint: the plan is read off the session's own token claims.
  fetchQuota: (session) => chatgptQuota(session),
  login: { attempt: loginChatgpt },
  catalogModels: chatgptCatalogModels,
  quota: {
    discover: {
      models: chatgptCatalogModels,
      run: discoverChatgpt,
    },
  },
}

const grokFamily: OAuthFamily = {
  id: 'grok',
  applyCache(payload) {
    // Grok Fast is a real backend model id (`grok-4.7-build-fast`), not Codex
    // Priority: the shared peel would rewrite it to a nonexistent model.
    // normalizeGrokResponsesBody owns model hygiene + service_tier here.
    const { payload: next, cacheSessionId } = applyGrokCache(normalizeGrokResponsesBody(payload))
    return {
      payload: next,
      cacheSessionId,
      grokModel: typeof next.model === 'string' ? next.model : undefined,
    }
  },
  fetchQuota: fetchGrokQuota,
  login: {
    attempt: loginGrok,
    completePaste: { exchange: completeGrokPaste },
    importLocal: () => importGrokAuth() as any,
  },
}

const glmFamily: OAuthFamily = {
  id: 'glm',
  applyCache(payload, { wire }) {
    const fast = applyFastMode(payload)
    const next = wire === 'anthropic' ? normalizeGlmAnthropicBody(fast) : normalizeGlmChatBody(fast)
    return {
      payload: next,
      cacheSessionId: glmCacheSessionId(next.user)
        || glmCacheSessionId(next.metadata?.user_id)
        || glmCacheSessionId(next.session_id),
    }
  },
  fetchQuota: fetchGlmQuota,
  login: { attempt: loginGlm, useKey: useGlmKey, importLocal: () => importGlmAuth() },
  forward: {
    // Chat wire only: Anthropic usage is native and forwards untouched.
    completionsUsage: (wire) => (wire === 'anthropic' ? undefined : mapGlmChatUsage),
  },
}

const kiroFamily: OAuthFamily = {
  id: 'kiro',
  applyCache(payload) {
    const next = { ...applyFastMode(payload) }
    delete next.prompt_cache_retention
    delete next.prompt_cache_options
    return { payload: next, cacheSessionId: kiroConversationId(next) }
  },
  fetchQuota: fetchKiroQuota,
  login: {
    attempt: loginKiro,
    completePaste: {
      resume: resumeKiroIdcPaste,
      exchange: completeKiroPaste,
    },
    useKey: useKiroKey,
    importLocal: () => importKiroAuth(),
  },
  catalogModels: kiroCatalogModels,
  quota: {
    afterEnsure: rememberKiroProfile,
    discover: {
      models: kiroCatalogModels,
      // A manual refresh re-asks: the list follows the egress region, and a
      // system VPN change is invisible to the token + proxy cache key.
      reset: resetKiroCatalogCache,
      run: discoverKiro,
    },
  },
}

const antigravityFamily: OAuthFamily = {
  id: 'antigravity',
  applyCache(payload) {
    const next = { ...applyFastMode(payload) }
    delete next.prompt_cache_retention
    delete next.prompt_cache_options
    return { payload: next, cacheSessionId: antigravitySessionIdOf(next) }
  },
  fetchQuota: fetchAntigravityQuota,
  login: {
    attempt: loginAntigravity,
    completePaste: {
      exchange: completeAntigravityPaste,
      probe: probeAntigravity,
    },
    importLocal: (ctl) => importAntigravityAuth({ fetchFn: ctl.fetchFn }),
  },
  quota: {
    afterEnsure: rememberAntigravityPlan,
    probe: probeAntigravity,
  },
}

const cursorFamily: OAuthFamily = {
  id: 'cursor',
  applyCache(payload) {
    // Cursor Fast is RequestedModel `{ id: 'fast' }`, not Codex Priority.
    // Keep the picker `-fast` suffix for openaiToCursor; do not peel here.
    const { payload: next, cacheSessionId } = applyCursorCache(payload)
    return { payload: next, cacheSessionId }
  },
  fetchQuota: fetchCursorQuota,
  login: { attempt: loginCursor, importLocal: importCursor },
  catalogModels: cursorCatalogModels,
  quota: {
    afterEnsure: rememberCursorPlan,
    remember: rememberCursorPlan,
    discover: {
      models: cursorCatalogModels,
      run: discoverCursor,
    },
  },
}

const ollamaFamily: OAuthFamily = {
  id: 'ollama',
  applyCache(payload) {
    const { payload: next, cacheSessionId } = applyOllamaCache(applyFastMode(payload))
    return { payload: next, cacheSessionId }
  },
  fetchQuota: fetchOllamaQuota,
  login: { attempt: loginOllama, useKey: useOllamaKey, importLocal: importOllama },
  catalogModels: ollamaCatalogModels,
  quota: {
    afterEnsure: rememberOllamaIdentity,
    remember: rememberOllamaIdentity,
    discover: {
      models: ollamaCatalogModels,
      run: discoverOllama,
    },
    relistAccountsAfterRefresh: true,
  },
}

const kimiFamily: OAuthFamily = {
  id: 'kimi',
  applyCache(payload) {
    const { payload: cached, cacheSessionId } = applyKimiCache(applyFastMode(payload))
    return { payload: applyKimiStreamUsage(applyKimiThinking(cached)), cacheSessionId }
  },
  fetchQuota: fetchKimiQuota,
  login: { attempt: loginKimi, useKey: useKimiKey, importLocal: importKimi },
  forward: { completionsUsage: () => mapKimiUsage },
  catalogModels: kimiCatalogModels,
  quota: {
    afterEnsure: rememberKimiIdentity,
    remember: rememberKimiIdentity,
    discover: {
      models: kimiCatalogModels,
      run: discoverKimi,
    },
    relistAccountsAfterRefresh: true,
  },
}

const copilotFamily: OAuthFamily = {
  id: 'copilot',
  applyCache(payload) {
    const { payload: cached, cacheSessionId } = applyCopilotCache(applyFastMode(payload))
    const next = applyCopilotStreamUsage(applyCopilotThinking(cached))
    return {
      payload: next,
      cacheSessionId,
      copilotVision: copilotHasVision(next.messages),
      copilotInitiator: copilotInitiatorOf(next.messages),
    }
  },
  fetchQuota: fetchCopilotQuota,
  login: { attempt: loginCopilot, useKey: useCopilotKey, importLocal: importCopilot },
  forward: { completionsUsage: () => mapCopilotUsage },
  catalogModels: copilotCatalogModels,
  quota: {
    // No afterEnsure hook: identity write-back rides the manual refresh only.
    remember: rememberCopilotIdentity,
    discover: {
      models: copilotCatalogModels,
      run: discoverCopilot,
    },
    relistAccountsAfterRefresh: true,
  },
}

const devinFamily: OAuthFamily = {
  id: 'devin',
  applyCache(payload) {
    // Devin `-fast` is a real backend variant uid, not Codex Priority — the
    // picker id must reach openaiToDevin unpeeled, same as Cursor.
    const { payload: next, cacheSessionId } = applyDevinCache(payload)
    return { payload: next, cacheSessionId }
  },
  fetchQuota: fetchDevinQuota,
  login: {
    attempt: loginDevin,
    completePaste: {
      exchange: completeDevinPaste,
      finish: finishDevinSession,
      discover: discoverDevin,
    },
    useKey: useDevinKey,
    importLocal: importDevin,
  },
  catalogModels: devinCatalogModels,
  quota: {
    afterEnsure: rememberDevinIdentity,
    remember: rememberDevinIdentity,
    discover: {
      models: devinCatalogModels,
      run: discoverDevin,
    },
    relistAccountsAfterRefresh: true,
  },
}

const clineFamily: OAuthFamily = {
  id: 'cline',
  applyCache(payload) {
    // OpenRouter-backed Completions: cache affinity rides the X-Task-ID
    // header (clineCacheHeaders), not a body field. The body edits are the
    // CLI's own three (max_completion_tokens rename, include_usage,
    // reasoning_effort passthrough) and nothing else.
    const { payload: cached, cacheSessionId } = applyClineCache(applyFastMode(payload))
    const next = applyClineStreamUsage(
      applyClineThinking(applyClineMaxCompletionTokens(cached)),
    )
    return { payload: next, cacheSessionId }
  },
  fetchQuota: fetchClineQuota,
  login: { attempt: loginCline, importLocal: importCline },
  forward: {
    completionsUsage: () => mapClineUsage,
    // A non-streaming completion arrives wrapped in `{success, data}`; a raw
    // passthrough would hand DSH an envelope with no `choices`.
    unwrapCompletionsBody: unwrapClineEnvelope,
  },
  catalogModels: clineCatalogModels,
  quota: {
    afterEnsure: rememberClineIdentity,
    remember: rememberClineIdentity,
    discover: {
      models: clineCatalogModels,
      run: discoverCline,
    },
    relistAccountsAfterRefresh: true,
  },
}

const commandCodeFamily: OAuthFamily = {
  id: 'command-code',
  applyCache(payload) {
    // threadId is the wire's top-level cache-affinity uuid (see cache.ts);
    // foreign DSH fields are stripped before openaiToCommandCode maps the
    // body onto /alpha/generate's JSONL protocol.
    const { payload: next, threadId } = applyCommandCodeCache(applyFastMode(payload))
    return { payload: next, cacheSessionId: threadId, threadId }
  },
  fetchQuota: fetchCommandCodeQuota,
  login: { attempt: loginCommandCode, useKey: useCommandCodeKey, importLocal: importCommandCode },
  catalogModels: commandCodeCatalogModels,
  quota: {
    afterEnsure: rememberCommandCodeIdentity,
    // whoami rides the quota chain and promotes the opaque vault id.
    remember: rememberCommandCodeIdentity,
    relistAccountsAfterRefresh: true,
  },
}

const FAMILIES: readonly OAuthFamily[] = [
  codexFamily, chatgptFamily, grokFamily, glmFamily, kiroFamily, antigravityFamily,
  cursorFamily, ollamaFamily, kimiFamily, copilotFamily, devinFamily, clineFamily,
  commandCodeFamily,
]

/** The registry, keyed by family id (the ids of store.ts `PROVIDER_IDS`). */
export const OAUTH_FAMILIES: ReadonlyMap<string, OAuthFamily> = new Map(
  FAMILIES.map((family) => [family.id, family]),
)

/** Registry lookup; `undefined` means the id is not a known family. */
export function oauthFamily(id: string): OAuthFamily | undefined {
  return OAUTH_FAMILIES.get(id)
}

/** The buildProviders/catalogProviders slot name of one family id (`command-code` → `commandCodeModels`). */
function catalogInputKey(id: string) {
  return `${id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}Models`
}

/**
 * The model-list bag src/oauth/models.ts projects: one `<family>Models` slot
 * per registry row that has a catalog accessor, keyed by buildProviders' /
 * catalogProviders' own parameter names. Every consumer spreads this same
 * bag (controller `#catalogInputs`, harness-sync's syncHarnessModels), so a
 * family row added to the registry can no longer be missed at one call site
 * — the review P1-2/P2-6 漏传 class, where one site omitted commandCodeModels
 * and only the static-catalog fallback inside models.ts hid it.
 *
 * GLM is the one async seat: the controller resolves its rows behind the glm
 * session load (`#glmModels`) and passes them in pre-resolved; they are never
 * read synchronously here. Left out, models.ts falls back to its static
 * GLM_MODELS — the behavior every syncHarnessModels caller without a session
 * (tests) already had.
 */
export function familyCatalogInputs({ glmModels }: { glmModels?: readonly any[] } = {}) {
  const inputs: Record<string, readonly any[]> = {}
  for (const family of OAUTH_FAMILIES.values()) {
    if (family.catalogModels === undefined) continue
    inputs[catalogInputKey(family.id)] = family.catalogModels()
  }
  return { ...inputs, ...(glmModels === undefined ? {} : { glmModels }) }
}
