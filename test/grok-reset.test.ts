import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QuotaStore } from '../lib/oauth/quota.js'
import { fetchGrokQuota } from '../lib/oauth/grok/quota.js'
import { GROK_BILLING_URL, GROK_RESET_LIST_URL, GROK_RESET_REDEEM_URL } from '../lib/oauth/grok/index.js'
import { decodeGrokResetTokens, grokRedeemOutcome, grokResetCardId, readGrokRpc } from '../lib/oauth/grok/reset-frame.js'

// Live GetRemainingResets payload from stablyai/orca #18116: one token
// restok_vpYDqo, granted 2026-08-12T18:49Z, expires 2026-09-12T18:49Z.
const LIVE_HEX = '5221520d726573746f6b5f76705944716fa20106089c80f3d306f20106089cbd96d506'

function varint(n) {
  const out = []
  while (n > 0x7f) { out.push((n % 128) | 0x80); n = Math.floor(n / 128) }
  out.push(n)
  return Buffer.from(out)
}
const len = (field, bytes) => Buffer.concat([varint((field << 3) | 2), varint(bytes.length), bytes])
const stamp = (seconds) => Buffer.concat([varint(8), varint(seconds)])
function token(id, expiresSec) {
  return len(10, Buffer.concat([len(10, Buffer.from(id)), len(30, stamp(expiresSec))]))
}
function frame(payload, flags = 0) {
  const header = Buffer.alloc(5)
  header[0] = flags
  header.writeUInt32BE(payload.length, 1)
  return Buffer.concat([header, payload])
}
function grpc(payload, status = '0', message) {
  const trailer = `grpc-status:${status}\r\n${message ? `grpc-message:${encodeURIComponent(message)}\r\n` : ''}`
  return new Response(Buffer.concat([frame(payload), frame(Buffer.from(trailer), 0x80)]), {
    status: 200, headers: { 'content-type': 'application/grpc-web+proto' },
  })
}
const FAR = Math.floor(Date.parse('2099-01-01T00:00:00Z') / 1000)
const SOON = Math.floor(Date.parse('2098-06-01T00:00:00Z') / 1000)
const billing = () => new Response(JSON.stringify({ config: { creditUsagePercent: 60 } }), { status: 200 })

test('decodeGrokResetTokens reads the live GetRemainingResets capture', () => {
  const tokens = decodeGrokResetTokens(Buffer.from(LIVE_HEX, 'hex'), Date.parse('2026-09-01T00:00:00Z'))
  assert.deepEqual(tokens, [{
    tokenId: 'restok_vpYDqo',
    grantedAt: Date.parse('2026-08-12T18:49:00Z'),
    expiresAt: Date.parse('2026-09-12T18:49:00Z'),
  }])
  // Past its expiry the same capture is an empty inventory.
  assert.deepEqual(decodeGrokResetTokens(Buffer.from(LIVE_HEX, 'hex'), Date.parse('2026-10-01T00:00:00Z')), [])
})

test('decodeGrokResetTokens also reads the 1/2/3 bare-seconds token shape', () => {
  const inner = Buffer.concat([len(1, Buffer.from('restok_x')), varint(2 << 3), varint(100), varint(3 << 3), varint(FAR)])
  assert.deepEqual(decodeGrokResetTokens(len(10, inner)), [{ tokenId: 'restok_x', grantedAt: 100_000, expiresAt: FAR * 1000 }])
})

test('grokRedeemOutcome maps RedeemReset statuses', () => {
  assert.equal(grokRedeemOutcome('0'), 'reset')
  assert.equal(grokRedeemOutcome('9', 'token already redeemed'), 'alreadyRedeemed')
  assert.equal(grokRedeemOutcome('9', 'token does not exist'), 'noCredit')
  assert.equal(grokRedeemOutcome('3', 'Invalid token_id'), 'noCredit')
  assert.equal(grokRedeemOutcome('16', 'unauthenticated'), 'failed')
})

test('readGrokRpc falls back to header status when there is no trailer frame', () => {
  const rpc = readGrokRpc(Buffer.alloc(0), '7', 'The%20OAuth2%20access%20token%20could%20not%20be%20validated.')
  assert.equal(rpc.grpcStatus, '7')
  assert.match(rpc.grpcMessage, /could not be validated/)
})

