import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { codexSession } from '../lib/oauth/codex/index.js'
import { GROK_CLIENT_ID } from '../lib/oauth/grok/index.js'
import {
  GROK_HERMES_KEYS,
  glmAuthSearchPaths,
  glmKeyCandidateFromZcodeConfig,
  glmKeyFromZcodeConfig,
  glmKeyFromZcodeCredentials,
  importGlmAuth,
  importGrokAuth,
  tokensFromGrokCli,
  tokensFromHermes,
} from '../lib/oauth/import-auth.js'

function jwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.x`
}

function grokAccess(extra = {}) {
  return jwt({
    exp: Math.floor(Date.now() / 1000) + 3600,
    tier: 4,
    email: 'cli@x.ai',
    ...extra,
  })
}

test('codexSession accepts Codex CLI token files (expires_in + id_token claims)', () => {
  const idToken = jwt({
    email: 'plus@example.com',
    'https://api.openai.com/auth': {
      chatgpt_account_id: 'org-1',
      chatgpt_plan_type: 'plus',
    },
  })
  const session = codexSession({
    access_token: jwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    refresh_token: 'refresh',
    expires_in: 3600,
    id_token: idToken,
  })
  assert.equal(session.accountId, 'org-1')
  assert.equal(session.emailAddress, 'plus@example.com')
  assert.equal(session.planType, 'plus')
})

test('tokensFromGrokCli reads issuer::client_id map with key + RFC3339 expires_at', () => {
  const access = grokAccess()
  const tokens = tokensFromGrokCli({
    [`https://auth.x.ai::${GROK_CLIENT_ID}`]: {
      key: access,
      refresh_token: 'rt-cli',
      expires_at: '2029-01-01T00:00:00.000000000Z',
      auth_mode: 'oidc',
      email: 'cli@x.ai',
      oidc_issuer: 'https://auth.x.ai',
      oidc_client_id: GROK_CLIENT_ID,
    },
  })
  assert.equal(tokens.access_token, access)
  assert.equal(tokens.refresh_token, 'rt-cli')
  assert.equal(tokens.account, 'cli@x.ai')
  assert.equal(tokens.token_endpoint, 'https://auth.x.ai/oauth2/token')
  assert.equal(tokens.client_id, GROK_CLIENT_ID)
  assert.ok(tokens.expires_in > 60)
})

test('tokensFromGrokCli reads nested issuer → client_id map', () => {
  const access = grokAccess()
  const tokens = tokensFromGrokCli({
    'https://auth.x.ai': {
      [GROK_CLIENT_ID]: {
        key: access,
        refresh_token: 'rt-nested',
        expires_at: Math.floor(Date.now() / 1000) + 7200,
        auth_mode: 'oauth',
        email: 'nested@x.ai',
      },
    },
  })
  assert.equal(tokens.refresh_token, 'rt-nested')
  assert.equal(tokens.account, 'nested@x.ai')
})

test('tokensFromGrokCli skips api_key entries and prefers OAuth', () => {
  const access = grokAccess()
  assert.equal(tokensFromGrokCli({
    'xai::api_key': { key: 'xai-abc', auth_mode: 'api_key' },
  }), undefined)

  const tokens = tokensFromGrokCli({
    'xai::api_key': { key: 'xai-abc', auth_mode: 'api_key' },
    [`https://auth.x.ai::${GROK_CLIENT_ID}`]: {
      key: access,
      refresh_token: 'rt-oauth',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      auth_mode: 'oidc',
    },
  })
  assert.equal(tokens.refresh_token, 'rt-oauth')
  assert.equal(tokens.access_token, access)
})

test('tokensFromHermes reads xai-oauth (not the xai API-key provider)', () => {
  const tokens = tokensFromHermes({
    providers: {
      xai: { api_key: 'xai-not-oauth' },
      'xai-oauth': {
        tokens: {
          access_token: 'hermes-access',
          refresh_token: 'hermes-refresh',
          expires_in: 2400,
        },
        last_refresh: new Date().toISOString(),
        discovery: { token_endpoint: 'https://auth.x.ai/oauth2/token' },
      },
    },
  }, GROK_HERMES_KEYS)
  assert.equal(tokens.access_token, 'hermes-access')
  assert.equal(tokens.refresh_token, 'hermes-refresh')
  assert.equal(tokens.token_endpoint, 'https://auth.x.ai/oauth2/token')
  assert.equal(tokens.expires_in, 2400)
})

