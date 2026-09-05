/**
 * Auth controller behind the Settings page RPC.
 * Codex PKCE (+ paste callback + import), Grok device-code (primary) + PKCE fallback.
 */

import { dirname } from 'node:path'
import { OAuthFlowManager } from './flow.js'
import { DeviceFlowManager } from './grok/device-flow.js'
import { GlmCliFlowManager } from './glm/cli-flow.js'
import { KiroIdcFlowManager } from './kiro/idc-flow.js'
import { accountIdOf, deleteSession, getAccountSession, getSession, listStoredSessions, publicSession, replaceAccountId, saveSession, switchAccount } from './store.js'
import {
  codexFlow,
  exchangeCodexCode,
  isCodexPermanentRefreshError,
  refreshCodex,
} from './codex/index.js'
import {
  completeGrokDevice,
  grokDeviceSpec,
  grokFlow,
  exchangeGrokCode,
  isGrokPermanentRefreshError,
  refreshGrok,
} from './grok/index.js'
import {
  glmSession,
  isGlmPermanentRefreshError,
  normalizeGlmRegion,
  pickGlmHumanAccount,
  refreshGlm,
  resolveGlmIdentity,
} from './glm/index.js'
import {
  BUILDER_ID_START_URL,
  allocateKiroMachineId,
  canonicalizeKiroMethod,
  exchangeKiroSocialCode,
  isKiroPermanentRefreshError,
  kiroSession,
  kiroSocialFlow,
  refreshKiro,
  refreshKiroExternalIdp,
  refreshKiroSocial,
  validateKiroApiKey,
  validateKiroIdpEndpoint,
  validateKiroRefreshToken,
} from './kiro/index.js'
import { isKiroBatchImport, parseKiroImportText } from './kiro/import.js'
import {
  antigravityFlow,
  ANTIGRAVITY_PREEMPT_MS,
  applyAntigravityValidation,
  exchangeAntigravityCode,
  isAntigravityPermanentRefreshError,
  probeAntigravityValidation,
  refreshAntigravity,
} from './antigravity/index.js'
import { importAntigravityAuth, importCodexAuth, importGrokAuth, importGlmAuth, importKiroAuth } from './import-auth.js'
import { CursorPollFlowManager } from './cursor/pkce-flow.js'
import {
  cursorAccountFromToken,
  isCursorPermanentRefreshError,
  pickCursorHumanAccount,
  refreshCursor,
} from './cursor/index.js'
import { CURSOR_IMPORT_EMPTY, importCursorAuth, readCursorVscdbTokens } from './cursor/import.js'
import { cursorCatalogModels, refreshCursorCatalog } from './cursor/catalog.js'
import { ollamaSession, refreshOllama, isOllamaPermanentRefreshError, resolveOllamaIdentity, isOllamaOpaqueAccount } from './ollama/index.js'
import { OLLAMA_IMPORT_EMPTY, importOllamaAuth } from './ollama/import.js'
import { ollamaCatalogModels, refreshOllamaCatalog } from './ollama/catalog.js'
import { kiroCatalogModels, refreshKiroCatalog } from './kiro/catalog.js'
import {
  completeKimiDevice as sessionFromKimiDevice,
  configureKimiIdentity,
  isKimiOpaqueAccount,
  isKimiPermanentRefreshError,
  kimiDeviceSpec,
  kimiSession,
  refreshKimi,
  resolveKimiIdentity,
} from './kimi/index.js'
import { KIMI_IMPORT_EMPTY, importKimiAuth } from './kimi/import.js'
import { kimiCatalogModels, refreshKimiCatalog } from './kimi/catalog.js'
import {
  isOpencodeAnonSession,
  isOpencodePermanentRefreshError,
  opencodeSession,
  refreshOpencode,
} from './opencode/index.js'
import { OPENCODE_IMPORT_EMPTY, importOpencodeAuth } from './opencode/import.js'
import { opencodeCatalogModels, refreshOpencodeCatalog } from './opencode/catalog.js'
import {
  completeCopilotDevice as sessionFromCopilotDevice,
  isCopilotOpaqueAccount,
  isCopilotPermanentRefreshError,
  isCopilotSessionToken,
  copilotDeviceSpec,
  mintCopilotSessionFromGithub,
  refreshCopilot,
  resolveCopilotIdentity,
} from './copilot/index.js'
import { COPILOT_IMPORT_EMPTY, importCopilotAuth } from './copilot/import.js'
import { copilotCatalogModels, refreshCopilotCatalog } from './copilot/catalog.js'
import {
  buildProviders,
  catalogProviders,
  describeCatalog,
  describeProviders,
  filterProviders,
  ModelSwitch,
  syncHarnessModels,
} from './models.js'
import { TokenManager } from './tokens.js'
import { QuotaStore } from './quota.js'
import { fetchLatest, localUpdateInfo, applyHostUpdate, compareVersions, DEFAULT_PROFILE } from '../utils/update.js'

