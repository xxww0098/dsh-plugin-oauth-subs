import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  QuotaStore,
  asNumber,
  consumeResetBody,
  creditBagAmounts,
  isAvailableResetCredit,
  parseCodexUsage,
  parseGrokBilling,
  parseResetCredits,
} from '../lib/quota.js'
import { CODEX_RESET_CONSUME_URL, CODEX_RESET_CREDITS_URL, CODEX_USAGE_URL } from '../lib/codex.js'
import { GROK_BILLING_URL } from '../lib/grok.js'

test('asNumber reads val wrappers', () => {
  assert.equal(asNumber(12), 12)
  assert.equal(asNumber('8.5'), 8.5)
  assert.equal(asNumber({ val: 40 }), 40)
  assert.equal(asNumber(undefined), undefined)
})

test('creditBagAmounts fills used/remaining from the other two', () => {
  assert.deepEqual(creditBagAmounts({ used: 20, total: 100 }), {
    used: 20,
    total: 100,
    remaining: 80,
  })
  assert.deepEqual(creditBagAmounts({ remaining: { val: 30 }, total: { val: 50 } }), {
    used: 20,
    total: 50,
    remaining: 30,
  })
})

test('parseCodexUsage maps 5h + weekly remaining', () => {
  const parsed = parseCodexUsage({
    plan_type: 'plus',
    rate_limit: {
      primary_window: {
        used_percent: 28,
        limit_window_seconds: 18_000,
        reset_after_seconds: 3_600,
      },
      secondary_window: {
        used_percent: 46,
        limit_window_seconds: 604_800,
        reset_at: 1_770_000_000,
      },
    },
  })
  assert.equal(parsed.planType, 'plus')
  assert.equal(parsed.rows[0].kind, 'primary')
  assert.equal(parsed.rows[0].remainingPercent, 72)
  assert.equal(parsed.rows[0].windowMinutes, 300)
  assert.ok(parsed.rows[0].resetAt > Date.now())
  assert.equal(parsed.rows[1].kind, 'weekly')
  assert.equal(parsed.rows[1].remainingPercent, 54)
  assert.equal(parsed.rows[1].resetAt, 1_770_000_000_000)
})

test('parseCodexUsage reads resets_at and seconds_until_reset aliases', () => {
  const parsed = parseCodexUsage({
    rate_limit: {
      primary_window: { used_percent: 10, resets_at: '2099-01-02T00:00:00Z' },
      secondary_window: { used_percent: 20, seconds_until_reset: 86_400 },
    },
  })
  assert.equal(parsed.rows[0].resetAt, Date.parse('2099-01-02T00:00:00Z'))
  assert.ok(parsed.rows[1].resetAt > Date.now() + 80_000_000)
})

test('parseResetCredits reads available_count and skips redeemed/expired', () => {
  const parsed = parseResetCredits({
    available_count: 1,
    credits: [
      {
        id: 'credit-1',
        status: 'available',
        expires_at: '2099-06-25T08:30:00Z',
      },
      {
        id: 'credit-2',
        status: 'redeemed',
        expires_at: 1_782_451_200,
      },
    ],
  })
  assert.equal(parsed.availableCount, 1)
  assert.equal(parsed.credits.length, 2)
  assert.equal(parsed.credits[0].id, 'credit-1')
  assert.equal(isAvailableResetCredit(parsed.credits[0]), true)
  assert.equal(isAvailableResetCredit(parsed.credits[1]), false)
  assert.equal(parsed.nextExpiresAt, Date.parse('2099-06-25T08:30:00Z'))
})

test('parseResetCredits uses payload expires_at when credit rows omit it', () => {
  const parsed = parseResetCredits({
    available_count: 1,
    expires_at: '2099-08-01T12:00:00Z',
  })
  assert.equal(parsed.availableCount, 1)
  assert.equal(parsed.nextExpiresAt, Date.parse('2099-08-01T12:00:00Z'))
})