test('tokensFromHermes falls back to grok-oauth alias and credential_pool', () => {
  const fromAlias = tokensFromHermes({
    providers: {
      'grok-oauth': { access_token: 'alias-a', refresh_token: 'alias-r' },
    },
  }, GROK_HERMES_KEYS)
  assert.equal(fromAlias.access_token, 'alias-a')

  const fromPool = tokensFromHermes({
    providers: {},
    credential_pool: {
      'xai-oauth': [{ access_token: 'pool-a', refresh_token: 'pool-r', expires_at: Date.now() / 1000 + 1800 }],
    },
  }, GROK_HERMES_KEYS)
  assert.equal(fromPool.access_token, 'pool-a')
  assert.ok(fromPool.expires_at)
})

test('importGrokAuth reads Grok CLI ~/.grok/auth.json first', async () => {
  const root = await mkdtemp(join(tmpdir(), 'grok-import-'))
  const grokDir = join(root, '.grok')
  await mkdir(grokDir)
  const access = grokAccess({ email: 'from-jwt@x.ai' })
  const grokPath = join(grokDir, 'auth.json')
  await writeFile(grokPath, JSON.stringify({
    [`https://auth.x.ai::${GROK_CLIENT_ID}`]: {
      key: access,
      refresh_token: 'rt-file',
      expires_at: Math.floor(Date.now() / 1000) + 5400,
      auth_mode: 'oidc',
      email: 'file@x.ai',
      oidc_issuer: 'https://auth.x.ai',
      oidc_client_id: GROK_CLIENT_ID,
    },
  }))
  const result = await importGrokAuth([grokPath, join(root, '.hermes', 'auth.json')])
  assert.equal(result.source, grokPath)
  assert.equal(result.session.refreshToken, 'rt-file')
  assert.equal(result.session.account, 'file@x.ai')
  assert.equal(result.session.tokenEndpoint, 'https://auth.x.ai/oauth2/token')
  assert.equal(result.session.clientId, GROK_CLIENT_ID)
  assert.ok(result.session.expiresAt > Date.now())
})

test('importGrokAuth falls through to Hermes xai-oauth when Grok CLI is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hermes-import-'))
  const hermesDir = join(root, '.hermes')
  await mkdir(hermesDir)
  const hermesPath = join(hermesDir, 'auth.json')
  const access = grokAccess({ tier: 1, email: 'hermes@x.ai' })
  await writeFile(hermesPath, JSON.stringify({
    providers: {
      'xai-oauth': {
        tokens: {
          access_token: access,
          refresh_token: 'rt-hermes',
          expires_in: 1800,
        },
      },
    },
  }))
  const result = await importGrokAuth([join(root, '.grok', 'auth.json'), hermesPath])
  assert.equal(result.source, hermesPath)
  assert.equal(result.session.refreshToken, 'rt-hermes')
  assert.equal(result.session.account, 'hermes@x.ai')
})

test('importGrokAuth skips Grok CLI API-key-only files and still reads Hermes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mixed-import-'))
  const grokDir = join(root, '.grok')
  const hermesDir = join(root, '.hermes')
  await mkdir(grokDir)
  await mkdir(hermesDir)
  const grokPath = join(grokDir, 'auth.json')
  const hermesPath = join(hermesDir, 'auth.json')
  await writeFile(grokPath, JSON.stringify({
    'xai::api_key': { key: 'xai-only', auth_mode: 'api_key' },
  }))
  const access = grokAccess()
  await writeFile(hermesPath, JSON.stringify({
    providers: {
      'xai-oauth': { access_token: access, refresh_token: 'rt-after-skip' },
    },
  }))
  const result = await importGrokAuth([grokPath, hermesPath])
  assert.equal(result.source, hermesPath)
  assert.equal(result.session.refreshToken, 'rt-after-skip')
})

