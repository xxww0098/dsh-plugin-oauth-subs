/**
 * Auth controller behind the Settings page RPC: owns the per-family token
 * managers, quota store and flow managers, builds the Settings snapshot, and
 * syncs routes to the host. The work behind each entry point lives in plain
 * functions that take the controller: login.ts (flows, keys, imports),
 * account-quota.ts, self-update.ts, account-marks.ts, and each family's
 * accounts.ts (auto-import, identity, catalog discovery, login completion).
 */

import { dirname, join } from 'node:path'
import { OAuthFlowManager } from './flow.js'
import { DeviceFlowManager } from './grok/device-flow.js'
import { GlmCliFlowManager } from './glm/cli-flow.js'
import { KiroIdcFlowManager } from './kiro/idc-flow.js'
import {
  accountIdOf,
  deleteSession,
  getSession,
  listStoredSessions,
  PROVIDER_IDS,
  publicSession,
  switchAccount,
} from './store.js'
import { CODEX_PERMANENT_REFRESH_CODES, refreshCodex } from './codex/index.js'
import { refreshGrok } from './grok/index.js'
import { GLM_MODELS, refreshGlm } from './glm/index.js'
import { refreshKiro } from './kiro/index.js'
import { ANTIGRAVITY_PREEMPT_MS, refreshAntigravity } from './antigravity/index.js'
import { codexImported } from './import-auth.js'
import { CursorPollFlowManager } from './cursor/pkce-flow.js'
import { refreshCursor } from './cursor/index.js'
import { cursorImported } from './cursor/import.js'
import { cursorCatalogModels, refreshCursorCatalog } from './cursor/catalog.js'
import { refreshOllama } from '../apikey/ollama/index.js'
import { ollamaCatalogModels, refreshOllamaCatalog } from '../apikey/ollama/catalog.js'
import { refreshCommandCode } from '../apikey/command-code/index.js'
import { commandCodeCatalogModels } from '../apikey/command-code/catalog.js'
import { catalogPricing, catalogRateTimeOfDay } from '../catalog/index.js'
import { kiroCatalogModels, refreshKiroCatalog } from './kiro/catalog.js'
import { configureKimiIdentity, refreshKimi } from './kimi/index.js'
import { kimiImported } from './kimi/import.js'
import { kimiCatalogModels, refreshKimiCatalog } from './kimi/catalog.js'
import { refreshCopilot } from './copilot/index.js'
import { copilotCatalogModels, refreshCopilotCatalog } from './copilot/catalog.js'
import { refreshDevin } from './devin/index.js'
import { devinCatalogModels, refreshDevinCatalog } from './devin/catalog.js'
import { refreshCline } from './cline/index.js'
import { clineCatalogModels, refreshClineCatalog } from './cline/catalog.js'
import { clineImported } from './cline/import.js'
import { devinUserStatus } from './devin/transport.js'
import { opencodeGoFilePath, OpencodeGoStore } from '../apikey/opencode-go/store.js'
import {
  APIKEY_FAMILY_IDS,
  buildProviders,
  catalogProviders,
  describeCatalog,
  describeProviders,
  MODEL_FAMILY_IDS,
} from './models.js'
import { ensureOpencodeGoRoute, filterProviders, syncHarnessModels } from './harness-sync.js'
import { ModelSwitch } from './model-switch.js'
import { TokenManager } from './tokens.js'
import { QuotaStore } from './quota.js'
import { DEFAULT_PROFILE, installRelease, localUpdateInfo } from '../utils/update.js'
import { readUpdatePrefs, readUpdateState, updatePrefsPath, updateStatePath } from '../utils/update-prefs.js'
import { outboundFetch } from '../utils/outbound.js'
import { completeCommandCode, maybeAutoImportCommandCode } from '../apikey/command-code/accounts.js'
import { discoverOllama, maybeAutoImportOllama } from '../apikey/ollama/accounts.js'
import {
  clearOpencodeGo,
  hasOpencodeGoKey,
  logoutOpencodeGo,
  opencodeGoSnapshot,
  refreshOpencodeGoQuota,
  saveOpencodeGo,
  switchOpencodeGo,
} from '../apikey/opencode-go/accounts.js'
import { markSignedOut } from './account-marks.js'
import { accountsWithQuota, consumeReset, ensureAccountQuota, refreshQuota } from './account-quota.js'
import { completeClineDevice, discoverCline, maybeAutoImportCline } from './cline/accounts.js'
import { discoverChatgpt, revokeChatgptAccounts } from './chatgpt/accounts.js'
import { CHATGPT_PERMANENT_REFRESH_CODES, CHATGPT_PREEMPT_MS, refreshChatgpt } from './chatgpt/index.js'
import { chatgptCatalogModels, refreshChatgptCatalog } from './chatgpt/catalog.js'
import { completeCopilotDevice, discoverCopilot, maybeAutoImportCopilot } from './copilot/accounts.js'
import {
  completeCursor,
  discoverCursor,
  maybeAutoImportCursor,
  resolveCursorIdentities,
} from './cursor/accounts.js'
import { discoverDevin, maybeAutoImportDevin } from './devin/accounts.js'
import { completeGlm, resolveGlmIdentities } from './glm/accounts.js'
import { completeKimiDevice, discoverKimi, maybeAutoImportKimi } from './kimi/accounts.js'
import { completeKiroIdc, discoverKiro } from './kiro/accounts.js'
import { completeDevice, completePkce, importFrom, login, useKey } from './login.js'
import {
  checkUpdate,
  runAutoUpdate,
  setAutoUpdate,
  startAutoUpdateWatch,
  stopAutoUpdateWatch,
} from './self-update.js'

