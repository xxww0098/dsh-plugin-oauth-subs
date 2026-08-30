import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  QuotaStore,
  applyGrokCreditsSnapshot,
  asNumber,
  consumeResetBody,
  creditBagAmounts,
  isAvailableResetCredit,
  parseAntigravityModelQuota,
  parseAntigravityPaidCredits,
  parseCodexUsage,
  parseGrokBilling,
  parseResetCredits,
} from '../lib/oauth/quota.js'
import { CODEX_RESET_CONSUME_URL, CODEX_RESET_CREDITS_URL, CODEX_USAGE_URL } from '../lib/oauth/codex/index.js'
import { GROK_BILLING_URL, GROK_CREDITS_URL } from '../lib/oauth/grok/index.js'
import { GLM_QUOTA_URL, GLM_TOOL_USAGE_URL, GLM_USER_AGENT } from '../lib/oauth/glm/index.js'
import { GROK_WEB_EMPTY_FRAME, decodeGrokCreditsFrame } from '../lib/oauth/grok/credits-frame.js'
import {
  ANTIGRAVITY_LOAD_CODE_ASSIST_URL,
  antigravityFetchModelsUrls,
  antigravityLoadCodeAssistBody,
  antigravityRequestUserAgent,
  antigravitySession,
} from '../lib/oauth/antigravity/index.js'

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

test('public quota lists each available reset credit instead of a lumped count', async () => {
  const later = Math.floor(Date.now() / 1000) + 86_400 * 20
  const sooner = Math.floor(Date.now() / 1000) + 86_400 * 7
  const fetchFn = async (url) => {
    if (String(url) === CODEX_RESET_CREDITS_URL) {
      return new Response(JSON.stringify({
        available_count: 2,
        credits: [
          { id: 'soon', status: 'available', expires_at: sooner },
          { id: 'later', status: 'available', expires_at: later },
          { id: 'spent', status: 'redeemed', expires_at: later },
        ],
      }), { status: 200 })
    }
    return new Response(JSON.stringify({
      plan_type: 'pro',
      rate_limit: { primary_window: { used_percent: 2, limit_window_seconds: 18_000 } },
    }), { status: 200 })
  }
  const store = new QuotaStore({
    ttlMs: 60_000,
    fetchFn,
    tokens: { codex: { session: async () => ({ accessToken: 'tok' }) } },
  })
  const quota = await store.ensure('codex')
  assert.equal(quota.resetCredits.availableCount, 2)
  assert.deepEqual(quota.resetCredits.credits.map((row) => row.id), ['soon', 'later'])
  assert.equal(quota.resetCredits.credits[0].expiresAt, sooner * 1000)
  assert.equal(quota.resetCredits.credits[1].expiresAt, later * 1000)
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
  assert.equal(parsed.rows[0].kind, 'weekly')
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
  assert.equal(seen[0].headers['user-agent'], 'codex_cli_rs/0.151.0')
  assert.equal(first.planType, 'pro')
  assert.equal(first.planLabel, 'Pro 20x')
  assert.equal(first.rows[0].remainingPercent, 90)
  assert.equal(first.resetCredits.availableCount, 2)
  assert.ok(first.resetCredits.nextExpiresAt > Date.now())
  assert.equal(first.resetCredits.credits.length, 1)
  assert.equal(first.resetCredits.credits[0].id, 'c1')
  assert.ok(first.resetCredits.credits[0].expiresAt > Date.now())
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
    seen.push({ url: String(url), headers: init?.headers, method: init?.method ?? 'GET' })
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
      grok: { session: async () => ({ accessToken: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyLTEifQ.x' }) },
    },
  })
  const quota = await store.refresh('grok')
  assert.equal(quota.status, 'ready')
  assert.equal(quota.planType, 'X Premium+')
  assert.equal(quota.planLabel, 'X Premium+')
  assert.equal(quota.rows[0].remainingPercent, 19)
  const billing = seen.find((row) => row.url === GROK_BILLING_URL)
  assert.equal(billing.headers['user-agent'], 'grok-cli/0.2.93')
  assert.equal(billing.headers['x-xai-token-auth'], 'xai-grok-cli')
  assert.equal(billing.headers['x-userid'], 'user-1')
  assert.equal(seen.some((row) => row.url === GROK_CREDITS_URL && row.method === 'POST'), true)
})

