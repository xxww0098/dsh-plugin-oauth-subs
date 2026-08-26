import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatPlanLabel, pickPlanRaw } from '../lib/plan.js'
import { grokSession, grokTierFromValue, grokTierName } from '../lib/grok.js'
import { publicSession } from '../lib/store.js'

function jwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.x`
}

test('formatPlanLabel maps Codex slugs to Plus / Pro / Team', () => {
  assert.equal(formatPlanLabel('plus'), 'Plus')
  assert.equal(formatPlanLabel('PRO'), 'Pro')
  assert.equal(formatPlanLabel('chatgpt_plus'), 'Plus')
  assert.equal(formatPlanLabel('team'), 'Team')
  assert.equal(formatPlanLabel('enterprise'), 'Enterprise')
  assert.equal(formatPlanLabel('free_trial'), 'Free')
  assert.equal(formatPlanLabel('go'), 'Go')
})

test('formatPlanLabel maps Grok numeric tiers and aliases', () => {
  assert.equal(formatPlanLabel(1), 'SuperGrok')
  assert.equal(formatPlanLabel(4), 'X Premium+')
  assert.equal(formatPlanLabel('4'), 'X Premium+')
  assert.equal(formatPlanLabel(7), 'SuperGrok Plus')
  assert.equal(formatPlanLabel('SuperGrok'), 'SuperGrok')
  assert.equal(formatPlanLabel('x-premium+'), 'X Premium+')
  assert.equal(formatPlanLabel('super_grok_heavy'), 'SuperGrok Heavy')
  assert.equal(formatPlanLabel('SuperGrokPro'), 'SuperGrok Heavy')
  assert.equal(formatPlanLabel('super_grok_pro'), 'SuperGrok Heavy')
  assert.equal(formatPlanLabel('supergrokpro'), 'SuperGrok Heavy')
  assert.equal(formatPlanLabel(undefined), undefined)
  assert.equal(formatPlanLabel(''), undefined)
})

test('pickPlanRaw prefers the first usable string or integer', () => {
  assert.equal(pickPlanRaw(undefined, '', 'plus', 'pro'), 'plus')
  assert.equal(pickPlanRaw(4, 'SuperGrok'), 4)
  assert.equal(pickPlanRaw(null, undefined), undefined)
})

test('grokSession stores JWT tier as planType', () => {
  const session = grokSession({
    access_token: jwt({ tier: 4, exp: Math.floor(Date.now() / 1000) + 3600 }),
    refresh_token: 'refresh',
    expires_in: 3600,
    id_token: jwt({ email: 'g@x.ai' }),
  }, 'https://auth.x.ai/oauth2/token')
  assert.equal(session.account, 'g@x.ai')
  assert.equal(session.planType, 'X Premium+')
  const pub = publicSession('grok', session)
  assert.equal(pub.planType, 'X Premium+')
  assert.equal(pub.planLabel, 'X Premium+')
})

test('grokTierFromValue accepts billing numbers and strings', () => {
  assert.equal(grokTierFromValue(5), 'SuperGrok Heavy')
  assert.equal(grokTierFromValue('SuperGrok'), 'SuperGrok')
  assert.equal(grokTierFromValue(''), undefined)
  assert.equal(grokTierName(jwt({ tier: 3 })), 'X Premium')
})