export class AuthController {
  constructor({ authPath, prefix, origin, settings, grokLogin = 'device', onAuthChanged, models, fetchFn = fetch, quotaTtlMs, spawnFn, profile, readFileFn, updateEnv, cursorAutoImport, cursorImport, cursorDiscover, ollamaAutoImport, ollamaDiscover, kiroDiscover, kimiAutoImport, kimiDiscover, opencodeDiscover, opencodeAutoImport, copilotAutoImport, copilotDiscover }) {
    this.authPath = authPath
    this.prefix = prefix
    this.origin = origin
    this.settings = settings
    this.grokLogin = grokLogin
    this.spawnFn = spawnFn
    this.profile = profile || DEFAULT_PROFILE
    this.readFileFn = readFileFn
    this.updateEnv = updateEnv
    this.onAuthChanged = onAuthChanged
    this.models = models ?? new ModelSwitch()
    this.flows = new OAuthFlowManager()
    this.devices = new DeviceFlowManager()
    this.glmFlows = new GlmCliFlowManager()
    this.kiroFlows = new KiroIdcFlowManager()
    this.cursorFlows = new CursorPollFlowManager()
    // node:test sets NODE_TEST_CONTEXT; do not harvest the agent/IDE login into unit snapshots.
    this.cursorAutoImport = cursorAutoImport ?? !process.env.NODE_TEST_CONTEXT
    this.cursorImport = cursorImport && typeof cursorImport === 'object' ? cursorImport : {}
    this.cursorAutoImportTried = false
    this.cursorDiscover = typeof cursorDiscover === 'function'
      ? cursorDiscover
      : (process.env.NODE_TEST_CONTEXT ? undefined : refreshCursorCatalog)
    this.ollamaAutoImport = ollamaAutoImport ?? !process.env.NODE_TEST_CONTEXT
    this.ollamaAutoImportTried = false
    this.ollamaDiscover = typeof ollamaDiscover === 'function'
      ? ollamaDiscover
      : (process.env.NODE_TEST_CONTEXT ? undefined : refreshOllamaCatalog)
    this.kiroDiscover = typeof kiroDiscover === 'function'
      ? kiroDiscover
      : (process.env.NODE_TEST_CONTEXT ? undefined : ((session) => refreshKiroCatalog(session, { fetchFn })))
    this.kimiAutoImport = kimiAutoImport ?? !process.env.NODE_TEST_CONTEXT
    this.kimiAutoImportTried = false
    this.kimiDiscover = typeof kimiDiscover === 'function'
      ? kimiDiscover
      : (process.env.NODE_TEST_CONTEXT ? undefined : ((session) => refreshKimiCatalog(session, { fetchFn })))
    this.opencodeDiscover = typeof opencodeDiscover === 'function'
      ? opencodeDiscover
      : (process.env.NODE_TEST_CONTEXT ? undefined : (() => refreshOpencodeCatalog({ fetchFn })))
    this.opencodeAutoImport = opencodeAutoImport ?? !process.env.NODE_TEST_CONTEXT
    this.opencodeAutoImportTried = false
    this.copilotAutoImport = copilotAutoImport ?? !process.env.NODE_TEST_CONTEXT
    this.copilotAutoImportTried = false
    this.copilotDiscover = typeof copilotDiscover === 'function'
      ? copilotDiscover
      : (process.env.NODE_TEST_CONTEXT ? undefined : ((session) => refreshCopilotCatalog(session, { fetchFn })))
    configureKimiIdentity(typeof authPath === 'string' ? dirname(authPath) : undefined)
    this.lastError = new Map()
    this.finalizing = new Set()
    this.claims = new Map()
    this.tokens = {
      codex: new TokenManager({
        displayName: 'ChatGPT (Codex)',
        preemptMs: 5 * 60_000,
        load: () => getSession('codex', this.authPath),
        save: (session) => saveSession('codex', session, this.authPath),
        remove: () => deleteSession('codex', this.authPath),
        refresh: refreshCodex,
        isPermanent: isCodexPermanentRefreshError,
        onRemoved: () => this.onAuthChanged?.('codex'),
      }),
      grok: new TokenManager({
        displayName: 'Grok (Subscription)',
        preemptMs: 2 * 60_000,
        load: () => getSession('grok', this.authPath),
        save: (session) => saveSession('grok', session, this.authPath),
        remove: () => deleteSession('grok', this.authPath),
        refresh: refreshGrok,
        isPermanent: isGrokPermanentRefreshError,
        onRemoved: () => this.onAuthChanged?.('grok'),
      }),
      glm: new TokenManager({
        displayName: 'GLM (Coding Plan)',
        preemptMs: 24 * 60 * 60_000,
        load: () => getSession('glm', this.authPath),
        save: (session) => saveSession('glm', session, this.authPath),
        remove: () => deleteSession('glm', this.authPath),
        refresh: refreshGlm,
        isPermanent: isGlmPermanentRefreshError,
        onRemoved: () => this.onAuthChanged?.('glm'),
      }),
      kiro: new TokenManager({
        displayName: 'Kiro',
        preemptMs: 2 * 60_000,
        load: () => getSession('kiro', this.authPath),
        save: (session) => saveSession('kiro', session, this.authPath),
        remove: () => deleteSession('kiro', this.authPath),
        refresh: (session) => refreshKiro(session, { fetchFn }),
        isPermanent: isKiroPermanentRefreshError,
        onRemoved: () => this.onAuthChanged?.('kiro'),
      }),
      antigravity: new TokenManager({
        displayName: 'Antigravity',
        preemptMs: ANTIGRAVITY_PREEMPT_MS,
        load: () => getSession('antigravity', this.authPath),
        save: (session) => saveSession('antigravity', session, this.authPath),
        remove: () => deleteSession('antigravity', this.authPath),
        refresh: (session) => refreshAntigravity(session, fetchFn),
        isPermanent: isAntigravityPermanentRefreshError,
        onRemoved: () => this.onAuthChanged?.('antigravity'),
      }),
      cursor: new TokenManager({
        displayName: 'Cursor',
        preemptMs: 5 * 60_000,
        load: () => getSession('cursor', this.authPath),
        save: (session) => saveSession('cursor', session, this.authPath),
        remove: () => deleteSession('cursor', this.authPath),
        refresh: (session) => refreshCursor(session, fetchFn),
        isPermanent: isCursorPermanentRefreshError,
        onRemoved: () => this.onAuthChanged?.('cursor'),
      }),
      ollama: new TokenManager({
        displayName: 'Ollama Cloud',
        preemptMs: 24 * 60 * 60_000,
        load: () => getSession('ollama', this.authPath),
        save: (session) => saveSession('ollama', session, this.authPath),
        remove: () => deleteSession('ollama', this.authPath),
        refresh: refreshOllama,
        isPermanent: isOllamaPermanentRefreshError,
        onRemoved: () => this.onAuthChanged?.('ollama'),
      }),
      kimi: new TokenManager({
        displayName: 'Kimi (Code Plan)',
        preemptMs: 2 * 60_000,
        load: () => getSession('kimi', this.authPath),
        save: (session) => saveSession('kimi', session, this.authPath),
        remove: () => deleteSession('kimi', this.authPath),
        refresh: (session) => refreshKimi(session, fetchFn),
        isPermanent: isKimiPermanentRefreshError,
        onRemoved: () => this.onAuthChanged?.('kimi'),
      }),
      copilot: new TokenManager({
        displayName: 'GitHub Copilot',
        preemptMs: 2 * 60_000,
        load: () => getSession('copilot', this.authPath),
        save: (session) => saveSession('copilot', session, this.authPath),
        remove: () => deleteSession('copilot', this.authPath),
        refresh: (session) => refreshCopilot(session, fetchFn),
        isPermanent: isCopilotPermanentRefreshError,
        onRemoved: () => this.onAuthChanged?.('copilot'),
      }),
      opencode: new TokenManager({
        displayName: 'OpenCode Go Free',
        preemptMs: 24 * 60 * 60_000,
        load: () => getSession('opencode', this.authPath),
        save: (session) => saveSession('opencode', session, this.authPath),
        remove: () => deleteSession('opencode', this.authPath),
        refresh: refreshOpencode,
        isPermanent: isOpencodePermanentRefreshError,
        onRemoved: () => this.onAuthChanged?.('opencode'),
      }),
    }
    this.quota = new QuotaStore({ tokens: this.tokens, fetchFn, ttlMs: quotaTtlMs })
    this.fetchFn = fetchFn
  }

  claim(provider) {
    const next = (this.claims.get(provider) ?? 0) + 1
    this.claims.set(provider, next)
    return next
  }

  async loggedIn() {
    return {
      codex: (await getSession('codex', this.authPath)) !== undefined,
      grok: (await getSession('grok', this.authPath)) !== undefined,
      glm: (await getSession('glm', this.authPath)) !== undefined,
      kiro: (await getSession('kiro', this.authPath)) !== undefined,
      antigravity: (await getSession('antigravity', this.authPath)) !== undefined,
      cursor: (await getSession('cursor', this.authPath)) !== undefined,
      ollama: (await getSession('ollama', this.authPath)) !== undefined,
      kimi: (await getSession('kimi', this.authPath)) !== undefined,
      copilot: (await getSession('copilot', this.authPath)) !== undefined,
      opencode: (await getSession('opencode', this.authPath)) !== undefined,
    }
  }

  async status(provider) {
    const session = await getSession(provider, this.authPath)
    const detail = this.lastError.get(provider)
    const pub = publicSession(provider, session)
    const activeId = session ? accountIdOf(provider, session) : undefined
    return {
      loggedIn: session !== undefined,
      busy: this.flows.isBusy(provider) || this.devices.isBusy(provider) || this.glmFlows.isBusy(provider) || this.kiroFlows.isBusy(provider) || this.cursorFlows.isBusy(provider) || this.finalizing.has(provider),
      ...pub,
      quota: this.quota.peek(provider, activeId),
      ...(detail === undefined ? {} : { detail }),
    }
  }

  catalog() {
    return catalogProviders({
      prefix: this.prefix,
      origin: this.origin(),
      cursorModels: cursorCatalogModels(),
      ollamaModels: ollamaCatalogModels(),
      kiroModels: kiroCatalogModels(),
      kimiModels: kimiCatalogModels(),
      opencodeModels: opencodeCatalogModels(),
      copilotModels: copilotCatalogModels(),
    })
  }