test('glmAuthSearchPaths prefers the ZCode credential store over plaintext config', () => {
  const paths = glmAuthSearchPaths()
  // credentials.json holds the provisioned api-key + OAuth token; config.json
  // only has the provider's options.apiKey, which can be a stale dead key.
  assert.equal(paths[0].endsWith(join('.zcode', 'v2', 'credentials.json')), true)
  assert.equal(paths[1].endsWith(join('.zcode', 'v2', 'config.json')), true)
})

test('glmKeyFromZcodeCredentials prefers the provisioned api-key over the OAuth token', () => {
  // The chat + monitor bearer is the provisioned account-provider api-key; the
  // oauth access_token is the business JWT that answers quota but 500s on chat.
  const found = glmKeyFromZcodeCredentials({
    'oauth:active_provider': 'bigmodel',
    'oauth:bigmodel:access_token': 'biz-jwt-token',
    'account-provider:coding-plan:account:bigmodel-individual-coding-plan:account:1:api-key': 'provisioned-chat-key',
    zcodejwttoken: 'zcode-jwt',
  })
  assert.equal(found.apiKey, 'provisioned-chat-key')
  assert.equal(found.region, 'bigmodel')
  assert.equal(found.oauthAccess, 'biz-jwt-token')
  assert.equal(found.zcodeJwt, 'zcode-jwt')
})

test('glmKeyFromZcodeCredentials falls back to the OAuth token without a provisioned key', () => {
  const found = glmKeyFromZcodeCredentials({
    'oauth:active_provider': 'zai',
    'oauth:zai:access_token': 'zai-biz-token',
    'oauth:bigmodel:access_token': 'bigmodel-biz-token',
  })
  assert.equal(found.apiKey, 'zai-biz-token')
  assert.equal(found.region, 'zai')
})

test('glmKeyFromZcodeConfig skips the unsupported start-plan JWT', () => {
  const jwtKey = jwt({ sub: 'start-plan', email: 'dev@bigmodel.cn' })
  const found = glmKeyFromZcodeConfig({
    provider: {
      'builtin:bigmodel': { options: { apiKey: '' } },
      'builtin:zai': { options: { apiKey: '' } },
      'builtin:bigmodel-start-plan': { options: { apiKey: jwtKey } },
      'builtin:zai-coding-plan': { options: { apiKey: '' } },
      'builtin:bigmodel-coding-plan': { options: { apiKey: 'coding-plan-key-not-a-jwt' } },
    },
  })
  assert.equal(found.apiKey, 'coding-plan-key-not-a-jwt')
  assert.equal(found.region, 'bigmodel')
})

test('glmKeyFromZcodeConfig skips start-plan JWT and keeps a disabled coding-plan key', () => {
  const jwtKey = jwt({ sub: 'start-plan', email: 'dev@bigmodel.cn' })
  const found = glmKeyFromZcodeConfig({
    provider: {
      'builtin:bigmodel-start-plan': {
        enabled: true,
        options: {
          apiKey: jwtKey,
          baseURL: 'https://zcode.z.ai/api/v1/zcode-plan/anthropic',
        },
      },
      'builtin:bigmodel-coding-plan': {
        enabled: false,
        error: 'coding_plan_not_entitled',
        options: { apiKey: 'dead-coding-plan-key', baseURL: 'https://open.bigmodel.cn/api/anthropic' },
      },
    },
  })
  // Start-plan JWT is dropped, the disabled coding-plan key survives with its
  // reason — import takes it, chat/quota surface whether the plan is really on.
  assert.equal(found.apiKey, 'dead-coding-plan-key')
  assert.equal(found.region, 'bigmodel')
  assert.equal(found.usable, false)
  assert.equal(found.reason, 'coding_plan_not_entitled')
  // The key is still discoverable, with ZCode's own disable reason, so the
  // import error can say why it was refused instead of "no session found".
  const candidate = glmKeyCandidateFromZcodeConfig({
    provider: {
      'builtin:bigmodel-coding-plan': {
        enabled: false,
        error: 'coding_plan_not_entitled',
        options: { apiKey: 'disabled-coding-plan-key' },
      },
    },
  })
  assert.equal(candidate.apiKey, 'disabled-coding-plan-key')
  assert.equal(candidate.usable, false)
  assert.equal(candidate.reason, 'coding_plan_not_entitled')
  // A system-disabled coding-plan key still imports (the flag comes from a
  // cached, sometimes-wrong entitlement check). Only start-plan JWT is out.
  const imported = glmKeyFromZcodeConfig({
    provider: {
      'builtin:bigmodel-coding-plan': {
        enabled: false,
        systemDisabledReason: 'coding_plan_not_entitled',
        options: { apiKey: 'disabled-coding-plan-key' },
      },
    },
  })
  assert.equal(imported.apiKey, 'disabled-coding-plan-key')
  assert.equal(imported.usable, false)
  assert.equal(imported.reason, 'coding_plan_not_entitled')
})

