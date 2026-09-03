/**
 * Auth controller behind the Settings page RPC.
 * Codex PKCE (+ paste callback + import), Grok device-code (primary) + PKCE fallback.
 */

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
import { fetchLatest, localUpdateInfo, runPluginUpdate, DEFAULT_PROFILE } from '../utils/update.js'

export class AuthController {
  constructor({ authPath, prefix, origin, settings, grokLogin = 'device', onAuthChanged, models, fetchFn = fetch, quotaTtlMs, spawnFn, profile, cursorAutoImport, cursorImport, cursorDiscover }) {
    this.authPath = authPath
    this.prefix = prefix
    this.origin = origin
    this.settings = settings
    this.grokLogin = grokLogin
    this.spawnFn = spawnFn
    this.profile = profile || DEFAULT_PROFILE
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

  async snapshot() {
    await this.models.ready
    await this.#resolveGlmIdentities()
    await this.#maybeAutoImportCursor()
    await this.#resolveCursorIdentities()
    const loggedIn = await this.loggedIn()
    const origin = this.origin()
    const catalog = catalogProviders({ prefix: this.prefix, origin, cursorModels: cursorCatalogModels() })
    const selected = this.models.selectedForSync(catalog)
    const providers = filterProviders(buildProviders({
      prefix: this.prefix,
      origin,
      loggedIn,
      cursorModels: cursorCatalogModels(),
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
    const enabledKeys = this.models.enabledKeys(catalog)
    const [codexAccounts, grokAccounts, glmAccounts, kiroAccounts, antigravityAccounts, cursorAccounts] = await Promise.all([
      this.#accountsWithQuota('codex'),
      this.#accountsWithQuota('grok'),
      this.#accountsWithQuota('glm'),
      this.#accountsWithQuota('kiro'),
      this.#accountsWithQuota('antigravity'),
      this.#accountsWithQuota('cursor'),
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
      },
      update: localUpdateInfo(),
    }
  }

  async refreshQuota(provider, accountId) {
    if (provider === 'codex' || provider === 'grok' || provider === 'glm' || provider === 'kiro' || provider === 'antigravity' || provider === 'cursor') {
      const rows = await this.#liveAccounts(provider)
      const targets = accountId
        ? rows.filter((row) => row.id === accountId)
        : rows
      if (accountId && targets.length === 0) throw new Error(`${provider} account ${accountId} is not signed in`)
      if (targets.length === 0) return this.quota.peek(provider)
      await Promise.all(targets.map((row) => this.quota.refresh(provider, row.id, row.session)))
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
      if (accountId) return this.quota.peek(provider, accountId)
      const active = rows.find((row) => row.active)
      return this.quota.peek(provider, active?.id)
    }
    const [codex, grok, glm, kiro, antigravity, cursor] = await Promise.all([
      this.refreshQuota('codex'),
      this.refreshQuota('grok'),
      this.refreshQuota('glm'),
      this.refreshQuota('kiro'),
      this.refreshQuota('antigravity'),
      this.refreshQuota('cursor'),
    ])
    return { codex, grok, glm, kiro, antigravity, cursor }
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
    try {
      const info = await fetchLatest({ fetchFn: this.fetchFn, platform: process.platform })
      if (!apply || info.status !== 'update') {
        return { ...info, apply: { status: 'none' } }
      }
      const result = await runPluginUpdate({
        spawnFn: this.spawnFn,
        profile: this.profile,
      })
      if (result.ok) {
        return { ...info, apply: { status: 'installed', restart: true, command: result.command } }
      }
      return {
        ...info,
        apply: { status: result.status, error: result.error, command: result.command },
      }
    } catch (error) {
      return {
        ...localUpdateInfo(),
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
    const email = pickCursorHumanAccount(quota.account)
    const planType = typeof quota.planType === 'string' && quota.planType.trim() ? quota.planType.trim() : undefined
    if (!email && !planType) return
    if ((!email || row.session.account === email) && (!planType || row.session.planType === planType)) return
    const next = { ...row.session }
    if (email) next.account = email
    if (planType) next.planType = planType
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
    if (provider !== 'glm') throw new Error('only GLM and Kiro accept a pasted key')
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
    const result = provider === 'codex'
      ? await importCodexAuth()
      : provider === 'glm'
        ? await importGlmAuth()
        : provider === 'kiro'
          ? await importKiroAuth()
        : provider === 'antigravity'
          ? await importAntigravityAuth({ fetchFn: this.fetchFn })
          : provider === 'cursor'
            ? await this.#importCursor()
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
    } else if (payload.family === 'codex' || payload.family === 'grok' || payload.family === 'glm' || payload.family === 'kiro' || payload.family === 'antigravity' || payload.family === 'cursor') {
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
    })
  }
}