  async #discoverCursor(session) {
    if (!session || typeof this.cursorDiscover !== 'function') return cursorCatalogModels()
    try {
      return await this.cursorDiscover(session)
    } catch {
      return cursorCatalogModels()
    }
  }

  async #discoverOllama(session) {
    if (!session || typeof this.ollamaDiscover !== 'function') return ollamaCatalogModels()
    try {
      return await this.ollamaDiscover(session, { fetchFn: this.fetchFn })
    } catch {
      return ollamaCatalogModels()
    }
  }

  async #discoverKiro(session) {
    if (!session || typeof this.kiroDiscover !== 'function') return kiroCatalogModels()
    try {
      return await this.kiroDiscover(session)
    } catch {
      return kiroCatalogModels()
    }
  }

  async #discoverKimi(session) {
    if (!session || typeof this.kimiDiscover !== 'function') return kimiCatalogModels()
    try {
      return await this.kimiDiscover(session, { fetchFn: this.fetchFn })
    } catch {
      return kimiCatalogModels()
    }
  }

  async #discoverOpencode() {
    if (typeof this.opencodeDiscover !== 'function') return opencodeCatalogModels()
    try {
      return await this.opencodeDiscover({ fetchFn: this.fetchFn })
    } catch {
      return opencodeCatalogModels()
    }
  }

  async #discoverCopilot(session) {
    if (!session || typeof this.copilotDiscover !== 'function') return copilotCatalogModels()
    try {
      return await this.copilotDiscover(session, { fetchFn: this.fetchFn })
    } catch {
      return copilotCatalogModels()
    }
  }

  async snapshot() {
    await this.models.ready
    await this.#resolveGlmIdentities()
    await this.#maybeAutoImportCursor()
    await this.#resolveCursorIdentities()
    await this.#maybeAutoImportOllama()
    await this.#maybeAutoImportKimi()
    await this.#maybeAutoImportCopilot()
    await this.#forgetAnonymousOpencode()
    await this.#maybeAutoImportOpencode()
    const loggedIn = await this.loggedIn()
    const origin = this.origin()
    const catalog = catalogProviders({
      prefix: this.prefix,
      origin,
      cursorModels: cursorCatalogModels(),
      ollamaModels: ollamaCatalogModels(),
      kiroModels: kiroCatalogModels(),
      kimiModels: kimiCatalogModels(),
      opencodeModels: opencodeCatalogModels(),
      copilotModels: copilotCatalogModels(),
    })
    const selected = this.models.selectedForSync(catalog)
    const providers = filterProviders(buildProviders({
      prefix: this.prefix,
      origin,
      loggedIn,
      cursorModels: cursorCatalogModels(),
      ollamaModels: ollamaCatalogModels(),
      kiroModels: kiroCatalogModels(),
      kimiModels: kimiCatalogModels(),
      opencodeModels: opencodeCatalogModels(),
      copilotModels: copilotCatalogModels(),
    }), selected)
    if (loggedIn.codex) await this.#ensureAccountQuota('codex')
    else this.quota.clear('codex')
    if (loggedIn.grok) await this.#ensureAccountQuota('grok')
    else this.quota.clear('grok')
    if (loggedIn.glm) await this.#ensureAccountQuota('glm')
    else this.quota.clear('glm')
    if (loggedIn.kiro) await this.#ensureAccountQuota('kiro')
    else this.quota.clear('kiro')
    if (loggedIn.antigravity) await this.#ensureAccountQuota('antigravity')
    else this.quota.clear('antigravity')
    if (loggedIn.cursor) await this.#ensureAccountQuota('cursor')
    else this.quota.clear('cursor')
    if (loggedIn.ollama) await this.#ensureAccountQuota('ollama')
    else this.quota.clear('ollama')
    if (loggedIn.kimi) await this.#ensureAccountQuota('kimi')
    else this.quota.clear('kimi')
    if (loggedIn.copilot) await this.#ensureAccountQuota('copilot')
    else this.quota.clear('copilot')
    if (loggedIn.opencode) await this.#ensureAccountQuota('opencode')
    else this.quota.clear('opencode')
    const enabledKeys = this.models.enabledKeys(catalog)
    const [codexAccounts, grokAccounts, glmAccounts, kiroAccounts, antigravityAccounts, cursorAccounts, ollamaAccounts, kimiAccounts, copilotAccounts, opencodeAccounts] = await Promise.all([
      this.#accountsWithQuota('codex'),
      this.#accountsWithQuota('grok'),
      this.#accountsWithQuota('glm'),
      this.#accountsWithQuota('kiro'),
      this.#accountsWithQuota('antigravity'),
      this.#accountsWithQuota('cursor'),
      this.#accountsWithQuota('ollama'),
      this.#accountsWithQuota('kimi'),
      this.#accountsWithQuota('copilot'),
      this.#accountsWithQuota('opencode'),
    ])
    return {
      origin,
      grokLogin: this.grokLogin,
      catalog: describeCatalog(catalog, { enabledKeys, loggedIn }),
      providers: describeProviders(providers),
      selected: enabledKeys,
      accounts: {
        codex: { ...(await this.status('codex')), activeId: codexAccounts.find((row) => row.active)?.id, accounts: codexAccounts },
        grok: { ...(await this.status('grok')), activeId: grokAccounts.find((row) => row.active)?.id, accounts: grokAccounts },
        glm: { ...(await this.status('glm')), activeId: glmAccounts.find((row) => row.active)?.id, accounts: glmAccounts },
        kiro: { ...(await this.status('kiro')), activeId: kiroAccounts.find((row) => row.active)?.id, accounts: kiroAccounts },
        antigravity: { ...(await this.status('antigravity')), activeId: antigravityAccounts.find((row) => row.active)?.id, accounts: antigravityAccounts },
        cursor: { ...(await this.status('cursor')), activeId: cursorAccounts.find((row) => row.active)?.id, accounts: cursorAccounts },
        ollama: { ...(await this.status('ollama')), activeId: ollamaAccounts.find((row) => row.active)?.id, accounts: ollamaAccounts },
        kimi: { ...(await this.status('kimi')), activeId: kimiAccounts.find((row) => row.active)?.id, accounts: kimiAccounts },
        copilot: { ...(await this.status('copilot')), activeId: copilotAccounts.find((row) => row.active)?.id, accounts: copilotAccounts },
        opencode: { ...(await this.status('opencode')), activeId: opencodeAccounts.find((row) => row.active)?.id, accounts: opencodeAccounts },
      },
      update: localUpdateInfo(process.platform, {
        profile: this.profile,
        env: this.updateEnv ?? process.env,
        readFileFn: this.readFileFn,
      }),
    }
  }

  async refreshQuota(provider, accountId) {
    if (provider === 'codex' || provider === 'grok' || provider === 'glm' || provider === 'kiro' || provider === 'antigravity' || provider === 'cursor' || provider === 'ollama' || provider === 'kimi' || provider === 'opencode' || provider === 'copilot') {
      const rows = await this.#liveAccounts(provider)
      const targets = accountId
        ? rows.filter((row) => row.id === accountId)
        : rows
      if (accountId && targets.length === 0) throw new Error(`${provider} account ${accountId} is not signed in`)
      if (targets.length === 0) return this.quota.peek(provider)
      await Promise.all(targets.map((row) => this.quota.refresh(provider, row.id, row.session)))
      if (provider === 'cursor') {
        await Promise.all(targets.map((row) => this.#rememberCursorPlan(row, this.quota.peek(provider, row.id))))
      }
      if (provider === 'ollama') {
        await Promise.all(targets.map((row) => this.#rememberOllamaIdentity(row, this.quota.peek(provider, row.id))))
      }
      if (provider === 'antigravity') {
        await Promise.all(targets.map((row) => this.#probeAntigravity(row.session, row.id)))
      }
      if (provider === 'cursor') {
        const before = cursorCatalogModels().map((model) => model.id).join('\0')
        await Promise.all(targets.map((row) => this.#discoverCursor(row.session)))
        if (this.settings && cursorCatalogModels().map((model) => model.id).join('\0') !== before) {
          await this.sync().catch(() => undefined)
        }
      }
      if (provider === 'ollama') {
        const before = ollamaCatalogModels().map((model) => model.id).join('\0')
        await Promise.all(targets.map((row) => this.#discoverOllama(row.session)))
        if (this.settings && ollamaCatalogModels().map((model) => model.id).join('\0') !== before) {
          await this.sync().catch(() => undefined)
        }
      }
      if (provider === 'kiro') {
        const before = kiroCatalogModels().map((model) => model.id).join('\0')
        await Promise.all(targets.map((row) => this.#discoverKiro(row.session)))
        if (this.settings && kiroCatalogModels().map((model) => model.id).join('\0') !== before) {
          await this.sync().catch(() => undefined)
        }
      }
      if (provider === 'kimi') {
        await Promise.all(targets.map((row) => this.#rememberKimiIdentity(row, this.quota.peek(provider, row.id))))
        const before = kimiCatalogModels().map((model) => model.id).join('\0')
        await Promise.all(targets.map((row) => this.#discoverKimi(row.session)))
        if (this.settings && kimiCatalogModels().map((model) => model.id).join('\0') !== before) {
          await this.sync().catch(() => undefined)
        }
      }
      if (provider === 'copilot') {
        await Promise.all(targets.map((row) => this.#rememberCopilotIdentity(row, this.quota.peek(provider, row.id))))
        const before = copilotCatalogModels().map((model) => model.id).join('\0')
        await Promise.all(targets.map((row) => this.#discoverCopilot(row.session)))
        if (this.settings && copilotCatalogModels().map((model) => model.id).join('\0') !== before) {
          await this.sync().catch(() => undefined)
        }
      }
      if (provider === 'opencode') {
        const before = opencodeCatalogModels().map((model) => model.id).join('\0')
        await this.#discoverOpencode()
        if (this.settings && opencodeCatalogModels().map((model) => model.id).join('\0') !== before) {
          await this.sync().catch(() => undefined)
        }
      }
      const latest = provider === 'ollama' || provider === 'kimi' || provider === 'opencode' || provider === 'copilot' ? await this.#liveAccounts(provider) : rows
      if (accountId) {
        const hit = latest.find((row) => row.id === accountId) ?? latest.find((row) => row.active)
        return this.quota.peek(provider, hit?.id ?? accountId)
      }
      const active = latest.find((row) => row.active)
      return this.quota.peek(provider, active?.id)
    }
    const [codex, grok, glm, kiro, antigravity, cursor, ollama, kimi, copilot, opencode] = await Promise.all([
      this.refreshQuota('codex'),
      this.refreshQuota('grok'),
      this.refreshQuota('glm'),
      this.refreshQuota('kiro'),
      this.refreshQuota('antigravity'),
      this.refreshQuota('cursor'),
      this.refreshQuota('ollama'),
      this.refreshQuota('kimi'),
      this.refreshQuota('copilot'),
      this.refreshQuota('opencode'),
    ])
    return { codex, grok, glm, kiro, antigravity, cursor, ollama, kimi, copilot, opencode }
  }

  async consumeReset(provider, accountId) {
    if (provider !== 'codex') throw new Error('only ChatGPT Codex can reset quota')
    const session = await getAccountSession('codex', accountId, this.authPath)
    if (!session) throw new Error('ChatGPT Codex is not signed in')
    const live = await this.#hydrateSession('codex', session)
    return this.quota.consume('codex', accountIdOf('codex', live), live)
  }

  async checkUpdate(payload = {}) {
    const apply = payload?.apply === true
    const profileOpts = {
      profile: this.profile,
      env: this.updateEnv ?? process.env,
      readFileFn: this.readFileFn,
    }
    try {
      const info = await fetchLatest({ fetchFn: this.fetchFn, platform: process.platform, ...profileOpts })
      if (!apply || info.status !== 'update') {
        return { ...info, apply: { status: 'none' } }
      }
      const result = await applyHostUpdate({
        spawnFn: this.spawnFn,
        profile: this.profile,
        latest: info.latest?.tag,
        readFileFn: this.readFileFn,
        env: profileOpts.env,
      })
      const next = localUpdateInfo(process.platform, profileOpts)
      const version = next.version || result.after || ''
      const disk = result.after || next.disk
      if (result.ok) {
        const caughtUp = Boolean(version && info.latest?.tag && compareVersions(version, info.latest.tag) >= 0)
        return {
          ...info,
          ...next,
          version,
          disk: disk || undefined,
          status: caughtUp ? 'current' : info.status,
          apply: { status: 'installed', restart: true, command: result.command },
        }
      }
      return {
        ...info,
        ...next,
        version: next.version || info.version,
        apply: { status: result.status, error: result.error, command: result.command },
      }
    } catch (error) {
      return {
        ...localUpdateInfo(process.platform, profileOpts),
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        latest: undefined,
        assets: [],
        apply: { status: 'none' },
      }
    }
  }

  async #resolveGlmIdentities() {
    const rows = await listStoredSessions('glm', this.authPath)
    await Promise.all(rows.map(async (row) => {
      if (pickGlmHumanAccount(row.session?.account)) return
      const account = await resolveGlmIdentity(row.session, { fetchFn: this.fetchFn }).catch(() => undefined)
      if (!account || account === row.session.account) return
      const next = { ...row.session, account }
      const nextId = accountIdOf('glm', next)
      if (nextId !== row.id) {
        await replaceAccountId('glm', row.id, next, this.authPath)
        this.quota.clear('glm', row.id)
      } else {
        await saveSession('glm', next, this.authPath, { activate: false })
      }
    }))
  }

  async #hydrateSession(provider, session) {
    const manager = this.tokens[provider]
    if (!session || !manager) return session
    if (typeof session.expiresAt !== 'number') return session
    if (session.expiresAt - Date.now() > manager.preemptMs) return session
    try {
      const next = await manager.refresh(session)
      await saveSession(provider, next, this.authPath, { activate: false })
      return next
    } catch {
      return session
    }
  }

  async #liveAccounts(provider) {
    const rows = await listStoredSessions(provider, this.authPath)
    return Promise.all(rows.map(async (row) => ({
      ...row,
      session: await this.#hydrateSession(provider, row.session),
    })))
  }

  async #ensureAccountQuota(provider) {
    const rows = await this.#liveAccounts(provider)
    if (rows.length === 0) {
      this.quota.clear(provider)
      return []
    }
    await Promise.all(rows.map(async (row) => {
      const quota = await this.quota.ensure(provider, row.id, row.session)
      if (provider === 'kiro') await this.#rememberKiroProfile(row, quota)
      if (provider === 'antigravity') await this.#rememberAntigravityPlan(row, quota)
      if (provider === 'cursor') await this.#rememberCursorPlan(row, quota)
      if (provider === 'ollama') await this.#rememberOllamaIdentity(row, quota)
      if (provider === 'kimi') await this.#rememberKimiIdentity(row, quota)
    }))
    return rows
  }

  async #rememberKiroProfile(row, quota) {
    if (!quota || quota.status !== 'ready') return
    const email = typeof quota.account === 'string' && quota.account.trim() ? quota.account.trim() : undefined
    const planType = typeof quota.planType === 'string' && quota.planType.trim() ? quota.planType.trim() : undefined
    if (!email && !planType) return
    if ((!email || row.session.account === email) && (!planType || row.session.planType === planType)) return
    const next = { ...row.session }
    if (email) next.account = email
    if (planType) next.planType = planType
    await saveSession('kiro', next, this.authPath, { id: row.id, activate: row.active })
  }

  async #rememberCursorPlan(row, quota) {
    if (!quota || quota.status !== 'ready') return
    const email = pickCursorHumanAccount(quota.account, row.session.cachedEmail)
    const planType = typeof quota.planType === 'string' && quota.planType.trim() ? quota.planType.trim() : undefined
    const cachedEmail = pickCursorHumanAccount(email, row.session.cachedEmail)
    if (!email && !planType && cachedEmail === row.session.cachedEmail) return
    if (
      (!email || row.session.account === email)
      && (!planType || row.session.planType === planType)
      && row.session.cachedEmail === cachedEmail
    ) return
    const next = { ...row.session }
    if (email) next.account = email
    if (planType) next.planType = planType
    if (cachedEmail) next.cachedEmail = cachedEmail
    await this.#rewriteCursorIdentity(row, next)
  }

  async #resolveCursorIdentities() {
    const rows = await listStoredSessions('cursor', this.authPath)
    const vscdb = await this.#readCursorVscdbHint()
    await Promise.all(rows.map(async (row) => {
      if (pickCursorHumanAccount(row.session?.account)) return
      const account = pickCursorHumanAccount(
        cursorAccountFromToken(row.session?.accessToken),
        this.#cachedEmailFor(row.session, vscdb),
      )
      if (!account) return
      await this.#rewriteCursorIdentity(row, { ...row.session, account })
    }))
  }

  #cachedEmailFor(session, vscdb) {
    const email = pickCursorHumanAccount(vscdb?.cachedEmail)
    if (!email || !session) return undefined
    const sameAccess = typeof vscdb.accessToken === 'string' && vscdb.accessToken === session.accessToken
    const sameRefresh = typeof vscdb.refreshToken === 'string' && vscdb.refreshToken === session.refreshToken
    if (session.source === 'ide_vscdb' || sameAccess || sameRefresh) return email
    return undefined
  }

  async #readCursorVscdbHint() {
    const opts = this.cursorImport ?? {}
    if (process.env.NODE_TEST_CONTEXT && !opts.readVscdbFn && !opts.paths && !opts.home) {
      return {}
    }
    try {
      return await readCursorVscdbTokens({
        platform: opts.platform,
        env: opts.env,
        home: opts.home,
        paths: opts.paths,
        readDb: opts.readVscdbFn,
        now: opts.now,
      })
    } catch {
      return {}
    }
  }

  async #rewriteCursorIdentity(row, next) {
    const nextId = accountIdOf('cursor', next)
    if (nextId !== row.id) {
      await replaceAccountId('cursor', row.id, next, this.authPath)
      this.quota.clear('cursor', row.id)
      await this.quota.ensure('cursor', nextId, next)
      return
    }
    await saveSession('cursor', next, this.authPath, { id: row.id, activate: row.active })
  }

  async #maybeAutoImportCursor() {
    if (!this.cursorAutoImport || this.cursorAutoImportTried) return
    this.cursorAutoImportTried = true
    const rows = await listStoredSessions('cursor', this.authPath)
    if (rows.length > 0) return
    try {
      const result = await importCursorAuth({ fetchFn: this.fetchFn, ...this.cursorImport })
      if (result?.session) {
        await saveSession('cursor', result.session, this.authPath)
        await this.#discoverCursor(result.session)
        this.onAuthChanged?.('cursor')
        void this.quota.refresh('cursor')
      }
    } catch (error) {
      if (error?.code !== CURSOR_IMPORT_EMPTY && error?.message !== CURSOR_IMPORT_EMPTY) {
        // empty machine is fine; other faults stay off the Settings banner
      }
    }
  }

  async #importCursor() {
    const existing = await listStoredSessions('cursor', this.authPath)
    const result = await importCursorAuth({ fetchFn: this.fetchFn, ...this.cursorImport })
    const incomingId = accountIdOf('cursor', result.session)
    const hit = existing.find((row) => row.id === incomingId)
    if (hit?.session?.source === 'pkce') {
      return { source: 'pkce', session: hit.session, skipped: true }
    }
    return result
  }

  async #maybeAutoImportOllama() {
    if (!this.ollamaAutoImport || this.ollamaAutoImportTried) return
    this.ollamaAutoImportTried = true
    const rows = await listStoredSessions('ollama', this.authPath)
    if (rows.length > 0) return
    try {
      const result = await importOllamaAuth({ env: process.env })
      if (result?.session) {
        const session = await this.#finishOllamaSession(result.session)
        await saveSession('ollama', session, this.authPath)
        await this.#discoverOllama(session)
        this.onAuthChanged?.('ollama')
        void this.quota.refresh('ollama')
      }
    } catch (error) {
      if (error?.code !== OLLAMA_IMPORT_EMPTY && error?.message !== OLLAMA_IMPORT_EMPTY) {
        // empty env is fine; other faults stay off the Settings banner
      }
    }
  }

  async #importOllama() {
    const existing = await listStoredSessions('ollama', this.authPath)
    const result = await importOllamaAuth({ env: process.env })
    const incomingId = accountIdOf('ollama', result.session)
    const hit = existing.find((row) => row.id === incomingId)
    if (hit) {
      return { source: hit.session.source, session: hit.session, skipped: true }
    }
    return { ...result, session: await this.#finishOllamaSession(result.session) }
  }

  async #finishOllamaSession(session) {
    const identity = await resolveOllamaIdentity(session, { fetchFn: this.fetchFn })
    if (!identity) return session
    const next = { ...session }
    if (identity.account) next.account = identity.account
    if (identity.planType) next.planType = identity.planType
    return next
  }

  async #rememberOllamaIdentity(row, quota) {
    if (!quota || quota.status !== 'ready') return
    const account = typeof quota.account === 'string' && quota.account.trim() ? quota.account.trim() : undefined
    const planType = typeof quota.planType === 'string' && quota.planType.trim() ? quota.planType.trim() : undefined
    if (!account && !planType) return
    if (
      (!account || row.session.account === account)
      && (!planType || row.session.planType === planType)
    ) return
    const next = { ...row.session }
    if (account) next.account = account
    if (planType) next.planType = planType
    const nextId = accountIdOf('ollama', next)
    if (nextId !== row.id && isOllamaOpaqueAccount(row.id)) {
      await replaceAccountId('ollama', row.id, next, this.authPath)
      this.quota.clear('ollama', row.id)
      await this.quota.ensure('ollama', nextId, next)
      return
    }
    await saveSession('ollama', next, this.authPath, { id: row.id, activate: row.active })
  }

  async #forgetAnonymousOpencode() {
    const rows = await listStoredSessions('opencode', this.authPath)
    for (const row of rows) {
      if (!isOpencodeAnonSession(row.session)) continue
      await deleteSession('opencode', this.authPath, row.id)
      this.quota.clear('opencode', row.id)
    }
  }

  async #maybeAutoImportOpencode() {
    if (!this.opencodeAutoImport || this.opencodeAutoImportTried) return
    this.opencodeAutoImportTried = true
    await this.#forgetAnonymousOpencode()
    const rows = await listStoredSessions('opencode', this.authPath)
    if (rows.length > 0) return
    try {
      const result = await importOpencodeAuth({ env: process.env })
      if (result?.session) {
        await saveSession('opencode', result.session, this.authPath)
        await this.#discoverOpencode()
        this.onAuthChanged?.('opencode')
        void this.quota.refresh('opencode')
      }
    } catch (error) {
      if (error?.code !== OPENCODE_IMPORT_EMPTY && error?.message !== OPENCODE_IMPORT_EMPTY) {
        // empty env is fine
      }
    }
  }

  async #importOpencode() {
    const existing = await listStoredSessions('opencode', this.authPath)
    const result = await importOpencodeAuth({ env: process.env })
    const incomingId = accountIdOf('opencode', result.session)
    const hit = existing.find((row) => row.id === incomingId)
    if (hit) {
      return { source: hit.session.source, session: hit.session, skipped: true }
    }
    return result
  }

  async #maybeAutoImportKimi() {
    if (!this.kimiAutoImport || this.kimiAutoImportTried) return
    this.kimiAutoImportTried = true
    const rows = await listStoredSessions('kimi', this.authPath)
    if (rows.length > 0) return
    try {
      const result = await importKimiAuth({ env: process.env, allowEnv: false })
      if (result?.session) {
        const session = await this.#finishKimiSession(result.session)
        await saveSession('kimi', session, this.authPath)
        await this.#discoverKimi(session)
        this.onAuthChanged?.('kimi')
        void this.quota.refresh('kimi')
      }
    } catch (error) {
      if (error?.code !== KIMI_IMPORT_EMPTY && error?.message !== KIMI_IMPORT_EMPTY) {
        // empty CLI file is fine
      }
    }
  }

  async #maybeAutoImportCopilot() {
    if (!this.copilotAutoImport || this.copilotAutoImportTried) return
    this.copilotAutoImportTried = true
    const rows = await listStoredSessions('copilot', this.authPath)
    if (rows.length > 0) return
    try {
      const result = await importCopilotAuth({ env: process.env, allowEnv: false, fetchFn: this.fetchFn })
      if (result?.session) {
        const session = await this.#finishCopilotSession(result.session)
        await saveSession('copilot', session, this.authPath)
        await this.#discoverCopilot(session)
        this.onAuthChanged?.('copilot')
        void this.quota.refresh('copilot')
      }
    } catch (error) {
      if (error?.code !== COPILOT_IMPORT_EMPTY && error?.message !== COPILOT_IMPORT_EMPTY) {
        // empty hosts.json is fine
      }
    }
  }

  async #importKimi() {
    const existing = await listStoredSessions('kimi', this.authPath)
    const result = await importKimiAuth({ env: process.env })
    const incomingId = accountIdOf('kimi', result.session)
    const hit = existing.find((row) => row.id === incomingId)
    if (hit) {
      return { source: hit.session.source, session: hit.session, skipped: true }
    }
    return { ...result, session: await this.#finishKimiSession(result.session) }
  }

  async #importCopilot() {
    const existing = await listStoredSessions('copilot', this.authPath)
    const result = await importCopilotAuth({ env: process.env, fetchFn: this.fetchFn })
    const incomingId = accountIdOf('copilot', result.session)
    const hit = existing.find((row) => row.id === incomingId)
    if (hit) {
      return { source: hit.session.source, session: hit.session, skipped: true }
    }
    return { ...result, session: await this.#finishCopilotSession(result.session) }
  }

  async #finishKimiSession(session) {
    const identity = await resolveKimiIdentity(session, { fetchFn: this.fetchFn })
    if (!identity) return session
    const next = { ...session }
    if (identity.account) next.account = identity.account
    if (identity.planType) next.planType = identity.planType
    return next
  }

  async #rememberKimiIdentity(row, quota) {
    if (!quota || quota.status !== 'ready') return
    const account = typeof quota.account === 'string' && quota.account.trim() ? quota.account.trim() : undefined
    const planType = typeof quota.planType === 'string' && quota.planType.trim() ? quota.planType.trim() : undefined
    if (!account && !planType) return
    if (
      (!account || row.session.account === account)
      && (!planType || row.session.planType === planType)
    ) return
    const next = { ...row.session }
    if (account) next.account = account
    if (planType) next.planType = planType
    const nextId = accountIdOf('kimi', next)
    if (nextId !== row.id && isKimiOpaqueAccount(row.id)) {
      await replaceAccountId('kimi', row.id, next, this.authPath)
      this.quota.clear('kimi', row.id)
      await this.quota.ensure('kimi', nextId, next)
      return
    }
    await saveSession('kimi', next, this.authPath, { id: row.id, activate: row.active })
  }

  async #finishCopilotSession(session) {
    let next = session
    if (!session?.accessToken || !isCopilotSessionToken(session.accessToken)) {
      if (session?.githubToken || session?.accessToken) {
        next = await mintCopilotSessionFromGithub(session.githubToken || session.accessToken, {
          fetchFn: this.fetchFn,
          source: session.source,
          account: session.account,
        })
        if (session.planType) next = { ...next, planType: session.planType }
      }
    }
    const identity = await resolveCopilotIdentity(next, { fetchFn: this.fetchFn })
    if (!identity) return next
    if (identity.account) next = { ...next, account: identity.account }
    return next
  }

  async #rememberCopilotIdentity(row, quota) {
    if (!quota || quota.status !== 'ready') return
    const account = typeof quota.account === 'string' && quota.account.trim() ? quota.account.trim() : undefined
    const planType = typeof quota.planType === 'string' && quota.planType.trim() ? quota.planType.trim() : undefined
    if (!account && !planType) return
    if (
      (!account || row.session.account === account)
      && (!planType || row.session.planType === planType)
    ) return
    const next = { ...row.session }
    if (account) next.account = account
    if (planType) next.planType = planType
    const nextId = accountIdOf('copilot', next)
    if (nextId !== row.id && isCopilotOpaqueAccount(row.id)) {
      await replaceAccountId('copilot', row.id, next, this.authPath)
      this.quota.clear('copilot', row.id)
      await this.quota.ensure('copilot', nextId, next)
      return
    }
    await saveSession('copilot', next, this.authPath, { id: row.id, activate: row.active })
  }

  async #rememberAntigravityPlan(row, quota) {
    if (!quota || quota.status !== 'ready') return
    const planType = typeof quota.planType === 'string' && quota.planType.trim() ? quota.planType.trim() : undefined
    if (!planType || row.session.planType === planType) return
    await saveSession('antigravity', { ...row.session, planType }, this.authPath, { id: row.id, activate: row.active })
  }

  async #existingKiroMachineId() {
    const rows = await listStoredSessions('kiro', this.authPath)
    for (const row of rows) {
      const id = row.session?.machineId
      if (typeof id === 'string' && /^[0-9a-f]{64}$/i.test(id)) return id
    }
    return undefined
  }

  async #accountsWithQuota(provider) {
    const rows = await listStoredSessions(provider, this.authPath)
    return rows
      .map((row) => ({
        id: row.id,
        active: row.active,
        ...publicSession(provider, row.session),
        quota: this.quota.peek(provider, row.id),
      }))
      .sort((left, right) => Number(right.active) - Number(left.active) || left.id.localeCompare(right.id))
  }

  async login(provider, options) {
    const payload = typeof options === 'string' || options == null ? { mode: options } : options
    const mode = payload.mode ?? payload.region
    if (provider === 'kiro') return this.#loginKiro(payload)
    if (provider === 'glm') {
      const region = normalizeGlmRegion(mode)
      const attempt = await this.glmFlows.start('glm', { region, fetchFn: this.fetchFn })
      this.finalizing.add('glm')
      void this.completeGlm(attempt)
      return { authorizeUrl: attempt.authorizeUrl, mode: 'cli', region }
    }
    if (provider === 'ollama') {
      throw new Error('ollama uses the paste form, not browser login')
    }
    if (provider === 'opencode') {
      throw new Error('opencode uses the paste form, not browser login')
    }
    if (provider === 'cursor') {
      const attempt = await this.cursorFlows.start('cursor', { fetchFn: this.fetchFn })
      this.finalizing.add('cursor')
      void this.completeCursor(attempt)
      return { authorizeUrl: attempt.authorizeUrl, mode: 'cli' }
    }
    if (provider === 'antigravity') {
      const attempt = await this.flows.start('antigravity', antigravityFlow)
      const claim = this.claim('antigravity')
      void this.completePkce('antigravity', attempt, claim)
      return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'oauth' }
    }
    if (provider === 'codex') {
      const attempt = await this.flows.start('codex', codexFlow)
      const claim = this.claim('codex')
      void this.completePkce('codex', attempt, claim)
      return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'pkce' }
    }
    if (provider === 'kimi') {
      const attempt = await this.devices.start('kimi', kimiDeviceSpec({ fetchFn: this.fetchFn }))
      this.finalizing.add('kimi')
      void this.completeKimiDevice(attempt)
      return {
        authorizeUrl: attempt.verificationUrl,
        verificationUri: attempt.verificationUri,
        userCode: attempt.userCode,
        mode: 'device',
      }
    }
    if (provider === 'copilot') {
      const attempt = await this.devices.start('copilot', copilotDeviceSpec({ fetchFn: this.fetchFn }))
      this.finalizing.add('copilot')
      void this.completeCopilotDevice(attempt)
      return {
        authorizeUrl: attempt.verificationUrl,
        verificationUri: attempt.verificationUri,
        userCode: attempt.userCode,
        mode: 'device',
      }
    }
    if (provider !== 'grok') throw new Error(`unknown provider ${provider}`)
    const useDevice = (mode ?? this.grokLogin) !== 'pkce'
    if (useDevice) {
      const attempt = await this.devices.start('grok', await grokDeviceSpec())
      this.finalizing.add('grok')
      void this.completeDevice('grok', attempt)
      return {
        authorizeUrl: attempt.verificationUrl,
        verificationUri: attempt.verificationUri,
        userCode: attempt.userCode,
        mode: 'device',
      }
    }
    const attempt = await this.flows.start('grok', await grokFlow())
    const claim = this.claim('grok')
    void this.completePkce('grok', attempt, claim)
    return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'pkce' }
  }

  async #loginKiro(payload = {}) {
    const mode = canonicalizeKiroMethod(payload.mode ?? payload.authMethod, {
      tokenEndpoint: payload.tokenEndpoint,
    })
    if (mode === 'api_key' || mode === 'external_idp') {
      throw new Error('kiro API key and enterprise SSO use the paste form, not browser login')
    }
    this.claim('kiro')
    this.flows.pending('kiro')?.cancel()
    this.kiroFlows.pending('kiro')?.cancel()
    if (mode === 'idc' || payload.mode === 'builder' || payload.mode === 'builder-id') {
      const startUrl = typeof payload.startUrl === 'string' && payload.startUrl.trim()
        ? payload.startUrl.trim()
        : BUILDER_ID_START_URL
      const kind = startUrl === BUILDER_ID_START_URL ? 'builder' : 'enterprise'
      const attempt = await this.kiroFlows.start('kiro', {
        startUrl,
        kind,
        fetchFn: this.fetchFn,
      })
      this.finalizing.add('kiro')
      void this.completeKiroIdc(attempt)
      return {
        authorizeUrl: attempt.verificationUrl,
        verificationUri: attempt.verificationUri,
        userCode: attempt.userCode,
        mode: 'device',
        kind,
        startUrl,
      }
    }
    const machineId = allocateKiroMachineId(await this.#existingKiroMachineId())
    const attempt = await this.flows.start('kiro', kiroSocialFlow())
    attempt.machineId = machineId
    const claim = this.claim('kiro')
    void this.completePkce('kiro', attempt, claim)
    return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'pkce', machineId }
  }

  async completePkce(provider, attempt, claim) {
    try {
      const code = await attempt.waitCode()
      const session = provider === 'codex'
        ? await exchangeCodexCode(code, attempt.pkce.verifier, attempt.redirectUri)
        : provider === 'kiro'
          ? await exchangeKiroSocialCode(code, attempt.pkce.verifier, attempt.redirectUri, {
            fetchFn: this.fetchFn,
            callback: typeof attempt.callback === 'function' ? attempt.callback() : attempt.callback,
            machineId: attempt.machineId,
          })
        : provider === 'antigravity'
          ? await exchangeAntigravityCode(code, attempt.redirectUri, { fetchFn: this.fetchFn })
          : await exchangeGrokCode(code, attempt.pkce.verifier, attempt.redirectUri, attempt.pkce.challenge)
      if (this.claims.get(provider) !== claim) return
      await saveSession(provider, session, this.authPath)
      this.lastError.delete(provider)
      if (provider === 'kiro') await this.#discoverKiro(session)
      this.onAuthChanged?.(provider)
      void this.quota.refresh(provider)
      if (provider === 'antigravity') void this.#probeAntigravity(session)
    } catch (error) {
      if (this.claims.get(provider) !== claim) return
      if (!(error instanceof Error && error.message === 'login cancelled')) {
        this.lastError.set(provider, error.message)
      }
    }
  }

  async #probeAntigravity(session, accountId) {
    try {
      const info = await probeAntigravityValidation(session, { fetchFn: this.fetchFn })
      if (info === undefined) return
      const next = applyAntigravityValidation(session, info)
      await saveSession('antigravity', next, this.authPath, accountId
        ? { id: accountId, activate: false }
        : { activate: false })
    } catch {
      // probe is best-effort; quota / login must still succeed
    }
  }

  async completeKimiDevice(attempt) {
    try {
      const tokens = await attempt.waitToken()
      const session = await this.#finishKimiSession(await sessionFromKimiDevice(tokens))
      await saveSession('kimi', session, this.authPath)
      this.lastError.delete('kimi')
      await this.#discoverKimi(session)
      this.onAuthChanged?.('kimi')
      void this.quota.refresh('kimi')
    } catch (error) {
      if (!(error instanceof Error && error.message === 'login cancelled')) {
        this.lastError.set('kimi', error instanceof Error ? error.message : String(error))
      }
    } finally {
      this.finalizing.delete('kimi')
    }
  }

  async completeCopilotDevice(attempt) {
    try {
      const tokens = await attempt.waitToken()
      const session = await this.#finishCopilotSession(await sessionFromCopilotDevice(tokens, { fetchFn: this.fetchFn }))
      await saveSession('copilot', session, this.authPath)
      this.lastError.delete('copilot')
      await this.#discoverCopilot(session)
      this.onAuthChanged?.('copilot')
      void this.quota.refresh('copilot')
    } catch (error) {
      if (!(error instanceof Error && error.message === 'login cancelled')) {
        this.lastError.set('copilot', error instanceof Error ? error.message : String(error))
      }
    } finally {
      this.finalizing.delete('copilot')
    }
  }

  async completeDevice(provider, attempt) {
    try {
      const tokens = await attempt.waitToken()
      const session = await completeGrokDevice(tokens)
      await saveSession(provider, session, this.authPath)
      this.lastError.delete(provider)
      this.onAuthChanged?.(provider)
      void this.quota.refresh(provider)
    } catch (error) {
      if (!(error instanceof Error && error.message === 'login cancelled')) {
        this.lastError.set(provider, error.message)
      }
    } finally {
      this.finalizing.delete(provider)
    }
  }

  async completeGlm(attempt) {
    try {
      const session = await attempt.waitToken()
      await saveSession('glm', session, this.authPath)
      this.lastError.delete('glm')
      this.onAuthChanged?.('glm')
      void this.quota.refresh('glm')
    } catch (error) {
      if (!(error instanceof Error && error.message === 'login cancelled')) {
        this.lastError.set('glm', error instanceof Error ? error.message : String(error))
      }
    } finally {
      this.finalizing.delete('glm')
    }
  }

  async completeCursor(attempt) {
    try {
      const session = await attempt.waitToken()
      await saveSession('cursor', session, this.authPath)
      this.lastError.delete('cursor')
      await this.#discoverCursor(session)
      this.onAuthChanged?.('cursor')
      void this.quota.refresh('cursor')
    } catch (error) {
      if (!(error instanceof Error && error.message === 'login cancelled')) {
        this.lastError.set('cursor', error instanceof Error ? error.message : String(error))
      }
    } finally {
      this.finalizing.delete('cursor')
    }
  }

  async completeKiroIdc(attempt) {
    try {
      const session = await attempt.waitToken()
      await saveSession('kiro', session, this.authPath)
      this.lastError.delete('kiro')
      await this.#discoverKiro(session)
      this.onAuthChanged?.('kiro')
      void this.quota.refresh('kiro')
    } catch (error) {
      if (!(error instanceof Error && error.message === 'login cancelled')) {
        this.lastError.set('kiro', error instanceof Error ? error.message : String(error))
      }
    } finally {
      this.finalizing.delete('kiro')
    }
  }

  async useKey(provider, key, extra) {
    const payload = typeof extra === 'string' || extra == null ? { region: extra } : extra
    if (provider === 'kiro') return this.#useKiroKey(key, payload)
    if (provider === 'ollama') {
      const session = await this.#finishOllamaSession(ollamaSession({
        accessToken: key,
        source: 'paste',
      }))
      this.claim('ollama')
      await saveSession('ollama', session, this.authPath)
      this.lastError.delete('ollama')
      await this.#discoverOllama(session)
      this.onAuthChanged?.('ollama')
      void this.quota.refresh('ollama')
      return { account: publicSession('ollama', session) }
    }
    if (provider === 'kimi') {
      const session = await this.#finishKimiSession(kimiSession({
        accessToken: key,
        source: 'paste',
      }))
      this.claim('kimi')
      this.devices.pending('kimi')?.cancel()
      await saveSession('kimi', session, this.authPath)
      this.lastError.delete('kimi')
      await this.#discoverKimi(session)
      this.onAuthChanged?.('kimi')
      void this.quota.refresh('kimi')
      return { account: publicSession('kimi', session) }
    }
    if (provider === 'copilot') {
      const session = await this.#finishCopilotSession(await mintCopilotSessionFromGithub(key, {
        fetchFn: this.fetchFn,
        source: 'paste',
      }))
      this.claim('copilot')
      this.devices.pending('copilot')?.cancel()
      await saveSession('copilot', session, this.authPath)
      this.lastError.delete('copilot')
      await this.#discoverCopilot(session)
      this.onAuthChanged?.('copilot')
      void this.quota.refresh('copilot')
      return { account: publicSession('copilot', session) }
    }
    if (provider === 'opencode') {
      const session = opencodeSession({
        accessToken: key,
        source: 'paste',
      })
      this.claim('opencode')
      await saveSession('opencode', session, this.authPath)
      this.lastError.delete('opencode')
      await this.#discoverOpencode()
      this.onAuthChanged?.('opencode')
      void this.quota.refresh('opencode')
      return { account: publicSession('opencode', session) }
    }
    if (provider !== 'glm') throw new Error('only GLM, Kiro, Ollama Cloud, Kimi, OpenCode Go Free, and Copilot accept a pasted key')
    const accessToken = typeof key === 'string' ? key.trim() : ''
    if (accessToken.length < 8) throw new Error('glm API key is empty')
    this.claim('glm')
    this.glmFlows.pending('glm')?.cancel()
    const resolved = normalizeGlmRegion(payload.region ?? payload.mode)
    await saveSession('glm', glmSession({
      accessToken,
      account: 'api-key',
      region: resolved,
    }), this.authPath)
    this.lastError.delete('glm')
    this.onAuthChanged?.('glm')
    void this.quota.refresh('glm')
    return { region: resolved }
  }

  async #useKiroKey(key, payload = {}) {
    const raw = typeof key === 'string' ? key.trim() : ''
    const parsed = parseKiroImportText(raw)
    if (isKiroBatchImport(parsed.kind) && parsed.sessions.length > 0) {
      return this.#saveKiroImports(parsed.sessions, { refreshMissingAccess: true })
    }
    const mode = canonicalizeKiroMethod(payload.mode ?? payload.authMethod, {
      tokenEndpoint: payload.tokenEndpoint,
    })
    this.claim('kiro')
    this.flows.pending('kiro')?.cancel()
    this.kiroFlows.pending('kiro')?.cancel()
    let session
    if (raw.startsWith('ksk_') || mode === 'api_key') {
      const kiroApiKey = validateKiroApiKey(raw || payload.kiroApiKey)
      session = kiroSession({
        accessToken: kiroApiKey,
        kiroApiKey,
        authMethod: 'api_key',
        account: typeof payload.account === 'string' ? payload.account : 'api-key',
      })
    } else if (mode === 'external_idp' || payload.tokenEndpoint) {
      const tokenEndpoint = validateKiroIdpEndpoint(payload.tokenEndpoint)
      session = await refreshKiroExternalIdp(kiroSession({
        refreshToken: validateKiroRefreshToken(raw || payload.refreshToken),
        clientId: payload.clientId,
        tokenEndpoint,
        issuerUrl: payload.issuerUrl,
        scopes: payload.scopes,
        authMethod: 'external_idp',
        kiroProvider: 'Entra',
        account: payload.account,
      }), { fetchFn: this.fetchFn })
    } else {
      session = await refreshKiroSocial(kiroSession({
        refreshToken: validateKiroRefreshToken(raw),
        authMethod: 'social',
        kiroProvider: 'Social',
        account: payload.account,
      }), { fetchFn: this.fetchFn })
    }
    await saveSession('kiro', session, this.authPath)
    this.lastError.delete('kiro')
    await this.#discoverKiro(session)
    this.onAuthChanged?.('kiro')
    void this.quota.refresh('kiro')
    return { method: session.authMethod, account: publicSession('kiro', session), count: 1 }
  }

  async #saveKiroImports(sessions, { refreshMissingAccess = false } = {}) {
    this.claim('kiro')
    this.flows.pending('kiro')?.cancel()
    this.kiroFlows.pending('kiro')?.cancel()
    const saved = []
    const errors = []
    for (const draft of sessions) {
      let session = draft
      const method = canonicalizeKiroMethod(session.authMethod, { tokenEndpoint: session.tokenEndpoint })
      const needsRefresh = refreshMissingAccess
        && method !== 'api_key'
        && (!session.accessToken || session.accessToken === session.refreshToken)
      try {
        if (needsRefresh) session = await refreshKiro(session, { fetchFn: this.fetchFn })
        await saveSession('kiro', session, this.authPath, { activate: saved.length === 0 })
        saved.push(session)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }
    if (saved.length === 0) {
      throw new Error(errors[0] || 'no Kiro credentials imported')
    }
    this.lastError.delete('kiro')
    if (saved[0]) await this.#discoverKiro(saved[0])
    this.onAuthChanged?.('kiro')
    void this.quota.refresh('kiro')
    return {
      method: saved[0]?.authMethod,
      account: publicSession('kiro', saved[0]),
      count: saved.length,
    }
  }

  async manual(provider, input) {
    const attempt = this.flows.pending(provider)
    if (attempt === undefined) throw new Error(`no ${provider} login attempt is in progress`)
    attempt.manual(input)
  }

  async cancel(provider) {
    this.claim(provider)
    this.flows.pending(provider)?.cancel()
    this.devices.pending(provider)?.cancel()
    this.glmFlows.pending(provider)?.cancel()
    this.kiroFlows.pending(provider)?.cancel()
    this.cursorFlows.pending(provider)?.cancel()
  }

  async logout(provider, id) {
    this.claim(provider)
    this.flows.pending(provider)?.cancel()
    this.devices.pending(provider)?.cancel()
    this.glmFlows.pending(provider)?.cancel()
    this.kiroFlows.pending(provider)?.cancel()
    this.cursorFlows.pending(provider)?.cancel()
    await deleteSession(provider, this.authPath, id)
    this.lastError.delete(provider)
    this.quota.clear(provider, id)
    this.onAuthChanged?.(provider)
    if (await getSession(provider, this.authPath)) void this.#ensureAccountQuota(provider)
  }

  async switchAccount(provider, id) {
    await switchAccount(provider, id, this.authPath)
    this.lastError.delete(provider)
    this.onAuthChanged?.(provider)
    return this.snapshot()
  }

  async importFrom(provider) {
    const result = provider === 'opencode'
      ? await this.#importOpencode()
      : provider === 'codex'
      ? await importCodexAuth()
      : provider === 'glm'
        ? await importGlmAuth()
        : provider === 'kiro'
          ? await importKiroAuth()
        : provider === 'antigravity'
          ? await importAntigravityAuth({ fetchFn: this.fetchFn })
          : provider === 'cursor'
            ? await this.#importCursor()
          : provider === 'ollama'
            ? await this.#importOllama()
          : provider === 'kimi'
            ? await this.#importKimi()
          : provider === 'copilot'
            ? await this.#importCopilot()
          : await importGrokAuth()
    this.claim(provider)
    this.flows.pending(provider)?.cancel()
    this.devices.pending(provider)?.cancel()
    this.glmFlows.pending(provider)?.cancel()
    this.kiroFlows.pending(provider)?.cancel()
    this.cursorFlows.pending(provider)?.cancel()
    const sessions = provider === 'kiro' && Array.isArray(result.sessions) && result.sessions.length > 0
      ? result.sessions
      : [result.session]
    for (let i = 0; i < sessions.length; i++) {
      await saveSession(provider, sessions[i], this.authPath, { activate: i === 0 })
    }
    this.lastError.delete(provider)
    if (provider === 'cursor') await this.#discoverCursor(sessions[0])
    if (provider === 'ollama') await this.#discoverOllama(sessions[0])
    if (provider === 'kiro') await this.#discoverKiro(sessions[0])
    if (provider === 'kimi') await this.#discoverKimi(sessions[0])
    if (provider === 'copilot') await this.#discoverCopilot(sessions[0])
    this.onAuthChanged?.(provider)
    void this.quota.refresh(provider)
    return {
      source: result.source,
      account: publicSession(provider, sessions[0]),
      count: sessions.length,
    }
  }

  async setModels(payload = {}) {
    await this.models.ready
    const catalog = this.catalog()
    if (Array.isArray(payload.selected)) {
      await this.models.setEnabled(payload.selected, catalog)
    } else if (typeof payload.key === 'string') {
      await this.models.toggle(payload.key, payload.on !== false, catalog)
    } else if (payload.family === 'codex' || payload.family === 'grok' || payload.family === 'glm' || payload.family === 'kiro' || payload.family === 'antigravity' || payload.family === 'cursor' || payload.family === 'ollama' || payload.family === 'kimi' || payload.family === 'opencode' || payload.family === 'copilot') {
      await this.models.setFamily(payload.family, payload.on !== false, catalog)
    } else if (typeof payload.all === 'boolean') {
      await this.models.setAll(payload.all, catalog)
    } else {
      throw new Error('models payload needs selected, key, family, or all')
    }
    if (this.settings && typeof this.settings.mutate === 'function') {
      // Picker already wrote the switch; do not re-enable a deliberate 全关.
      // Mutate failures must reach the RPC so the picker can show them.
      await this.sync(undefined, { recover: false })
    }
    return this.snapshot()
  }

  async sync(selected, options = {}) {
    await this.#forgetAnonymousOpencode()
    await this.#maybeAutoImportOpencode()
    if (this.settings === undefined || typeof this.settings.mutate !== 'function') {
      throw new Error('settings service is not mounted; cannot sync llm-pi-ai routes')
    }
    await this.models.ready
    const catalog = this.catalog()
    if (selected !== undefined) {
      await this.models.setEnabled(selected, catalog)
    }
    const loggedIn = await this.loggedIn()
    if (options.recover !== false && selected === undefined) {
      await this.models.recoverEmptyLoggedInFamilies(catalog, loggedIn)
    }
    return syncHarnessModels({
      settings: this.settings,
      prefix: this.prefix,
      origin: this.origin(),
      loggedIn,
      selected: this.models.selectedForSync(catalog),
      cursorModels: cursorCatalogModels(),
      ollamaModels: ollamaCatalogModels(),
      kiroModels: kiroCatalogModels(),
      kimiModels: kimiCatalogModels(),
      opencodeModels: opencodeCatalogModels(),
      copilotModels: copilotCatalogModels(),
    })
  }
}
