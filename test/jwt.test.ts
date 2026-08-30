import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeJwtPayload } from '../lib/utils/jwt.js'
import { codexProfileClaims } from '../lib/oauth/codex/index.js'
import { grokTierName } from '../lib/oauth/grok/index.js'

function jwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.sig`
}

test('decodeJwtPayload reads object payloads and rejects junk', () => {
  assert.equal(decodeJwtPayload('not-a-jwt'), undefined)
  assert.deepEqual(decodeJwtPayload(jwt({ email: 'a@b.c' })), { email: 'a@b.c' })
})

test('codexProfileClaims follows openai auth/profile claim paths', () => {
  const token = jwt({
    email: 'user@example.com',
    'https://api.openai.com/auth': {
      chatgpt_account_id: 'acct_1',
      chatgpt_plan_type: 'pro',
    },
  })
  assert.deepEqual(codexProfileClaims(token), {
    emailAddress: 'user@example.com',
    planType: 'pro',
  })
})

test('grokTierName maps the numeric tier claim', () => {
  assert.equal(grokTierName(jwt({ tier: 3 })), 'X Premium')
  assert.equal(grokTierName(jwt({ tier: 99 })), '99')
  assert.equal(grokTierName(jwt({})), undefined)
})