test('QuotaStore GLM quota hop uses ZCode Desktop 3.10.1 fingerprint', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), headers: init?.headers })
    return new Response(JSON.stringify({
      data: {
        level: 'pro',
        list: [{ type: 'CREDIT_LIMIT', usage: 12000, currentValue: 3000, duration: '5h' }],
      },
    }), { status: 200 })
  }
  const store = new QuotaStore({
    fetchFn,
    tokens: { glm: { session: async () => ({ accessToken: 'id.secret', region: 'zai' }) } },
  })
  const first = await store.refresh('glm')
  const second = await store.refresh('glm')
  assert.equal(first.status, 'ready')
  assert.equal(first.planType, 'Pro')
  // Card parse also GETs tool-usage when the quota payload has no MCP row.
  assert.equal(seen.length, 4)
  assert.equal(seen[0].url, GLM_QUOTA_URL)
  assert.equal(seen[1].url, GLM_TOOL_USAGE_URL)
  assert.equal(seen[2].url, GLM_QUOTA_URL)
  assert.equal(seen[3].url, GLM_TOOL_USAGE_URL)
  for (const row of seen) {
    const headers = row.headers
    assert.equal(headers.authorization, 'Bearer id.secret')
    assert.equal(headers['user-agent'], GLM_USER_AGENT)
    assert.equal(headers['user-agent'], 'ZCode/3.10.1 ai-sdk/anthropic/3.0.81')
    assert.equal(headers['X-ZCode-App-Version'], '3.10.1')
    assert.equal(headers['X-ZCode-Agent'], 'glm')
    assert.equal(headers['HTTP-Referer'], 'https://zcode.z.ai')
    assert.equal(headers.referer, 'https://zcode.z.ai')
    assert.equal(headers['X-Title'], 'Z Code')
    assert.match(headers['x-session-id'], /^sess_[0-9a-f]{24}$/)
    assert.equal(JSON.stringify(headers).includes('dsh-plugin-oauth-subs'), false)
  }
  assert.equal(seen[0].headers['x-session-id'], seen[1].headers['x-session-id'])
  assert.equal(seen[0].headers['x-session-id'], seen[2].headers['x-session-id'])
  assert.notEqual(seen[0].headers['x-zcode-trace-id'], seen[2].headers['x-zcode-trace-id'])
  assert.notEqual(seen[0].headers['x-request-id'], seen[2].headers['x-request-id'])
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

test('parseGrokBilling hides unified-billing empty prepaid and product shells', () => {
  const parsed = parseGrokBilling({
    config: {
      isUnifiedBillingUser: true,
      prepaidBalance: 0,
      productUsage: [{ product: 'Grok Code' }],
      currentPeriod: { type: 'USAGE_PERIOD_TYPE_WEEKLY', end: '2026-09-05T00:00:00Z' },
    },
  })
  assert.equal(parsed.rows.length, 0)
})

test('parseGrokBilling falls back to onDemandUsed / onDemandCap', () => {
  const parsed = parseGrokBilling({
    config: {
      subscription_tier: 'SuperGrok Heavy',
      onDemandUsed: { val: 25 },
      onDemandCap: { val: 100 },
    },
  })
  assert.equal(parsed.rows[0].kind, 'weekly')
  assert.equal(parsed.rows[0].usedPercent, 25)
  assert.equal(parsed.rows[0].remainingPercent, 75)
})

function encodeVarint(value) {
  const bytes = []
  let rest = value >>> 0
  while (rest > 0x7f) {
    bytes.push((rest & 0x7f) | 0x80)
    rest >>>= 7
  }
  bytes.push(rest)
  return Buffer.from(bytes)
}