/** How often the background sweep re-checks stored credential expiry. */
export const TOKEN_SWEEP_INTERVAL_MS = 60_000

export class AuthController {
  // JS-style fields: each is assigned in the constructor below, or — for the
  // outbound-proxy pair — wired on by src/index.ts. `declare` keeps these
  // type-only, so the emitted JavaScript is byte-identical to before.
  declare authPath: string
  declare prefix: string
  declare origin: () => string
  declare settings: any
  declare credentials: any
  declare grokLogin: string
  declare profile: string
  declare patchPath: string | undefined
  declare readFileFn: any
  declare updateEnv: any
  declare onAuthChanged: ((provider?: string) => void) | undefined
  declare models: ModelSwitch
  declare flows: OAuthFlowManager
  declare devices: DeviceFlowManager
  declare glmFlows: GlmCliFlowManager
  declare kiroFlows: KiroIdcFlowManager
  declare cursorFlows: CursorPollFlowManager
  declare cursorAutoImport: boolean
  declare cursorImport: any
  declare cursorAutoImportTried: boolean
  declare cursorDiscover: any
  declare ollamaAutoImport: boolean
  declare ollamaAutoImportTried: boolean
  declare ollamaDiscover: any
  declare kiroDiscover: any
  declare kimiAutoImport: boolean
  declare kimiAutoImportTried: boolean
  declare kimiDiscover: any
  declare copilotAutoImport: boolean
  declare copilotAutoImportTried: boolean
  declare copilotDiscover: any
  declare devinAutoImport: boolean
  declare devinImport: any
  declare devinAutoImportTried: boolean
  declare devinDiscover: any
  declare clineDiscover: any
  declare chatgptDiscover: any
  declare clineAutoImport: boolean
  declare clineAutoImportTried: boolean
  declare commandCodeAutoImport: boolean
  declare commandCodeAutoImportTried: boolean
  declare commandCodeImport: any
  declare lastError: Map<string, any>
  declare finalizing: Set<string>
  declare claims: Map<string, number>
  declare tokens: Record<string, TokenManager>
  declare quota: QuotaStore
  identityTried = new Map<string, number>()
  #snapshotRun: Promise<Record<string, any>> | undefined
  #revalidateQuotaNext = false
  declare fetchFn: any
  declare opencodeGo: any
  declare opencodeGoAdopted: boolean
  declare tokenSweepTimer: any
  declare outboundProxy: any
  declare setOutboundProxy: any
  declare usage: any
  declare installReleaseFn: any
  declare autoUpdate: boolean
  declare updateState: any
  declare prefsReady: Promise<void>
  declare autoUpdateTimer: any
  declare prefsFile: string
  declare stateFile: string
  constructor({ authPath, prefix, origin, settings, patchPath, credentials, grokLogin = 'device', onAuthChanged, models, fetchFn = outboundFetch, quotaTtlMs, profile, readFileFn, updateEnv, installReleaseFn = installRelease, cursorAutoImport, cursorImport, cursorDiscover, ollamaAutoImport, ollamaDiscover, kiroDiscover, kimiAutoImport, kimiDiscover, copilotAutoImport, copilotDiscover, devinAutoImport, devinImport, devinDiscover, clineDiscover, clineAutoImport, commandCodeAutoImport, commandCodeImport, chatgptDiscover }: any) {
    this.authPath = authPath
    this.prefix = prefix
    this.origin = origin
    this.settings = settings
    this.patchPath = patchPath
    this.credentials = credentials
    this.grokLogin = grokLogin
    this.profile = profile || DEFAULT_PROFILE
    this.readFileFn = readFileFn
    this.updateEnv = updateEnv
    this.installReleaseFn = installReleaseFn
    this.prefsFile = updatePrefsPath(authPath)
    this.stateFile = updateStatePath(authPath)
    this.prefsReady = Promise.all([
      readUpdatePrefs(this.prefsFile),
      readUpdateState(this.stateFile),
    ]).then(([prefs, state]) => {
      this.autoUpdate = prefs.autoUpdate
      this.updateState = state
    })
    // Any login-state change re-arms the throttled identity discovery.
    this.onAuthChanged = (provider) => {
      this.identityTried.clear()
      onAuthChanged?.(provider)
    }
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
    this.copilotAutoImport = copilotAutoImport ?? !process.env.NODE_TEST_CONTEXT
    this.copilotAutoImportTried = false
    this.copilotDiscover = typeof copilotDiscover === 'function'
      ? copilotDiscover
      : (process.env.NODE_TEST_CONTEXT ? undefined : ((session) => refreshCopilotCatalog(session, { fetchFn })))
    this.devinAutoImport = devinAutoImport ?? !process.env.NODE_TEST_CONTEXT
    this.devinImport = devinImport && typeof devinImport === 'object' ? devinImport : {}
    this.devinAutoImportTried = false
    this.devinDiscover = typeof devinDiscover === 'function'
      ? devinDiscover
      : (process.env.NODE_TEST_CONTEXT ? undefined : ((session) => refreshDevinCatalog(session, { fetchFn })))
    this.chatgptDiscover = typeof chatgptDiscover === 'function'
      ? chatgptDiscover
      : (process.env.NODE_TEST_CONTEXT ? undefined : ((session) => refreshChatgptCatalog(session, { fetchFn })))
    this.clineDiscover = typeof clineDiscover === 'function'
      ? clineDiscover
      : (process.env.NODE_TEST_CONTEXT ? undefined : ((session) => refreshClineCatalog(session, { fetchFn })))
    this.clineAutoImport = clineAutoImport ?? !process.env.NODE_TEST_CONTEXT
    this.clineAutoImportTried = false
    // The Command Code CLI's auth.json is its only credential store — harvest
    // it once like cursor's IDE import, so an installed CLI means instant login.
    this.commandCodeAutoImport = commandCodeAutoImport ?? !process.env.NODE_TEST_CONTEXT
    this.commandCodeImport = commandCodeImport && typeof commandCodeImport === 'object' ? commandCodeImport : {}
    this.commandCodeAutoImportTried = false
    configureKimiIdentity(typeof authPath === 'string' ? dirname(authPath) : undefined)
    this.lastError = new Map()
    this.finalizing = new Set()
    this.claims = new Map()
    this.tokens = {
      codex: new TokenManager({
        displayName: 'ChatGPT (Codex)',
        preemptMs: 5 * 60_000,
        provider: 'codex',
        authPath: this.authPath,
        refresh: (session) => refreshCodex(session, fetchFn),
        permanentCodes: CODEX_PERMANENT_REFRESH_CODES,
        imported: codexImported,
        onRemoved: () => this.onAuthChanged?.('codex'),
      }),
      chatgpt: new TokenManager({
        displayName: 'ChatGPT (Sign in with ChatGPT)',
        preemptMs: CHATGPT_PREEMPT_MS,
        provider: 'chatgpt',
        authPath: this.authPath,
        refresh: (session) => refreshChatgpt(session, fetchFn),
        permanentCodes: CHATGPT_PERMANENT_REFRESH_CODES,
        onRemoved: () => this.onAuthChanged?.('chatgpt'),
      }),
      grok: new TokenManager({
        displayName: 'Grok (Subscription)',
        preemptMs: 2 * 60_000,
        provider: 'grok',
        authPath: this.authPath,
        refresh: (session) => refreshGrok(session, fetchFn),
        onRemoved: () => this.onAuthChanged?.('grok'),
      }),
      glm: new TokenManager({
        displayName: 'GLM (Coding Plan)',
        preemptMs: 24 * 60 * 60_000,
        provider: 'glm',
        authPath: this.authPath,
        refresh: refreshGlm,
        onRemoved: () => this.onAuthChanged?.('glm'),
      }),
      kiro: new TokenManager({
        displayName: 'Kiro',
        preemptMs: 2 * 60_000,
        provider: 'kiro',
        authPath: this.authPath,
        refresh: (session) => refreshKiro(session, { fetchFn }),
        onRemoved: () => this.onAuthChanged?.('kiro'),
      }),
      antigravity: new TokenManager({
        displayName: 'Antigravity',
        preemptMs: ANTIGRAVITY_PREEMPT_MS,
        provider: 'antigravity',
        authPath: this.authPath,
        refresh: (session) => refreshAntigravity(session, fetchFn),
        onRemoved: () => this.onAuthChanged?.('antigravity'),
      }),
      cursor: new TokenManager({
        displayName: 'Cursor',
        preemptMs: 5 * 60_000,
        provider: 'cursor',
        authPath: this.authPath,
        refresh: (session) => refreshCursor(session, fetchFn),
        imported: cursorImported(this.cursorImport),
        onRemoved: () => this.onAuthChanged?.('cursor'),
      }),
      ollama: new TokenManager({
        displayName: 'Ollama Cloud',
        preemptMs: 24 * 60 * 60_000,
        provider: 'ollama',
        authPath: this.authPath,
        refresh: refreshOllama,
        onRemoved: () => this.onAuthChanged?.('ollama'),
      }),
      kimi: new TokenManager({
        displayName: 'Kimi (Code Plan)',
        preemptMs: 2 * 60_000,
        provider: 'kimi',
        authPath: this.authPath,
        refresh: (session) => refreshKimi(session, fetchFn),
        imported: kimiImported,
        onRemoved: () => this.onAuthChanged?.('kimi'),
      }),
      copilot: new TokenManager({
        displayName: 'GitHub Copilot',
        preemptMs: 2 * 60_000,
        provider: 'copilot',
        authPath: this.authPath,
        refresh: (session) => refreshCopilot(session, fetchFn),
        onRemoved: () => this.onAuthChanged?.('copilot'),
      }),
      devin: new TokenManager({
        displayName: 'Devin Agent',
        preemptMs: 5 * 60_000,
        provider: 'devin',
        authPath: this.authPath,
        refresh: (session) => refreshDevin(session, { fetchFn, statusFn: devinUserStatus }),
        onRemoved: () => this.onAuthChanged?.('devin'),
      }),
      cline: new TokenManager({
        displayName: 'Cline',
        preemptMs: 5 * 60_000,
        provider: 'cline',
        authPath: this.authPath,
        refresh: (session) => refreshCline(session, fetchFn),
        imported: clineImported,
        onRemoved: () => this.onAuthChanged?.('cline'),
      }),
      'command-code': new TokenManager({
        displayName: 'Command Code',
        preemptMs: 24 * 60 * 60_000,
        provider: 'command-code',
        authPath: this.authPath,
        refresh: refreshCommandCode,
        onRemoved: () => this.onAuthChanged?.('command-code'),
      }),
    }
    this.quota = new QuotaStore({
      tokens: this.tokens,
      fetchFn,
      ttlMs: quotaTtlMs,
      snapshotPath: typeof authPath === 'string' && authPath ? join(dirname(authPath), 'quota-snapshot.json') : undefined,
    })
    this.fetchFn = fetchFn
    this.opencodeGo = (typeof authPath === 'string' && authPath)
      ? new OpencodeGoStore({ path: opencodeGoFilePath(authPath), fetchFn })
      : undefined
    this.opencodeGoAdopted = false
  }

