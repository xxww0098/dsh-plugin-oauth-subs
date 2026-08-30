import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { codexSession } from '../lib/oauth/codex/index.js'
import { GROK_CLIENT_ID } from '../lib/oauth/grok/index.js'
import {
  GROK_HERMES_KEYS,
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

test('importGrokAuth lists both paths when nothing is found', async () => {
  const root = await mkdtemp(join(tmpdir(), 'empty-import-'))
  const grokPath = join(root, '.grok', 'auth.json')
  const hermesPath = join(root, '.hermes', 'auth.json')
  await assert.rejects(
    () => importGrokAuth([grokPath, hermesPath]),
    /no Grok session found in .*[\\/]\.grok[\\/]auth\.json or .*[\\/]\.hermes[\\/]auth\.json/,
  )
})