function protoTag(field, wire) {
  return encodeVarint((field << 3) | wire)
}

function protoLen(field, payload) {
  return Buffer.concat([protoTag(field, 2), encodeVarint(payload.length), payload])
}

function protoFixed32(field, value) {
  const data = Buffer.alloc(4)
  data.writeFloatLE(value)
  return Buffer.concat([protoTag(field, 5), data])
}

function grpcFrame(payload, flags = 0) {
  const header = Buffer.alloc(5)
  header[0] = flags
  header.writeUInt32BE(payload.length, 1)
  return Buffer.concat([header, payload])
}

function grokCreditsPayload({ usage, seconds }) {
  const inner = []
  if (usage !== undefined) inner.push(protoFixed32(1, usage))
  if (seconds !== undefined) {
    inner.push(protoLen(5, Buffer.concat([protoTag(1, 0), encodeVarint(seconds)])))
  }
  return protoLen(1, Buffer.concat(inner))
}

test('decodeGrokCreditsFrame reads 0-1 ratio and timestamp', () => {
  const seconds = 1_788_307_200
  const framed = grpcFrame(grokCreditsPayload({ usage: 0.425, seconds }))
  const decoded = decodeGrokCreditsFrame(framed)
  assert.equal(decoded.usedPercent, 43)
  assert.equal(decoded.resetAt, seconds * 1000)
})

test('decodeGrokCreditsFrame treats a 0-100 float as percent', () => {
  const decoded = decodeGrokCreditsFrame(grokCreditsPayload({ usage: 42.4 }))
  assert.equal(decoded.usedPercent, 42)
})

test('decodeGrokCreditsFrame rejects grpc-status 16 trailers', () => {
  const trailer = grpcFrame(Buffer.from('grpc-status: 16\r\ngrpc-message: no-credentials\r\n'), 0x80)
  assert.equal(decodeGrokCreditsFrame(trailer), undefined)
})

test('applyGrokCreditsSnapshot fills weekly usage when JSON omitted the percent', () => {
  const parsed = parseGrokBilling({
    config: {
      isUnifiedBillingUser: true,
      prepaidBalance: 0,
      currentPeriod: { type: 'USAGE_PERIOD_TYPE_WEEKLY', end: '2026-09-05T00:00:00Z' },
    },
  })
  const merged = applyGrokCreditsSnapshot(parsed, { usedPercent: 37, resetAt: Date.parse('2026-09-05T00:00:00Z') })
  assert.equal(merged.rows[0].kind, 'weekly')
  assert.equal(merged.rows[0].usedPercent, 37)
  assert.equal(merged.rows[0].remainingPercent, 63)
})

test('applyGrokCreditsSnapshot does not override a JSON percent', () => {
  const parsed = parseGrokBilling({ config: { creditUsagePercent: 10 } })
  const merged = applyGrokCreditsSnapshot(parsed, { usedPercent: 90 })
  assert.equal(merged.rows[0].usedPercent, 10)
})

test('QuotaStore uses grok.com credits when CLI billing omits the weekly percent', async () => {
  const seconds = 1_788_307_200
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body })
    if (String(url) === GROK_BILLING_URL) {
      return new Response(JSON.stringify({
        config: {
          isUnifiedBillingUser: true,
          prepaidBalance: 0,
          productUsage: [{ product: 'Grok Code' }],
        },
      }), { status: 200 })
    }
    if (String(url) === GROK_CREDITS_URL) {
      return new Response(grpcFrame(grokCreditsPayload({ usage: 0.19, seconds })), {
        status: 200,
        headers: { 'content-type': 'application/grpc-web+proto' },
      })
    }
    return new Response('nope', { status: 404 })
  }
  const store = new QuotaStore({
    fetchFn,
    tokens: { grok: { session: async () => ({ accessToken: 'tok' }) } },
  })
  const quota = await store.refresh('grok')
  assert.equal(quota.status, 'ready')
  assert.equal(quota.rows[0].kind, 'weekly')
  assert.equal(quota.rows[0].usedPercent, 19)
  assert.equal(quota.rows[0].remainingPercent, 81)
  assert.equal(quota.rows[0].resetAt, seconds * 1000)
  assert.equal(quota.rows.some((row) => row.kind === 'prepaid'), false)
  const credits = seen.find((row) => row.url === GROK_CREDITS_URL)
  assert.equal(credits.method, 'POST')
  assert.deepEqual(Buffer.from(credits.body), GROK_WEB_EMPTY_FRAME)
})