  claim(provider) {
    const next = (this.claims.get(provider) ?? 0) + 1
    this.claims.set(provider, next)
    return next
  }

  async loggedIn() {
    return {
      codex: (await getSession('codex', this.authPath)) !== undefined,
      chatgpt: (await getSession('chatgpt', this.authPath)) !== undefined,
      grok: (await getSession('grok', this.authPath)) !== undefined,
      glm: (await getSession('glm', this.authPath)) !== undefined,
      kiro: (await getSession('kiro', this.authPath)) !== undefined,
      antigravity: (await getSession('antigravity', this.authPath)) !== undefined,
      cursor: (await getSession('cursor', this.authPath)) !== undefined,
      ollama: (await getSession('ollama', this.authPath)) !== undefined,
      kimi: (await getSession('kimi', this.authPath)) !== undefined,
      copilot: (await getSession('copilot', this.authPath)) !== undefined,
      devin: (await getSession('devin', this.authPath)) !== undefined,
      cline: (await getSession('cline', this.authPath)) !== undefined,
      'command-code': (await getSession('command-code', this.authPath)) !== undefined,
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

  async #glmModels() {
    void (await getSession('glm', this.authPath))
    return GLM_MODELS
  }

  async catalog() {
    // Un-overridden build: describeCatalog applies `contexts` itself so rows
    // keep their catalog default and ceiling next to the effective window,
    // and setContext can cap edits at the row's own maximum.
    return catalogProviders({
      prefix: this.prefix,
      origin: this.origin(),
      cursorModels: cursorCatalogModels(),
      ollamaModels: ollamaCatalogModels(),
      kiroModels: kiroCatalogModels(),
      kimiModels: kimiCatalogModels(),
      copilotModels: copilotCatalogModels(),
      devinModels: devinCatalogModels(),
      clineModels: clineCatalogModels(),
      chatgptModels: chatgptCatalogModels(),
      commandCodeModels: commandCodeCatalogModels(),
      glmModels: await this.#glmModels(),
    })
  }

  /**
   * Startup discovery for every signed-in family with a live catalog. The
   * picker otherwise keeps the static floor until someone logs in or hits
   * quota refresh, which is how region-gated / retired rows stay offered.
   * Re-syncs once if any family's picker rows changed.
   */
  async warmCatalogs() {
    const warmers: Array<[string, any, () => any[], (session: any) => any]> = [
      ['cursor', this.tokens.cursor, cursorCatalogModels, (session) => discoverCursor(this, session)],
      ['ollama', this.tokens.ollama, ollamaCatalogModels, (session) => discoverOllama(this, session)],
      ['kiro', this.tokens.kiro, kiroCatalogModels, (session) => discoverKiro(this, session)],
      ['kimi', this.tokens.kimi, kimiCatalogModels, (session) => discoverKimi(this, session)],
      ['copilot', this.tokens.copilot, copilotCatalogModels, (session) => discoverCopilot(this, session)],
      ['devin', this.tokens.devin, devinCatalogModels, (session) => discoverDevin(this, session)],
      ['cline', this.tokens.cline, clineCatalogModels, (session) => discoverCline(this, session)],
      ['chatgpt', this.tokens.chatgpt, chatgptCatalogModels, (session) => discoverChatgpt(this, session)],
    ]
    const idsOf = (read) => read().map((model) => model.id).join('\0')
    const before = new Map(warmers.map(([family, , read]) => [family, idsOf(read)]))
    await Promise.all(warmers.map(async ([, tokens, , discover]) => {
      if (!tokens) return
      let session
      try {
        session = await tokens.session()
      } catch {
        return // not signed in
      }
      await discover(session)
    }))
    const changed = warmers.some(([family, , read]) => idsOf(read) !== before.get(family))
    if (changed && this.settings) await this.sync().catch(() => undefined)
  }

  /**
   * RPC payload for the Settings page. The Settings half is a classic script
   * that reads this as plain JSON. Leaving the return type to inference made
   * the emitted `snapshot` / `switchAccount` / `setModels` declarations ~25k
   * lines each (they all return this method), roughly doubling the published
   * `lib/`. The callers are untyped on purpose — do not "restore" the inferred
   * type without re-checking `lib/` size.
   */
  snapshot(fresh = false, opts: { revalidateQuota?: boolean } = {}): Promise<Record<string, any>> {
    // Concurrent polls share one build; cleared on settle so a failure never
    // pins. A post-mutation caller passes `fresh` so it never joins a build
    // that started before its write — later polls join the fresh one.
    // `revalidateQuota` is sticky on purpose: the page sends it when the user
    // (re)enters the quota view, and if a build is already running the flag
    // survives until the next build picks it up — at most one poll later.
    if (opts.revalidateQuota) this.#revalidateQuotaNext = true
    if (fresh || !this.#snapshotRun) {
      const run = this.#buildSnapshot().finally(() => {
        if (this.#snapshotRun === run) this.#snapshotRun = undefined
      })
      this.#snapshotRun = run
    }
    return this.#snapshotRun
  }

