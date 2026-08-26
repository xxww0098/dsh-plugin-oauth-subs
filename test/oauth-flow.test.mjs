import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OAuthFlowManager } from '../lib/oauth-flow.js'
import { createPkce } from '../lib/pkce.js'
import {
  CODEX_CLIENT_ID,
  CODEX_ORIGINATOR,
  CODEX_USER_AGENT,
  CODEX_CLIENT_VERSION,
  codexFlow,
  codexCredentialHeaders,
  codexUpstreamHeaders,
  exchangeCodexCode,
  refreshCodex,
} from '../lib/codex.js'
import { GROK_USER_AGENT, grokCredentialHeaders, grokUpstreamHeaders } from '../lib/grok.js'

function jwtId() {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
  const body = Buffer.from(JSON.stringify({
    'https://api.openai.com/auth': { chatgpt_account_id: 'acct-1' },
  })).toString('base64url')
  return `${header}.${body}.x`
}

test('codexFlow builds the Codex CLI authorize URL', () => {
  const pkce = createPkce()
  const url = new URL(codexFlow.buildAuthorizeUrl({
    redirectUri: 'http://localhost:1455/auth/callback',
    state: 'st',
    pkce,
  }))
  assert.equal(url.origin + url.pathname, 'https://auth.openai.com/oauth/authorize')
  assert.equal(url.searchParams.get('client_id'), CODEX_CLIENT_ID)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('originator'), CODEX_ORIGINATOR)
  assert.equal(url.searchParams.get('codex_cli_simplified_flow'), 'true')
})

test('Codex originator and User-Agent are the official CLI pair', () => {
  const cred = codexCredentialHeaders()
  assert.equal(cred.originator, 'codex_cli_rs')
  assert.equal(cred['user-agent'], `codex_cli_rs/${CODEX_CLIENT_VERSION}`)
  assert.equal(CODEX_USER_AGENT, cred['user-agent'])
  const upstream = codexUpstreamHeaders({ accessToken: 'tok', accountId: 'acct' })
  assert.equal(upstream.originator, cred.originator)
  assert.equal(upstream['user-agent'], cred['user-agent'])
  assert.equal(upstream['openai-version'], CODEX_CLIENT_VERSION)
})

test('exchangeCodexCode and refreshCodex send the same identity pair', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push(init.headers)
    return new Response(JSON.stringify({
      access_token: 'a.b.c',
      refresh_token: 'r',
      expires_in: 3600,
      id_token: jwtId(),
    }), { status: 200 })
  }
  await exchangeCodexCode('code', 'ver', 'http://localhost/cb', fetchFn)
  await refreshCodex({ refreshToken: 'r', accountId: 'acct-1' }, fetchFn)
  assert.equal(seen[0].originator, 'codex_cli_rs')
  assert.equal(seen[0]['user-agent'], CODEX_USER_AGENT)
  assert.equal(seen[1].originator, seen[0].originator)
  assert.equal(seen[1]['user-agent'], seen[0]['user-agent'])
})

test('Grok conversation headers use grok-cli User-Agent', () => {
  const cred = grokCredentialHeaders()
  assert.equal(cred['user-agent'], GROK_USER_AGENT)
  const upstream = grokUpstreamHeaders({ accessToken: 'g' })
  assert.equal(upstream['x-xai-token-auth'], 'xai-grok-cli')
  assert.equal(upstream['user-agent'], GROK_USER_AGENT)
})

test('OAuthFlowManager accepts a pasted callback URL with matching state', async () => {
  const flows = new OAuthFlowManager()
  const attempt = await flows.start('codex', {
    callbackPath: '/auth/callback',
    listen: { host: '127.0.0.1', ports: [0] },
    timeoutMs: 5_000,
    buildAuthorizeUrl: ({ redirectUri, state, pkce }) =>
      `https://example.test/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&cc=${pkce.challenge}`,
  })
  assert.match(attempt.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/)
  assert.equal(flows.isBusy('codex'), true)
  attempt.manual(`${attempt.redirectUri}?code=abc123&state=${attempt.state}`)
  assert.equal(await attempt.waitCode(), 'abc123')
  assert.equal(flows.isBusy('codex'), false)
})

test('OAuthFlowManager rejects a mismatched pasted state', async () => {
  const flows = new OAuthFlowManager()
  const attempt = await flows.start('codex', {
    callbackPath: '/auth/callback',
    listen: { host: '127.0.0.1', ports: [0] },
    timeoutMs: 5_000,
    buildAuthorizeUrl: () => 'https://example.test/authorize',
  })
  assert.throws(() => attempt.manual('http://localhost/cb?code=x&state=other'), /state mismatch/)
  attempt.cancel()
  await assert.rejects(attempt.waitCode(), /cancelled/)
})