test('parseResetCredits derives count from credits when available_count is missing', () => {
  const future = Math.floor(Date.now() / 1000) + 3600
  const past = Math.floor(Date.now() / 1000) - 3600
  const parsed = parseResetCredits({
    credits: [
      { id: 'available', expires_at: future },
      { id: 'expired', expires_at: past },
      { id: 'used', status: 'used', expires_at: future },
    ],
  })
  assert.equal(parsed.availableCount, 1)
  assert.equal(parsed.credits[1].status, 'expired')
  assert.equal(parsed.nextExpiresAt, future * 1000)
})

test('consumeResetBody matches redeem_request_id plus CLI idempotencyKey', () => {
  assert.deepEqual(consumeResetBody('req-1'), {
    redeem_request_id: 'req-1',
    idempotencyKey: 'req-1',
  })
})

test('parseGrokBilling reads weekly credits, products, prepaid, plan', () => {
  const parsed = parseGrokBilling({
    config: {
      subscription_tier: 'SuperGrok',
      creditUsagePercent: 32,
      currentPeriod: { type: 'weekly', start: '2026-08-18T00:00:00Z', end: '2026-08-25T00:00:00Z' },
      weeklyCredits: { used: 160, total: 500 },
      prepaidBalance: 12.5,
      productUsage: [
        { product: 'API', usagePercent: 40, used: 80, total: 200, remaining: 120 },
      ],
    },
  }, {
    cliUser: { hasGrokCodeAccess: true, subscription: { tier: 'SuperGrok', status: 'active' } },
  })
  assert.equal(parsed.planType, 'SuperGrok')
  assert.equal(parsed.hasGrokCodeAccess, true)
  assert.equal(parsed.rows[0].kind, 'cycle')
  assert.equal(parsed.rows[0].remainingPercent, 68)
  assert.equal(parsed.rows[0].used, 160)
  assert.equal(parsed.rows[0].total, 500)
  assert.equal(parsed.rows[1].kind, 'prepaid')
  assert.equal(parsed.rows[1].remaining, 12.5)
  assert.equal(parsed.rows[2].product, 'API')
  assert.equal(parsed.rows[2].remainingPercent, 60)
})

