/**
 * dsh-plugin-oauth-subs host half.
 *
 * A Cordis plugin (export apply + inject + Config) that:
 *   1. runs a loopback OpenAI Responses proxy on 127.0.0.1:<port>
 *   2. drives ChatGPT Codex PKCE, xAI Grok device-code / PKCE, and
 *      Zhipu GLM Z.ai / BigModel CLI-poll logins
 *   3. syncs logged-in catalogs into llm-pi-ai
 *
 * The client half (Settings > OAuth 订阅) is discovered from package.json
 * `dsh.client` — this module only owns the node process.
 */

import { mkdir, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { AuthController } from './oauth/controller.js'
import { authFilePath, defaultDataDir, readPrivateText, writePrivateText } from './oauth/store.js'
import { createProxy } from './oauth/proxy.js'
import { OAUTH_CREDENTIAL_REF, ModelSwitch } from './oauth/models.js'

export const name = 'dsh-plugin-oauth-subs'
export const inject = ['settings', 'credentials']

/** Schemastery Standard Schema — Cordis reads Config["~standard"].validate. */
export const Config = z.object({
  port: z.number().default(8318).description('Loopback proxy port'),
  provider: z.string().default('oauth').description('llm-pi-ai route id prefix'),
  dataDir: z.string().required(false).description('Override the auth/proxy data directory'),
  grokLogin: z.union(['device', 'pkce']).default('device')
    .description('Grok login: device-code (default) or PKCE loopback'),
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

function registerRpc(ctx, controller) {
  ctx.inject(['connection'], (scope) => {
    const rpc = scope.get('connection')?.rpc
    if (typeof rpc?.handle !== 'function') {
      ctx.logger?.warn?.('dsh-plugin-oauth-subs: connection.rpc.handle is unavailable')
      return
    }
    const methods = {
      status: () => controller.snapshot(),
      login: (payload) => controller.login(payload?.provider, payload?.mode ?? payload?.region),
      key: (payload) => controller.useKey(payload?.provider, payload?.key, payload?.region ?? payload?.mode),
      manual: (payload) => controller.manual(payload?.provider, payload?.input),
      cancel: (payload) => controller.cancel(payload?.provider),
      logout: (payload) => controller.logout(payload?.provider, payload?.id),
      switch: (payload) => controller.switchAccount(payload?.provider, payload?.id),
      import: (payload) => controller.importFrom(payload?.provider),
      sync: (payload) => controller.sync(payload?.selected),
      models: (payload) => controller.setModels(payload ?? {}),
      quota: (payload) => controller.refreshQuota(payload?.provider),
      reset: (payload) => controller.consumeReset(payload?.provider),
      update: () => controller.checkUpdate(),
    }
    return rpc.handle('/oauth-subs-auth', async (endpoint, payload) => {
      const fn = methods[endpoint]
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
    }, { authority: 'loopback' })
  })
}

export function apply(ctx, config = {}) {
  const port = Number(config.port ?? 8318)
  const prefix = String(config.provider ?? 'oauth').trim() || 'oauth'
  const grokLogin = config.grokLogin === 'pkce' ? 'pkce' : 'device'
  const dataDir = resolveDataDir(ctx, config)
  const authPath = authFilePath(dataDir)
  const models = new ModelSwitch({
    path: join(dataDir, 'models.json'),
  })

  const controller = new AuthController({
    authPath,
    prefix,
    origin: () => proxy.origin(),
    settings: ctx.settings,
    grokLogin,
    models,
    onAuthChanged: () => {
      controller.sync().catch((error) => {
        ctx.logger?.warn?.(`dsh-plugin-oauth-subs: llm-pi-ai sync failed: ${error.message}`)
      })
    },
  })

  let proxy
  ctx.effect(() => {
    let closed = false
    void (async () => {
      try {
        const apiKey = await ensureApiKey(dataDir)
        await rememberCredential(ctx, apiKey)
        await models.ready
        proxy = createProxy({
          port,
          apiKey,
          tokens: controller.tokens,
        })
        await proxy.listen()
        ctx.logger?.info?.(`dsh-plugin-oauth-subs: proxy on ${proxy.origin()}`)
        await controller.sync().catch((error) => {
          ctx.logger?.warn?.(`dsh-plugin-oauth-subs: llm-pi-ai sync failed: ${error.message}`)
        })
      } catch (error) {
        if (!closed) ctx.logger?.error?.(`dsh-plugin-oauth-subs: failed to start: ${error.message}`)
      }
    })()
    return () => {
      closed = true
      void proxy?.close()
    }
  }, 'dsh-plugin-oauth-subs: local responses proxy')

  registerRpc(ctx, controller)
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
  GROK_CONTEXT_WINDOW,
  GROK_LARGE_CONTEXT,
  GROK_REASONING_45,
  GROK_REASONING_46,
  grokCredentialHeaders,
} from './oauth/grok/index.js'
export {
  GLM_CLIENT_ID,
  GLM_CODING_URL,
  GLM_AUTHORIZE_URL,
  glmUpstreamHeaders,
} from './oauth/glm/index.js'
export { OAUTH_CREDENTIAL_REF, ModelSwitch } from './oauth/models.js'
export { defaultDataDir } from './oauth/store.js'
export { AuthController } from './oauth/controller.js'
export { applyFastMode, modelSupportsFastMode } from './utils/fast-mode.js'
export {
  CONTEXT_VARIANT_SUFFIX,
  codexLargeContext,
  applyContextMode,
  isCodex900kBase,
  peelContextSuffix,
} from './utils/context-mode.js'
export { parseCodexUsage, parseGrokBilling, parseGlmQuota, parseResetCredits, QuotaStore } from './oauth/quota.js'
export { formatPlanLabel, CODEX_PLAN_NAMES } from './oauth/plan.js'
export {
  REPO_URL,
  REPO_SLUG,
  installedVersion,
  fetchLatest,
  localUpdateInfo,
} from './utils/update.js'
