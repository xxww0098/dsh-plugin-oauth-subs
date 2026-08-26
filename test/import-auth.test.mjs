import assert from 'node:assert/strict'
import { test } from 'node:test'
import { codexSession } from '../lib/codex.js'

function jwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.x`
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