test('QuotaStore fetches Codex usage + reset credits and caches', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers })
    if (String(url) === CODEX_RESET_CREDITS_URL) {
      return new Response(JSON.stringify({
        available_count: 2,
        credits: [{ id: 'c1', status: 'available', expires_at: Math.floor(Date.now() / 1000) + 86_400 }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({
      plan_type: 'pro',
      rate_limit: {
        primary_window: { used_percent: 10, limit_window_seconds: 18_000, reset_after_seconds: 100 },
        secondary_window: { used_percent: 20, limit_window_seconds: 604_800, reset_after_seconds: 86_400 },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const store = new QuotaStore({
    ttlMs: 60_000,
    fetchFn,
    tokens: {
      codex: {
        session: async () => ({ accessToken: 'tok', accountId: 'acct-1' }),
      },
    },
  })
  const first = await store.ensure('codex')
  const second = await store.ensure('codex')
  assert.equal(seen.length, 2)
  assert.equal(seen.some((row) => row.url === CODEX_USAGE_URL), true)
  assert.equal(seen.some((row) => row.url === CODEX_RESET_CREDITS_URL), true)
  assert.equal(seen[0].headers['chatgpt-account-id'], 'acct-1')
  assert.equal(seen[0].headers.originator, 'codex_cli_rs')
  assert.equal(seen[0].headers['user-agent'], 'codex_cli_rs/0.147.0')
  assert.equal(first.planType, 'pro')
  assert.equal(first.planLabel, 'Pro')
  assert.equal(first.rows[0].remainingPercent, 90)
  assert.equal(first.resetCredits.availableCount, 2)
  assert.ok(first.resetCredits.nextExpiresAt > Date.now())
  assert.equal(second.status, 'ready')
})

test('QuotaStore keeps Codex usage if reset-credits 404s', async () => {
  const fetchFn = async (url) => {
    if (String(url) === CODEX_RESET_CREDITS_URL) return new Response('nope', { status: 404 })
    return new Response(JSON.stringify({
      plan_type: 'plus',
      rate_limit: { primary_window: { used_percent: 40, limit_window_seconds: 18_000 } },
    }), { status: 200 })
  }
  const store = new QuotaStore({
    fetchFn,
    tokens: { codex: { session: async () => ({ accessToken: 'tok', accountId: 'acct-1' }) } },
  })
  const quota = await store.refresh('codex')
  assert.equal(quota.status, 'ready')
  assert.equal(quota.rows[0].remainingPercent, 60)
  assert.equal(quota.resetCredits.availableCount, 0)
})

test('QuotaStore consume posts redeem body then refreshes usage', async () => {
  const posts = []
  let available = 2
  const fetchFn = async (url, init) => {
    if (String(url) === CODEX_RESET_CONSUME_URL) {
      posts.push({ method: init.method, body: JSON.parse(init.body) })
      available -= 1
      return new Response('{}', { status: 200 })
    }
    if (String(url) === CODEX_RESET_CREDITS_URL) {
      return new Response(JSON.stringify({ available_count: available }), { status: 200 })
    }
    return new Response(JSON.stringify({
      plan_type: 'plus',
      rate_limit: { primary_window: { used_percent: available === 1 ? 5 : 80, limit_window_seconds: 18_000 } },
    }), { status: 200 })
  }
  const store = new QuotaStore({
    fetchFn,
    tokens: { codex: { session: async () => ({ accessToken: 'tok', accountId: 'acct-1' }) } },
  })
  const before = await store.refresh('codex')
  assert.equal(before.resetCredits.availableCount, 2)
  const after = await store.consume('codex')
  assert.equal(posts.length, 1)
  assert.equal(posts[0].method, 'POST')
  assert.equal(typeof posts[0].body.redeem_request_id, 'string')
  assert.match(posts[0].body.redeem_request_id, /^[0-9a-f-]{36}$/i)
  assert.equal(posts[0].body.idempotencyKey, posts[0].body.redeem_request_id)
  assert.equal(after.resetCredits.availableCount, 1)
  assert.equal(after.rows[0].remainingPercent, 95)
})

test('QuotaStore fetches Grok billing and does not fail the card if user probe 404s', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push(init?.headers)
    if (String(url) === GROK_BILLING_URL) {
      return new Response(JSON.stringify({
        config: { subscription_tier: 'X Premium+', creditUsagePercent: 81 },
      }), { status: 200 })
    }
    return new Response('nope', { status: 404 })
  }
  const store = new QuotaStore({
    fetchFn,
    tokens: {
      grok: { session: async () => ({ accessToken: 'g' }) },
    },
  })
  const quota = await store.refresh('grok')
  assert.equal(quota.status, 'ready')
  assert.equal(quota.planType, 'X Premium+')
  assert.equal(quota.planLabel, 'X Premium+')
  assert.equal(quota.rows[0].remainingPercent, 19)
  assert.equal(seen[0]['user-agent'], 'grok-cli/0.2.93')
  assert.equal(seen[0]['x-xai-token-auth'], 'xai-grok-cli')
})

test('parseGrokBilling maps SuperGrokPro user enum to SuperGrok Heavy', () => {
  const parsed = parseGrokBilling({
    config: { creditUsagePercent: 45 },
  }, {
    cliUser: { subscriptionTier: 'SuperGrokPro', hasGrokCodeAccess: true },
  })
  assert.equal(parsed.planType, 'SuperGrok Heavy')
})

test('parseGrokBilling maps numeric subscription_tier the way JWT does', () => {
  const parsed = parseGrokBilling({
    config: { subscription_tier: 4, creditUsagePercent: 10 },
  })
  assert.equal(parsed.planType, 'X Premium+')
  const free = parseGrokBilling({
    config: { subscription_tier: 0, creditUsagePercent: 0 },
  })
  assert.equal(free.planType, 'Free')
})