const SKILLSTAR_ANTIGRAVITY_MODELS = {
  models: {
    'claude-sonnet-4-6': {
      displayName: 'Claude Sonnet 4.6',
      quotaInfo: { remainingFraction: 0.25 },
    },
    'gemini-3.1-pro-high': {
      quotaInfo: { remainingFraction: '75%' },
    },
    'gemini-2.5-flash': {
      quota_info: { remaining_fraction: 1.0 },
    },
    'gemini-3.1-flash-image': {
      displayName: 'Gemini 3.1 Flash Image',
      quotaInfo: { remainingFraction: 0.5 },
    },
  },
}

test('parseAntigravityModelQuota groups SkillStar remainingFraction 0.25 / 75% / 1.0', () => {
  const parsed = parseAntigravityModelQuota(SKILLSTAR_ANTIGRAVITY_MODELS)
  assert.equal(parsed.rows.length, 4)
  assert.equal(parsed.rows[0].kind, 'product')
  assert.equal(parsed.rows[0].product, 'Claude/GPT')
  assert.equal(parsed.rows[0].remainingPercent, 25)
  assert.equal(parsed.rows[0].usedPercent, 75)
  assert.equal(parsed.rows[1].product, 'Gemini 3.1 Pro Series')
  assert.equal(parsed.rows[1].remainingPercent, 75)
  assert.equal(parsed.rows[1].usedPercent, 25)
  assert.equal(parsed.rows[2].product, 'Gemini 2.5 Flash')
  assert.equal(parsed.rows[2].remainingPercent, 100)
  assert.equal(parsed.rows[2].usedPercent, 0)
  assert.equal(parsed.rows[3].product, 'Gemini 3.1 Flash Image')
  assert.equal(parsed.rows[3].remainingPercent, 50)
  assert.equal(parsed.rows[3].usedPercent, 50)
})

test('parseAntigravityModelQuota uses resetTime as remaining 0 and min of group', () => {
  const parsed = parseAntigravityModelQuota({
    models: {
      'claude-sonnet-4-6': { quotaInfo: { remainingFraction: 0.4 } },
      'claude-opus-4-6-thinking': { quotaInfo: { resetTime: '2099-01-01T00:00:00Z' } },
    },
  })
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].product, 'Claude/GPT')
  assert.equal(parsed.rows[0].remainingPercent, 0)
  assert.equal(parsed.rows[0].usedPercent, 100)
})

test('parseAntigravityPaidCredits reads paidTier.availableCredits', () => {
  const rows = parseAntigravityPaidCredits({
    paidTier: {
      availableCredits: [
        { creditType: 'PROMO', creditAmount: '12.5' },
        { credit_type: 'empty' },
      ],
    },
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].kind, 'prepaid')
  assert.equal(rows[0].remaining, 12.5)
})