  async #buildSnapshot(): Promise<Record<string, any>> {
    const revalidateQuota = this.#revalidateQuotaNext
    this.#revalidateQuotaNext = false
    await this.models.ready
    await this.prefsReady
    await resolveGlmIdentities(this)
    await maybeAutoImportCursor(this)
    await resolveCursorIdentities(this)
    await maybeAutoImportOllama(this)
    await maybeAutoImportKimi(this)
    await maybeAutoImportCopilot(this)
    await maybeAutoImportDevin(this)
    await maybeAutoImportCline(this)
    await maybeAutoImportCommandCode(this)
    const loggedIn = await this.loggedIn()
    const origin = this.origin()
    const opencodeGoApiKeySet = await hasOpencodeGoKey(this)
    const glmModels = await this.#glmModels()
    const catalog = catalogProviders({
      prefix: this.prefix,
      origin,
      cursorModels: cursorCatalogModels(),
      ollamaModels: ollamaCatalogModels(),
      kiroModels: kiroCatalogModels(),
      kimiModels: kimiCatalogModels(),
      copilotModels: copilotCatalogModels(),
      devinModels: devinCatalogModels(),
      clineModels: clineCatalogModels(),
      chatgptModels: chatgptCatalogModels(),
      glmModels,
    })
    const selected = this.models.selectedForSync(catalog)
    const providers = filterProviders(buildProviders({
      prefix: this.prefix,
      origin,
      loggedIn,
      contexts: this.models.contexts,
      cursorModels: cursorCatalogModels(),
      ollamaModels: ollamaCatalogModels(),
      kiroModels: kiroCatalogModels(),
      kimiModels: kimiCatalogModels(),
      copilotModels: copilotCatalogModels(),
      devinModels: devinCatalogModels(),
      clineModels: clineCatalogModels(),
      chatgptModels: chatgptCatalogModels(),
      commandCodeModels: commandCodeCatalogModels(),
      glmModels,
    }), selected)
    // Every family at once: the cold read is the slowest upstream, not the sum.
    await Promise.all(PROVIDER_IDS.map((family) => (loggedIn[family] ? ensureAccountQuota(this, family, revalidateQuota) : this.quota.clear(family))))
    const enabledKeys = this.models.enabledKeys(catalog)
    const opencodeGo = await this.opencodeGoSnapshot()
    const [codexAccounts, chatgptAccounts, grokAccounts, glmAccounts, kiroAccounts, antigravityAccounts, cursorAccounts, ollamaAccounts, kimiAccounts, copilotAccounts, devinAccounts, clineAccounts, commandCodeAccounts] = await Promise.all([
      accountsWithQuota(this, 'codex'),
      accountsWithQuota(this, 'chatgpt'),
      accountsWithQuota(this, 'grok'),
      accountsWithQuota(this, 'glm'),
      accountsWithQuota(this, 'kiro'),
      accountsWithQuota(this, 'antigravity'),
      accountsWithQuota(this, 'cursor'),
      accountsWithQuota(this, 'ollama'),
      accountsWithQuota(this, 'kimi'),
      accountsWithQuota(this, 'copilot'),
      accountsWithQuota(this, 'devin'),
      accountsWithQuota(this, 'cline'),
      accountsWithQuota(this, 'command-code'),
    ])
    return {
      origin,
      profile: this.profile,
      grokLogin: this.grokLogin,
      catalog: describeCatalog(catalog, {
        enabledKeys,
        contexts: this.models.contexts,
        rates: Object.fromEntries(kiroCatalogModels().filter((model: any) => model.rate).map((model: any) => [`kiro/${model.id}`, model.rate])),
        pricing: catalogPricing(),
        pricingTimeOfDay: catalogRateTimeOfDay(),
        loggedIn: {
          ...loggedIn,
          ...Object.fromEntries(APIKEY_FAMILY_IDS.map((family) => [family, opencodeGoApiKeySet])),
        },
      }),
      providers: describeProviders(providers),
      selected: enabledKeys,
      efforts: { ...this.models.efforts },
      accounts: {
        codex: { ...(await this.status('codex')), activeId: codexAccounts.find((row) => row.active)?.id, accounts: codexAccounts },
        chatgpt: { ...(await this.status('chatgpt')), activeId: chatgptAccounts.find((row) => row.active)?.id, accounts: chatgptAccounts },
        grok: { ...(await this.status('grok')), activeId: grokAccounts.find((row) => row.active)?.id, accounts: grokAccounts },
        glm: { ...(await this.status('glm')), activeId: glmAccounts.find((row) => row.active)?.id, accounts: glmAccounts },
        kiro: { ...(await this.status('kiro')), activeId: kiroAccounts.find((row) => row.active)?.id, accounts: kiroAccounts },
        antigravity: { ...(await this.status('antigravity')), activeId: antigravityAccounts.find((row) => row.active)?.id, accounts: antigravityAccounts },
        cursor: { ...(await this.status('cursor')), activeId: cursorAccounts.find((row) => row.active)?.id, accounts: cursorAccounts },
        ollama: { ...(await this.status('ollama')), activeId: ollamaAccounts.find((row) => row.active)?.id, accounts: ollamaAccounts },
        kimi: { ...(await this.status('kimi')), activeId: kimiAccounts.find((row) => row.active)?.id, accounts: kimiAccounts },
        copilot: { ...(await this.status('copilot')), activeId: copilotAccounts.find((row) => row.active)?.id, accounts: copilotAccounts },
        devin: { ...(await this.status('devin')), activeId: devinAccounts.find((row) => row.active)?.id, accounts: devinAccounts },
        cline: { ...(await this.status('cline')), activeId: clineAccounts.find((row) => row.active)?.id, accounts: clineAccounts },
        'command-code': { ...(await this.status('command-code')), activeId: commandCodeAccounts.find((row) => row.active)?.id, accounts: commandCodeAccounts },
        'opencode-go': opencodeGo,
      },
      opencodeGo,
      update: localUpdateInfo(process.platform, {
        profile: this.profile,
        env: this.updateEnv ?? process.env,
        readFileFn: this.readFileFn,
      }),
      autoUpdate: this.autoUpdate === true,
      autoUpdateState: this.updateState,
    }
  }

  opencodeGoSnapshot(options?) {
    return opencodeGoSnapshot(this, options)
  }

  saveOpencodeGo(payload?: any) {
    return saveOpencodeGo(this, payload)
  }

  switchOpencodeGo(id) {
    return switchOpencodeGo(this, id)
  }

  logoutOpencodeGo(id) {
    return logoutOpencodeGo(this, id)
  }

  clearOpencodeGo(field, id) {
    return clearOpencodeGo(this, field, id)
  }

  refreshOpencodeGoQuota(id) {
    return refreshOpencodeGoQuota(this, id)
  }

  refreshQuota(provider, accountId?) {
    return refreshQuota(this, provider, accountId)
  }

  consumeReset(provider, accountId, creditId?) {
    return consumeReset(this, provider, accountId, creditId)
  }

  checkUpdate(payload?: any) {
    return checkUpdate(this, payload)
  }

  setAutoUpdate(payload?: any) {
    return setAutoUpdate(this, payload)
  }

  runAutoUpdate() {
    return runAutoUpdate(this)
  }

  startAutoUpdateWatch(options?) {
    return startAutoUpdateWatch(this, options)
  }

  stopAutoUpdateWatch() {
    return stopAutoUpdateWatch(this)
  }

  /**
   * Background credential sweep — CLIProxyAPI's authAutoRefreshLoop shape.
   * TokenManager refreshes lazily on request; without a sweep the first call
   * after an idle stretch pays the refresh RTT, and a refresh token that died
   * while idle only surfaces mid-request. Each family's own preemptMs decides
   * whether a stored login is due, so the sweep stays provider-agnostic.
   */
  startTokenSweep({ intervalMs = TOKEN_SWEEP_INTERVAL_MS } = {}) {
    if (this.tokenSweepTimer) return
    void this.sweepTokensOnce()
    this.tokenSweepTimer = setInterval(() => void this.sweepTokensOnce(), intervalMs)
    this.tokenSweepTimer.unref?.()
  }

  stopTokenSweep() {
    if (!this.tokenSweepTimer) return
    clearInterval(this.tokenSweepTimer)
    this.tokenSweepTimer = undefined
  }

  async sweepTokensOnce() {
    for (const provider of PROVIDER_IDS) {
      const manager = this.tokens[provider]
      if (!manager) continue
      let rows
      try {
        rows = await listStoredSessions(provider, this.authPath)
      } catch {
        continue
      }
      for (const row of rows) {
        if (!row) continue
        // account() refreshes only inside the family's preempt window; a
        // transient failure serves the still-valid token instead of throwing.
        await manager.account(row.id).catch(() => undefined)
      }
    }
  }

  login(provider, options) {
    return login(this, provider, options)
  }

  completePkce(provider, attempt, claim) {
    return completePkce(this, provider, attempt, claim)
  }

  completeKimiDevice(attempt) {
    return completeKimiDevice(this, attempt)
  }

  completeClineDevice(attempt) {
    return completeClineDevice(this, attempt)
  }

  completeCopilotDevice(attempt) {
    return completeCopilotDevice(this, attempt)
  }

  completeDevice(provider, attempt) {
    return completeDevice(this, provider, attempt)
  }

  completeGlm(attempt) {
    return completeGlm(this, attempt)
  }

  completeCursor(attempt) {
    return completeCursor(this, attempt)
  }

  completeKiroIdc(attempt) {
    return completeKiroIdc(this, attempt)
  }

  completeCommandCode(attempt, claim) {
    return completeCommandCode(this, attempt, claim)
  }

  useKey(provider, key, extra) {
    return useKey(this, provider, key, extra)
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
    if (provider === 'opencode-go') return this.logoutOpencodeGo(id)
    this.claim(provider)
    this.flows.pending(provider)?.cancel()
    this.devices.pending(provider)?.cancel()
    this.glmFlows.pending(provider)?.cancel()
    this.kiroFlows.pending(provider)?.cancel()
    this.cursorFlows.pending(provider)?.cancel()
    // Sign in with ChatGPT: end the renewable session remotely first (siwc
    // profiles-and-sessions); an unconfirmed revocation still signs out.
    const revoked = provider === 'chatgpt' ? await revokeChatgptAccounts(this, id) : true
    await deleteSession(provider, this.authPath, id)
    await markSignedOut(this, provider)
    this.lastError.delete(provider)
    if (!revoked) {
      this.lastError.set(provider, 'Signed out locally. Remote revocation could not be confirmed; disconnect the app in ChatGPT Settings → Apps.')
    }
    this.quota.clear(provider, id)
    this.onAuthChanged?.(provider)
    if (await getSession(provider, this.authPath)) void ensureAccountQuota(this, provider)
  }

  async switchAccount(provider, id) {
    if (provider === 'opencode-go') {
      await this.switchOpencodeGo(id)
      return this.snapshot(true)
    }
    await switchAccount(provider, id, this.authPath)
    this.lastError.delete(provider)
    this.onAuthChanged?.(provider)
    return this.snapshot(true)
  }

  importFrom(provider) {
    return importFrom(this, provider)
  }

  async setModels(payload: any = {}) {
    await this.models.ready
    const catalog = await this.catalog()
    if (Array.isArray(payload.selected)) {
      await this.models.setEnabled(payload.selected, catalog)
    } else if (payload.resetContexts === true) {
      // 恢复默认窗口: drop every custom input-context override at once.
      await this.models.resetContexts()
    } else if (typeof payload.contextKey === 'string') {
      // Custom input-context window (null resets to the catalog default);
      // not an enable choice, so selectionExplicit stays as it was.
      await this.models.setContext(payload.contextKey, payload.context ?? null, catalog)
    } else if (typeof payload.key === 'string') {
      await this.models.toggle(payload.key, payload.on !== false, catalog)
    } else if (MODEL_FAMILY_IDS.includes(payload.family)) {
      await this.models.setFamily(payload.family, payload.on !== false, catalog)
    } else if (typeof payload.all === 'boolean') {
      await this.models.setAll(payload.all, catalog)
    } else if ('effort' in payload) {
      // Default effort for `families` (null clears); no families = every family (全部).
      await this.models.setEffort(payload.effort, payload.families ?? undefined)
    } else {
      throw new Error('models payload needs selected, key, family, all, or effort')
    }
    // A context override on a disabled row only persists to models.json —
    // filterProviders drops it from the route write, so syncing would
    // produce a byte-identical settings file while paying a seconds-long
    // host reconcile. The override lands the next time the row is enabled.
    const dormantContextEdit = typeof payload.contextKey === 'string'
      && !this.models.isEnabled(payload.contextKey)
    if (!dormantContextEdit && this.settings && typeof this.settings.mutate === 'function') {
      // Picker already wrote the switch; do not re-enable a deliberate 全关.
      // Mutate failures must reach the RPC so the picker can show them.
      await this.sync(undefined, { recover: false })
    }
    return this.snapshot(true)
  }

  async sync(selected?, options: any = {}) {
    if (this.settings === undefined || typeof this.settings.mutate !== 'function') {
      throw new Error('settings service is not mounted; cannot sync llm-pi-ai routes')
    }
    await this.models.ready
    const catalog = await this.catalog()
    if (selected !== undefined) {
      await this.models.setEnabled(selected, catalog)
    }
    const loggedIn = await this.loggedIn()
    if (options.recover !== false && selected === undefined) {
      await this.models.recoverEmptyLoggedInFamilies(catalog, loggedIn)
    }
    const opencodeGoKeySet = await hasOpencodeGoKey(this)
    // Planned only: its writes ride the family-route mutate below, so one sync
    // costs the host one llm-pi-ai reconcile (a few seconds), not two.
    const { mutations: opencodeGoMutations = [], ...opencodeGoRoute } = await ensureOpencodeGoRoute(this.settings, {
      selected: this.models.selectedForSync(catalog),
      apiKeySet: opencodeGoKeySet,
      contexts: this.models.contexts,
      efforts: this.models.efforts,
      apply: false,
    })
    if (opencodeGoKeySet && opencodeGoRoute.status !== 'pending' && opencodeGoRoute.status !== 'present') {
      throw new Error(`OpenCode Go model sync failed: ${opencodeGoRoute.status}`)
    }
    const synced = await syncHarnessModels({
      settings: this.settings,
      patchPath: this.patchPath,
      prefix: this.prefix,
      origin: this.origin(),
      loggedIn,
      selected: this.models.selectedForSync(catalog),
      contexts: this.models.contexts,
      efforts: this.models.efforts,
      cursorModels: cursorCatalogModels(),
      ollamaModels: ollamaCatalogModels(),
      kiroModels: kiroCatalogModels(),
      kimiModels: kimiCatalogModels(),
      copilotModels: copilotCatalogModels(),
      devinModels: devinCatalogModels(),
      clineModels: clineCatalogModels(),
      chatgptModels: chatgptCatalogModels(),
      commandCodeModels: commandCodeCatalogModels(),
      glmModels: await this.#glmModels(),
      extraMutations: opencodeGoMutations,
    })
    return { ...synced, opencodeGoRoute: opencodeGoMutations.length ? { ...opencodeGoRoute, status: 'written' } : opencodeGoRoute }
  }
}