test('fetchGrokQuota banks reset cards earliest-first and never exposes token ids', async () => {
  const seen = []
  const quota = await fetchGrokQuota({ accessToken: 'tok' }, async (url, init) => {
    const href = String(url)
    seen.push({ href, headers: init?.headers })
    if (href === GROK_BILLING_URL) return billing()
    if (href === GROK_RESET_LIST_URL) return grpc(Buffer.concat([token('restok_far', FAR), token('restok_soon', SOON)]))
    return new Response('nope', { status: 404 })
  })
  assert.equal(quota.resetCredits.availableCount, 2)
  assert.deepEqual(quota.resetCredits.credits.map((c) => c.expiresAt), [SOON * 1000, FAR * 1000])
  assert.equal(quota.resetCredits.credits[0].id, grokResetCardId('restok_soon'))
  assert.equal(JSON.stringify(quota).includes('restok_'), false)
  const list = seen.find((row) => row.href === GROK_RESET_LIST_URL)
  assert.equal(list.headers.authorization, 'Bearer tok')
  assert.equal(list.headers['x-grpc-web'], '1')
})

test('fetchGrokQuota reads an empty DATA frame with grpc-status 0 as zero cards', async () => {
  const quota = await fetchGrokQuota({ accessToken: 'tok' }, async (url) => {
    const href = String(url)
    if (href === GROK_BILLING_URL) return billing()
    if (href === GROK_RESET_LIST_URL) return grpc(Buffer.alloc(0))
    return new Response('nope', { status: 404 })
  })
  assert.deepEqual(quota.resetCredits, { availableCount: 0, credits: [] })
})

test('QuotaStore keeps the last Grok card bank when the list read fails', async () => {
  let listStatus = '0'
  const store = new QuotaStore({
    tokens: { grok: { session: async () => ({ accessToken: 'tok' }) } },
    fetchFn: async (url) => {
      const href = String(url)
      if (href === GROK_BILLING_URL) return billing()
      if (href === GROK_RESET_LIST_URL) return grpc(listStatus === '0' ? token('restok_a', FAR) : Buffer.alloc(0), listStatus, 'internal')
      return new Response('nope', { status: 404 })
    },
  })
  assert.equal((await store.refresh('grok')).resetCredits.availableCount, 1)
  listStatus = '13'
  const after = await store.refresh('grok')
  assert.equal(after.status, 'ready')
  assert.equal(after.resetCredits.availableCount, 1)
})

test('QuotaStore Grok reset redeems the listed token by its hashed id', async () => {
  const redeemed = []
  let bank = ['restok_a', 'restok_b']
  const store = new QuotaStore({
    tokens: { grok: { session: async () => ({ accessToken: 'tok' }) } },
    fetchFn: async (url, init) => {
      const href = String(url)
      if (href === GROK_BILLING_URL) return billing()
      if (href === GROK_RESET_LIST_URL) return grpc(Buffer.concat(bank.map((id) => token(id, FAR))))
      if (href === GROK_RESET_REDEEM_URL) {
        const body = Buffer.from(init.body)
        // 5-byte frame header, then field 10 (tag 0x52) + length + token id.
        assert.equal(body[5], 0x52)
        const id = body.subarray(7, 7 + body[6]).toString('utf8')
        redeemed.push(id)
        bank = bank.filter((row) => row !== id)
        return grpc(Buffer.alloc(0))
      }
      return new Response('nope', { status: 404 })
    },
  })
  await store.refresh('grok')
  const after = await store.consume('grok', undefined, undefined, grokResetCardId('restok_b'))
  assert.deepEqual(redeemed, ['restok_b'])
  assert.equal(after.resetCredits.availableCount, 1)
  await assert.rejects(store.consume('grok', undefined, undefined, grokResetCardId('restok_b')), /not available/)
  assert.deepEqual(redeemed, ['restok_b'])
})

test('QuotaStore Grok reset treats alreadyRedeemed as done and surfaces noCredit', async () => {
  let answer = ['9', 'reset token already redeemed']
  const store = new QuotaStore({
    tokens: { grok: { session: async () => ({ accessToken: 'tok' }) } },
    fetchFn: async (url) => {
      const href = String(url)
      if (href === GROK_BILLING_URL) return billing()
      if (href === GROK_RESET_LIST_URL) return grpc(token('restok_a', FAR))
      if (href === GROK_RESET_REDEEM_URL) return grpc(Buffer.alloc(0), answer[0], answer[1])
      return new Response('nope', { status: 404 })
    },
  })
  const done = await store.consume('grok', undefined, undefined, grokResetCardId('restok_a'))
  assert.equal(done.status, 'ready')
  answer = ['3', 'Invalid token_id']
  await assert.rejects(store.consume('grok', undefined, undefined, grokResetCardId('restok_a')), /grok reset card failed: Invalid token_id/)
})