test('QuotaStore fetches Antigravity model groups instead of idle empty rows', async () => {
  const later = Date.now() + 60 * 60_000
  const session = antigravitySession({
    accessToken: 'ag-tok',
    refreshToken: 'ag-rt',
    expiresAt: later,
    account: 'a@x',
    projectId: 'proj-1',
    planType: 'STANDARD TIER',
  })
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({
      url: String(url),
      method: init?.method,
      headers: init?.headers,
      body: init?.body,
    })
    if (String(url) === ANTIGRAVITY_LOAD_CODE_ASSIST_URL) {
      return new Response(JSON.stringify({
        currentTier: { id: 'STANDARD TIER' },
        cloudaicompanionProject: 'proj-1',
      }), { status: 200 })
    }
    if (String(url) === antigravityFetchModelsUrls()[0]) {
      return new Response(JSON.stringify(SKILLSTAR_ANTIGRAVITY_MODELS), { status: 200 })
    }
    throw new Error(`unexpected ${url}`)
  }
  const store = new QuotaStore({
    fetchFn,
    tokens: { antigravity: { session: async () => session } },
  })
  const quota = await store.refresh('antigravity')
  assert.equal(quota.status, 'ready')
  assert.notEqual(quota.status, 'idle')
  assert.equal(quota.planType, 'STANDARD TIER')
  assert.equal(quota.rows.length, 4)
  assert.equal(quota.rows[0].product, 'Claude/GPT')
  assert.equal(quota.rows[0].remainingPercent, 25)
  assert.equal(seen[0].url, ANTIGRAVITY_LOAD_CODE_ASSIST_URL)
  assert.deepEqual(JSON.parse(seen[0].body), antigravityLoadCodeAssistBody('proj-1'))
  assert.equal(seen[0].headers['user-agent'], antigravityRequestUserAgent())
  assert.equal(seen[1].url, antigravityFetchModelsUrls()[0])
  assert.deepEqual(JSON.parse(seen[1].body), { project: 'proj-1' })
  assert.equal(seen[1].headers['user-agent'], antigravityRequestUserAgent())
  assert.equal(JSON.stringify(seen).includes('dsh-plugin'), false)
})

test('QuotaStore Antigravity load 400 with cached project retries without project', async () => {
  const later = Date.now() + 60 * 60_000
  const session = antigravitySession({
    accessToken: 'ag-tok', refreshToken: 'ag-rt', expiresAt: later, account: 'a@x', projectId: 'stale-proj',
  })
  const loads = []
  const fetchFn = async (url, init) => {
    if (String(url) === ANTIGRAVITY_LOAD_CODE_ASSIST_URL) {
      const body = JSON.parse(init.body)
      loads.push(body)
      if (body.cloudaicompanionProject) {
        return new Response('Bad Request', { status: 400 })
      }
      return new Response(JSON.stringify({ cloudaicompanionProject: 'fresh-proj' }), { status: 200 })
    }
    if (String(url) === antigravityFetchModelsUrls()[0]) {
      assert.deepEqual(JSON.parse(init.body), { project: 'fresh-proj' })
      return new Response(JSON.stringify(SKILLSTAR_ANTIGRAVITY_MODELS), { status: 200 })
    }
    throw new Error(`unexpected ${url}`)
  }
  const store = new QuotaStore({
    fetchFn,
    tokens: { antigravity: { session: async () => session } },
  })
  const quota = await store.refresh('antigravity')
  assert.equal(quota.status, 'ready')
  assert.equal(loads.length, 2)
  assert.equal(loads[0].cloudaicompanionProject, 'stale-proj')
  assert.equal(loads[1].cloudaicompanionProject, undefined)
  assert.equal(quota.rows[0].remainingPercent, 25)
})

test('QuotaStore Antigravity fetch failure is error, not idle empty', async () => {
  const later = Date.now() + 60 * 60_000
  const session = antigravitySession({
    accessToken: 'ag-tok', refreshToken: 'ag-rt', expiresAt: later, account: 'a@x', projectId: 'proj-1',
  })
  const store = new QuotaStore({
    fetchFn: async () => new Response('nope', { status: 500 }),
    tokens: { antigravity: { session: async () => session } },
  })
  const quota = await store.refresh('antigravity')
  assert.equal(quota.status, 'error')
  assert.notEqual(quota.status, 'idle')
  assert.equal(quota.rows.length, 0)
  assert.match(quota.error, /loadCodeAssist|HTTP 500/)
})