test('importGlmAuth reads ~/.zcode/v2/config.json and sets region from the provider key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zcode-v2-import-'))
  const v2Dir = join(root, '.zcode', 'v2')
  await mkdir(v2Dir, { recursive: true })
  const v2Path = join(v2Dir, 'config.json')
  await writeFile(v2Path, JSON.stringify({
    provider: {
      'builtin:bigmodel': { options: { apiKey: '' } },
      'builtin:bigmodel-start-plan': { options: { apiKey: jwt({ sub: 'start' }) } },
      'builtin:bigmodel-coding-plan': { options: { apiKey: 'bm-coding-plan-fixture' } },
    },
  }))
  const result = await importGlmAuth([
    v2Path,
    join(root, '.zcode', 'cli', 'config.json'),
    join(root, '.zcode', 'config.json'),
  ])
  assert.equal(result.source, v2Path)
  assert.equal(result.session.accessToken, 'bm-coding-plan-fixture')
  assert.equal(result.session.region, 'bigmodel')
  assert.notEqual(result.session.account, 'zcode')
})

test('importGlmAuth takes a disabled coding-plan key but still refuses start-plan-only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zcode-start-import-'))
  const v2Dir = join(root, '.zcode', 'v2')
  await mkdir(v2Dir, { recursive: true })
  const v2Path = join(v2Dir, 'config.json')
  const jwtKey = jwt({ sub: 'start-user', email: 'trial@bigmodel.cn' })
  await writeFile(v2Path, JSON.stringify({
    provider: {
      'builtin:bigmodel-start-plan': {
        enabled: true,
        options: {
          apiKey: jwtKey,
          baseURL: 'https://zcode.z.ai/api/v1/zcode-plan/anthropic',
        },
      },
      'builtin:bigmodel-coding-plan': {
        enabled: false,
        error: 'coding_plan_not_entitled',
        options: { apiKey: 'dead-coding-plan-key' },
      },
    },
  }))
  const imported = await importGlmAuth([v2Path])
  assert.equal(imported.session.accessToken, 'dead-coding-plan-key')
  assert.equal(imported.session.region, 'bigmodel')
  assert.match(imported.note, /coding_plan_not_entitled/)
  // Start Plan JWT alone is still refused: its zcode-plan hop is captcha-gated.
  const startOnly = join(root, 'start-plan-only.json')
  await writeFile(startOnly, JSON.stringify({
    provider: {
      'builtin:bigmodel-start-plan': {
        enabled: true,
        options: { apiKey: jwtKey, baseURL: 'https://zcode.z.ai/api/v1/zcode-plan/anthropic' },
      },
    },
  }))
  await assert.rejects(importGlmAuth([startOnly]), /no GLM \/ ZCode session found/)
})

test('importGrokAuth lists both paths when nothing is found', async () => {
  const root = await mkdtemp(join(tmpdir(), 'empty-import-'))
  const grokPath = join(root, '.grok', 'auth.json')
  const hermesPath = join(root, '.hermes', 'auth.json')
  await assert.rejects(
    () => importGrokAuth([grokPath, hermesPath]),
    /no Grok session found in .*[\\/]\.grok[\\/]auth\.json or .*[\\/]\.hermes[\\/]auth\.json/,
  )
})
