/**
 * dsh-plugin-oauth-subs host half.
 *
 * A Cordis plugin (export apply + inject + Config) that:
 *   1. runs a loopback OpenAI Responses proxy on 127.0.0.1:<port>
 *   2. drives ChatGPT Codex PKCE, xAI Grok device-code / PKCE,
 *      Zhipu GLM Z.ai / BigModel CLI-poll, AWS Kiro (Social / Builder ID /
 *      IdC / Entra / API key), Google Antigravity, Cursor, Ollama Cloud,
 *      Kimi Code Plan, GitHub Copilot, and Devin Agent logins
 *   3. syncs logged-in catalogs into llm-pi-ai
 *
 * The client half (左侧栏面板：插件按钮下方的订阅入口 →
 * 额度/模型/设置工作台) is discovered from package.json `dsh.client` —
 * this module only owns the node process.
 */

import { mkdir, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { describeError } from './utils/http.js'
import { AuthController } from './oauth/controller.js'
import { authFilePath, defaultDataDir, readPrivateText, writePrivateText } from './oauth/store.js'
import { createProxy } from './oauth/proxy.js'
import { OAUTH_CREDENTIAL_REF, familyOfProvider } from './oauth/models.js'
import { ModelSwitch } from './oauth/model-switch.js'
import { configureCursorUpstreamProxy } from './oauth/cursor/index.js'
import { clearCursorH2Pool } from './oauth/cursor/upstream-proxy.js'
import { setUpstreamLog } from './oauth/upstream.js'
import { setPrefixEstimateLog } from './oauth/kiro/cache.js'
import { dshHome, profileFromBaseUrl } from './utils/update.js'
import { configureOutbound, outboundProxyPath } from './utils/outbound.js'
import { donateQr } from './utils/donate.js'
import { readUsage } from './utils/usage.js'

const USAGE_MEMO_MS = 5 * 60_000
const HOST_DEEPSEEK = new Set(['deepseek-official', 'deepseek-account'])

export const name = 'dsh-plugin-oauth-subs'
export const inject = ['settings', 'credentials']

/** Schemastery Standard Schema — Cordis reads Config["~standard"].validate. */
export const Config = z.object({
  port: z.number().default(8318).description('Loopback proxy port'),
  provider: z.string().default('oauth').description('llm-pi-ai route id prefix'),
  dataDir: z.string().required(false).description('Override the auth/proxy data directory'),
  grokLogin: z.union(['device', 'pkce']).default('device')
    .description('Grok login: device-code (default) or PKCE loopback'),
  proxyUrl: z.string().required(false)
    .description('Outbound HTTP(S) proxy for model/quota/login hops. Empty uses Settings or HTTPS_PROXY/HTTP_PROXY/ALL_PROXY'),
  cursorProxy: z.string().required(false)
    .description('Cursor upstream proxy (http:// or socks5://) for region-gated Claude/GPT/Gemini'),
})

function resolveDataDir(ctx, config) {
  if (typeof config.dataDir === 'string' && config.dataDir.trim()) return config.dataDir.trim()
  // Cordis forbids undeclared service reads (`ctx.loader` / `ctx.baseDir`).
  // dsh-app-boot sets ctx.baseUrl to the profile directory as a file URL.
  const baseUrl = ctx.baseUrl
  if (typeof baseUrl === 'string' && baseUrl.startsWith('file:')) {
    try {
      return join(fileURLToPath(baseUrl), 'data', 'dsh-plugin-oauth-subs')
    } catch {
      // fall through to the home fallback
    }
  }
  return defaultDataDir()
}

async function ensureApiKey(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await chmod(dir, 0o700)
  const path = join(dir, 'proxy-key')
  const saved = await readPrivateText(path, 'oauth-subs proxy key')
  if (saved !== undefined) {
    const existing = saved.trim()
    if (existing.length >= 16) return existing
  }
  const key = randomBytes(24).toString('base64url')
  await writePrivateText(path, `${key}\n`)
  return key
}

async function rememberCredential(ctx, key) {
  if (ctx.credentials && typeof ctx.credentials.set === 'function') {
    await ctx.credentials.set(OAUTH_CREDENTIAL_REF, key)
    return
  }
  if (!process.env[OAUTH_CREDENTIAL_REF]) process.env[OAUTH_CREDENTIAL_REF] = key
}

/** DSH `rpc.handle` does `owner.webServer.register` with `owner = this.ctx`.
 * Cordis traces the service so `this.ctx` is a shadow of the *providing*
 * fiber (client-connection), which does not inject `webServer`. Rebind to
 * the caller scope that actually injects it. */
function rpcFrom(scope) {
  const traced = scope.connection
  if (!traced) return undefined
  const original = traced[Symbol.for('cordis.original')]
  if (original && original !== traced) {
    const bound = Object.create(original)
    bound.ctx = scope
    return bound.rpc
  }
  return traced.rpc
}

export function registerRpc(ctx, controller) {
  const methods = {
    status: (payload) => controller.snapshot(payload?.fresh === true, { revalidateQuota: payload?.revalidateQuota === true }),
    login: (payload) => controller.login(payload?.provider, payload),
    key: (payload) => controller.useKey(payload?.provider, payload?.key, payload),
    manual: (payload) => controller.manual(payload?.provider, payload?.input),
    cancel: (payload) => controller.cancel(payload?.provider),
    logout: (payload) => controller.logout(payload?.provider, payload?.id),
    switch: (payload) => controller.switchAccount(payload?.provider, payload?.id),
    import: (payload) => controller.importFrom(payload?.provider),
    sync: (payload) => controller.sync(payload?.selected),
    models: (payload) => controller.setModels(payload ?? {}),
    quota: (payload) => controller.refreshQuota(payload?.provider, payload?.id),
    goSave: (payload) => controller.saveOpencodeGo(payload ?? {}),
    goClear: (payload) => controller.clearOpencodeGo(payload?.field, payload?.id),
    reset: (payload) => controller.consumeReset(payload?.provider, payload?.id, payload?.credit),
    update: (payload) => controller.checkUpdate(payload),
    autoUpdate: (payload) => controller.setAutoUpdate(payload),
    proxyGet: () => controller.outboundProxy(),
    proxySet: (payload) => controller.setOutboundProxy(payload),
    donate: () => donateQr(),
    usage: (payload) => controller.usage(payload),
  }

  const dispatch = async (endpoint, payload) => {
    const raw = String(endpoint ?? '')
    const method = raw.startsWith('oauth-subs-auth/')
      ? raw.slice('oauth-subs-auth/'.length)
      : raw
    const fn = methods[method]
    if (typeof fn !== 'function') {
      return {
        ok: false,
        error: { code: 'unknown-command', message: `unknown oauth-subs method ${endpoint}`, details: {} },
      }
    }
    try {
      return { ok: true, value: await fn(payload ?? {}) }
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'internal',
          message: error instanceof Error ? error.message : String(error),
          details: {},
        },
      }
    }
  }

  const readConnection = (holder) => {
    if (!holder) return undefined
    try {
      if (typeof holder.get === 'function') {
        const found = holder.get('connection')
        if (found) return found
      }
    } catch {
      // Cordis throws when the service is not injected on this fiber.
    }
    try {
      return holder.connection
    } catch {
      return undefined
    }
  }

  let fetchMounted = false
  const mountFetchRoutes = (connection) => {
    if (fetchMounted) return true
    const fetchApi = connection?.fetch
    if (typeof fetchApi?.register !== 'function') return false
    for (const name of Object.keys(methods)) {
      fetchApi.register({
        path: `/api/oauth-subs-auth/${name}`,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          let body: any = {}
          try {
            body = await request.json()
          } catch {
            body = {}
          }
          // The route path already pins the method: never let the request body
          // re-target the dispatch table. Otherwise any registered path (e.g.
          // .../status) could invoke privileged methods such as key, logout,
          // proxySet, import or reset.
          const result = await dispatch(name, body?.payload)
          return new Response(JSON.stringify({
            type: 'server-response',
            rpcId: body?.rpcId,
            result,
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        },
      })
    }
    fetchMounted = true
    return true
  }

  // Web host: rpc.handle needs webServer. Electron desktop disables that
  // row, so this callback never runs there.
  ctx.inject(['connection', 'webServer'], (scope) => {
    const rpc = rpcFrom(scope)
    if (typeof rpc?.handle !== 'function') {
      ctx.logger?.warn?.('dsh-plugin-oauth-subs: connection.rpc.handle is unavailable')
    } else {
      try {
        rpc.handle('/oauth-subs-auth', async (endpoint, payload) => dispatch(endpoint, payload))
      } catch (error) {
        ctx.logger?.warn?.(
          `dsh-plugin-oauth-subs: failed to register /oauth-subs-auth: ${error instanceof Error ? error.message : error}`,
        )
      }
    }
    mountFetchRoutes(readConnection(scope) ?? readConnection(ctx))
  })

  // Desktop host (and any composition without webServer): exact POST routes
  // under the shared /api channel. ctx.inject(['connection']) may not fire
  // here — read the service directly and retry until it appears.
  const tryMountFetch = () => mountFetchRoutes(readConnection(ctx))
  if (!tryMountFetch()) {
    try {
      ctx.inject(['connection'], (scope) => {
        mountFetchRoutes(readConnection(scope) ?? readConnection(ctx))
      })
    } catch {
      // inject list rejected on this fiber
    }
    if (!fetchMounted) {
      let attempts = 0
      const timer = setInterval(() => {
        attempts += 1
        if (tryMountFetch() || attempts >= 50) clearInterval(timer)
      }, 100)
      timer.unref?.()
      try {
        ctx.effect?.(() => () => clearInterval(timer), 'dsh-plugin-oauth-subs: wait for connection.fetch')
      } catch {
        // best-effort cleanup
      }
    }
  }
}

export function apply(ctx, config: any = {}) {
  const port = Number(config.port ?? 8318)
  const prefix = String(config.provider ?? 'oauth').trim() || 'oauth'
  const grokLogin = config.grokLogin === 'pkce' ? 'pkce' : 'device'
  configureCursorUpstreamProxy(config.cursorProxy)
  // Config change re-applies the plugin: its pooled h2 sessions go with the old config.
  ctx.effect(() => clearCursorH2Pool, 'dsh-plugin-oauth-subs: cursor h2 pool')
  const dataDir = resolveDataDir(ctx, config)
  const authPath = authFilePath(dataDir)
  const models = new ModelSwitch({
    path: join(dataDir, 'models.json'),
  })
  setUpstreamLog(join(dataDir, 'upstream.log'))
  setPrefixEstimateLog(join(dataDir, 'prefix-estimate.jsonl'))

  const outbound = configureOutbound({
    path: outboundProxyPath(dataDir),
    configUrl: config.proxyUrl,
  })
  let patchPath: string | undefined
  try {
    if (typeof ctx.baseUrl === 'string' && ctx.baseUrl.startsWith('file:')) {
      patchPath = join(fileURLToPath(ctx.baseUrl), 'cordis.patch.yml')
    }
  } catch { /* no profile patch addressable */ }

  const controller = new AuthController({
    authPath,
    prefix,
    origin: () => proxy.origin(),
    settings: ctx.settings,
    patchPath,
    credentials: ctx.credentials,
    grokLogin,
    models,
    onAuthChanged: () => {
      controller.sync().catch((error) => {
        ctx.logger?.warn?.(`dsh-plugin-oauth-subs: llm-pi-ai sync failed: ${error.message}`)
      })
    },
    profile: profileFromBaseUrl(ctx.baseUrl),
  })

  controller.outboundProxy = async () => {
    if (outbound.ready) await outbound.ready
    return outbound.snapshot()
  }
  controller.setOutboundProxy = async (payload: any = {}) => {
    if (outbound.ready) await outbound.ready
    return outbound.setUrl(payload?.url)
  }
  // This plugin's routes, keyed by family, plus the host's own DeepSeek
  // providers (`deepseek-official` / `deepseek-account`, built into DSH's
  // llm-deepseek) as `deepseek`; other providers are not ours to report.
  // Memoized as long as the page keeps its copy: re-entering the tab never
  // starts a scan; `fresh` (the page's 刷新) always does.
  let usageMemo: { at: number, rows: any[] } | undefined
  controller.usage = async (payload: any = {}) => {
    if (payload?.fresh !== true && usageMemo && Date.now() - usageMemo.at < USAGE_MEMO_MS) return usageMemo
    const rows = await readUsage({ root: join(dshHome(), 'sessions'), cachePath: join(dataDir, 'usage-cache.json') })
    usageMemo = {
      at: Date.now(),
      rows: rows.flatMap(([hour, provider, ...rest]) => {
        const family = HOST_DEEPSEEK.has(provider) ? 'deepseek'
          : provider.startsWith('opencode-go') ? 'opencode-go'
            : provider.startsWith(`${prefix}-`) ? familyOfProvider(provider) : provider
        return family === provider ? [] : [[hour, family, ...rest]]
      }),
    }
    return usageMemo
  }
  const snapshot = controller.snapshot.bind(controller)
  controller.snapshot = async (fresh = false) => {
    const view = await snapshot(fresh)
    if (outbound.ready) await outbound.ready
    return { ...view, proxy: outbound.snapshot() }
  }

  let proxy
  ctx.effect(() => {
    let closed = false
    void (async () => {
      try {
        const apiKey = await ensureApiKey(dataDir)
        await rememberCredential(ctx, apiKey)
        await models.ready
        await outbound.ready
        if (closed) return
        proxy = createProxy({
          port,
          apiKey,
          tokens: controller.tokens,
          // Chat traffic shortens that account's quota freshness (no fetch here).
          onQuotaUsed: (family) => { void controller.quota?.touch?.(family).catch(() => undefined) },
        })
        await proxy.listen()
        ctx.logger?.info?.(`dsh-plugin-oauth-subs: proxy on ${proxy.origin()}`)
        await controller.sync().catch((error) => {
          ctx.logger?.warn?.(`dsh-plugin-oauth-subs: llm-pi-ai sync failed: ${error.message}`)
        })
        // Live catalogs refresh on login / quota refresh only; without this
        // warmup the picker keeps the static floor until the next manual
        // refresh (e.g. offering region-gated Cursor rows that cannot run).
        void controller.warmCatalogs().catch(() => undefined)
      } catch (error) {
        if (!closed) ctx.logger?.error?.(`dsh-plugin-oauth-subs: failed to start: ${describeError(error)}`)
      }
    })()
    // The outbound agent is the proxy's own transport: it closes after the proxy
    // has drained, not beside it (cordis runs every cleanup at once, and a request
    // in flight at a reload keeps its socket to this instance). Not awaited, so a
    // long stream never holds the reload — the new instance takes the port at once.
    return () => {
      closed = true
      void controller.quota?.flush?.()
      void (proxy?.close() ?? Promise.resolve()).finally(() => outbound.close())
    }
  }, 'dsh-plugin-oauth-subs: local responses proxy + outbound agent')

  registerRpc(ctx, controller)

  ctx.effect(() => {
    controller.startTokenSweep()
    return () => controller.stopTokenSweep()
  }, 'dsh-plugin-oauth-subs: token refresh sweep')

  ctx.effect(() => {
    controller.startAutoUpdateWatch()
    return () => controller.stopAutoUpdateWatch()
  }, 'dsh-plugin-oauth-subs: auto-update watch')
}

export {
  CODEX_CLIENT_ID,
  CODEX_AUTHORIZE_URL,
  CODEX_TOKEN_URL,
  CODEX_API_URL,
  CODEX_ORIGINATOR,
  CODEX_USER_AGENT,
  codexCredentialHeaders,
} from './oauth/codex/index.js'
export {
  GROK_CLIENT_ID,
  GROK_DISCOVERY_URL,
  GROK_API_URL,
  GROK_USER_AGENT,
  GROK_LARGE_CONTEXT,
  GROK_47_CONTEXT,
  GROK_REASONING_45,
  GROK_REASONING_46,
  GROK_REASONING_47,
  GROK_FAST_MODEL_IDS,
  grokCredentialHeaders,
} from './oauth/grok/index.js'
export {
  GLM_CLIENT_ID,
  GLM_CODING_URL,
  GLM_AUTHORIZE_URL,
  GLM_APP_VERSION,
  GLM_USER_AGENT,
  glmDesktopHeaders,
  glmUpstreamHeaders,
} from './oauth/glm/index.js'
export {
  KIRO_PORTAL_URL,
  KIRO_MODELS,
  kiroUsageHeaders,
  kiroSession,
} from './oauth/kiro/index.js'
export {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_API_URL,
  ANTIGRAVITY_STREAM_URL,
  antigravityRequestUserAgent,
  antigravityChatHeaders,
} from './oauth/antigravity/index.js'
export {
  CURSOR_CLIENT_VERSION,
  CURSOR_MODELS,
  cursorChatHeaders,
  cursorSession,
} from './oauth/cursor/index.js'
export {
  OLLAMA_MODELS,
  OLLAMA_CHAT_URL,
  ollamaSession,
  ollamaUpstreamHeaders,
} from './apikey/ollama/index.js'
export {
  KIMI_CLIENT_ID,
  KIMI_MODELS,
  KIMI_CHAT_URL,
  kimiSession,
  kimiUpstreamHeaders,
} from './oauth/kimi/index.js'
export {
  COPILOT_CLIENT_ID,
  COPILOT_MODELS,
  copilotChatUrl,
  copilotSession,
  copilotUpstreamHeaders,
} from './oauth/copilot/index.js'
export {
  DEVIN_MODELS,
  DEVIN_AUTHORIZE_URL,
  DEVIN_TOKEN_URL,
  devinSession,
  normalizeDevinToken,
} from './oauth/devin/index.js'
export {
  CLINE_MODELS,
  CLINE_API_BASE,
  CLINE_CHAT_URL,
  CLINE_WORKOS_CLIENT_ID,
  clineDeviceSpec,
  clineSessionFromAuthData,
  clineUpstreamHeaders,
  refreshCline,
} from './oauth/cline/index.js'
export { OAUTH_CREDENTIAL_REF } from './oauth/models.js'
export { ModelSwitch } from './oauth/model-switch.js'
export { defaultDataDir } from './oauth/store.js'
export { AuthController } from './oauth/controller.js'
export { applyFastMode, modelSupportsFastMode } from './utils/fast-mode.js'
export {
  CONTEXT_VARIANT_SUFFIX,
  codexMaxContextWindow,
  applyContextMode,
  isCodex900kBase,
  peelContextSuffix,
} from './utils/context-mode.js'
export { parseCodexUsage, parseResetCredits } from './oauth/codex/quota.js'
export { parseGrokBilling } from './oauth/grok/quota.js'
export { parseGlmQuota, parseGlmResetCards } from './oauth/glm/quota.js'
export { parseKiroUsage } from './oauth/kiro/quota.js'
export { parseCursorPeriodUsage } from './oauth/cursor/quota.js'
export { parseKimiUsage } from './oauth/kimi/quota.js'
export { parseCopilotUsage } from './oauth/copilot/quota.js'
export { parseDevinUserStatus } from './oauth/devin/quota.js'
export { QuotaStore } from './oauth/quota.js'
export { fetchClineQuota, parseClineBalance, parseClinePlan, parseClineUsage } from './oauth/cline/quota.js'
export { formatPlanLabel, CODEX_PLAN_NAMES } from './oauth/plan.js'
export {
  REPO_URL,
  REPO_SLUG,
  installedVersion,
  fresherVersion,
  fetchLatest,
  localUpdateInfo,
  profileFromBaseUrl,
  isElectronManagedProfile,
  pluginUpdateCommand,
} from './utils/update.js'
