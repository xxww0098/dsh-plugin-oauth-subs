#!/usr/bin/env node
/**
 * Live smoke test: real stored login → the real proxy → the vendor.
 *
 *   node --experimental-strip-types scripts/live-smoke.ts <family>[,<family>] [--profile desktop] [--account N] [--timeout 90]
 *
 * Read-only by construction: it reads `auth.json` through `listStoredSessions`,
 * never refreshes a token (an account that expires within 2 minutes is skipped),
 * never writes the store, and every request carries a timeout. Requests are tiny
 * but they are real — they spend a little of the account's quota.
 *
 * Add a family by adding one entry to CHECKS. Exit code 1 if any check fails.
 */

import { deflateSync } from 'node:zlib'
import { createProxy } from '../lib/oauth/proxy.js'
import { listStoredSessions } from '../lib/oauth/store.js'

const args = { families: [] as string[], profile: 'desktop', account: null as number | null, timeoutMs: 90_000 }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--profile') args.profile = argv[++i]
  else if (argv[i] === '--account') args.account = Number(argv[++i])
  else if (argv[i] === '--timeout') args.timeoutMs = Number(argv[++i]) * 1000
  else args.families.push(...argv[i].split(','))
}

const AUTH = `${process.env.HOME}/.dsh/profiles/${args.profile}/data/dsh-plugin-oauth-subs/auth.json`
const KEY = 'live-smoke'

/** First stored session that will not expire mid-run (or the one `--account` names). */
async function pickSession(family) {
  const rows = await listStoredSessions(family, AUTH)
  const usable = (row) => row?.session?.expiresAt > Date.now() + 120_000
  const row = args.account != null ? rows[args.account] : rows.find(usable)
  if (!row) throw new Error(`no stored ${family} account`)
  if (!usable(row)) throw new Error(`${family} account expires within 2 minutes; live smoke never refreshes`)
  return row.session
}

function png(width, height, [r, g, b]) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64')
}

/** One non-streaming chat call through the proxy. */
function chatClient(base, family) {
  return async (body) => {
    const t0 = Date.now()
    const res = await fetch(`${base}/${family}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(args.timeoutMs),
      body: JSON.stringify({ stream: false, ...body }),
    })
    const text = await res.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { /* error bodies may be plain text */ }
    const message = json?.choices?.[0]?.message
    return { status: res.status, ms: Date.now() - t0, message, text: String(message?.content ?? ''), raw: json ?? text.slice(0, 300) }
  }
}

const pass = (detail) => ({ ok: true, detail })
const fail = (detail) => ({ ok: false, detail })
const ms = (r) => `${(r.ms / 1000).toFixed(1)}s`

// ── Cursor ────────────────────────────────────────────────────────────────

const CURSOR_MODEL = 'claude-sonnet-5-5'

const cursor = {
  // Cursor reads AI-SDK JSON messages from the root blobs, not protobuf turns:
  // losing history shows up as "no code word in this conversation".
  async memory(chat) {
    const word = `PELICAN-${Math.floor(1000 + Math.random() * 9000)}`
    const first = [{ role: 'user', content: `Remember the code word ${word}. Reply with OK only.` }]
    const one = await chat({ model: CURSOR_MODEL, messages: first })
    if (one.status !== 200) return fail(`turn 1 HTTP ${one.status} ${JSON.stringify(one.raw)}`)
    const two = await chat({ model: CURSOR_MODEL, messages: [...first, { role: 'assistant', content: one.text }, { role: 'user', content: 'What was the code word? Answer with the word only.' }] })
    return two.text.includes(word) ? pass(`recalled ${word} (${ms(two)})`) : fail(`expected ${word}, got ${JSON.stringify(two.text || two.raw).slice(0, 120)}`)
  },
  // Parallel MCP calls arrive one by one before the step checkpoint; returning
  // on the first one used to drop the rest.
  async parallelTools(chat) {
    const fn = (name, description) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } })
    const tools = [fn('get_weather', 'Weather for a city'), fn('get_time', 'Local time for a city')]
    const messages: any[] = [{ role: 'user', content: 'Call get_weather for Paris AND get_time for Tokyo, both now in one step. After you have both results, answer in one sentence that mentions both cities.' }]
    const one = await chat({ model: CURSOR_MODEL, tools, messages })
    const calls = one.message?.tool_calls ?? []
    if (calls.length < 2) return fail(`expected 2 parallel tool calls, got ${calls.length} (${JSON.stringify(one.raw).slice(0, 160)})`)
    const results = calls.map((call) => ({ role: 'tool', tool_call_id: call.id, content: call.function.name === 'get_weather' ? '{"city":"Paris","temp_c":17,"sky":"rain"}' : '{"city":"Tokyo","time":"21:05"}' }))
    const two = await chat({ model: CURSOR_MODEL, tools, messages: [...messages, { role: 'assistant', content: one.message?.content ?? '', tool_calls: calls }, ...results] })
    return /paris/i.test(two.text) && /tokyo/i.test(two.text) ? pass(`${calls.length} calls, then answered (${ms(one)} + ${ms(two)})`) : fail(`final answer missed a city: ${JSON.stringify(two.text || two.raw).slice(0, 160)}`)
  },
  async image(chat) {
    const ask = async (color) => (await chat({ model: CURSOR_MODEL, messages: [{ role: 'user', content: [{ type: 'text', text: 'What single color fills this image? One lowercase word.' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${png(64, 64, color)}` } }] }] })).text
    const [red, blue] = [await ask([220, 20, 20]), await ask([20, 20, 220])]
    return /red/i.test(red) && /blue/i.test(blue) ? pass('red → red, blue → blue') : fail(`red → ${JSON.stringify(red)}, blue → ${JSON.stringify(blue)}`)
  },
}

// ── Kiro ──────────────────────────────────────────────────────────────────

const LOW = ['off', 'minimal', 'low']
const HIGH = ['max', 'xhigh', 'high']

const kiro = {
  async image(chat, ctx) {
    const row = ctx.models.find((m) => m.input?.includes('image') && /haiku/i.test(m.id)) ?? ctx.models.find((m) => m.input?.includes('image'))
    if (!row) return fail('no image-capable model in the live catalog')
    const ask = async (color) => (await chat({ model: row.id, messages: [{ role: 'user', content: [{ type: 'text', text: 'What single color fills this image? One lowercase word.' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${png(64, 64, color)}` } }] }] })).text
    const [red, blue] = [await ask([220, 20, 20]), await ask([20, 20, 220])]
    return /red/i.test(red) && /blue/i.test(blue) ? pass(`${row.id}: red → red, blue → blue`) : fail(`${row.id}: red → ${JSON.stringify(red)}, blue → ${JSON.stringify(blue)}`)
  },
  // additionalModelRequestFields is a closed schema: a wrong shape is a 400,
  // and a dropped field silently runs the default tier.
  async effort(chat, ctx) {
    const row = ctx.models.find((m) => m.reasoningEfforts && LOW.some((k) => m.reasoningEfforts[k]) && HIGH.some((k) => m.reasoningEfforts[k]))
    if (!row) return fail('no catalog model with both a low and a high effort tier')
    const wire = (keys) => row.reasoningEfforts[keys.find((k) => row.reasoningEfforts[k])]
    const q = 'How many ordered pairs of non-negative integers (x, y) satisfy x^2 + y^2 = 2025? List them and verify each.'
    const low = await chat({ model: row.id, reasoning_effort: wire(LOW), messages: [{ role: 'user', content: q }] })
    const high = await chat({ model: row.id, reasoning_effort: wire(HIGH), messages: [{ role: 'user', content: q }] })
    const detail = `${row.id}: ${wire(LOW)} ${ms(low)}, ${wire(HIGH)} ${ms(high)}`
    return low.status === 200 && high.status === 200 ? pass(detail) : fail(`${detail}; HTTP ${low.status}/${high.status} ${JSON.stringify(low.status === 200 ? high.raw : low.raw)}`)
  },
}

const haiku = (ctx) => ctx.models.find((m) => /haiku/i.test(m.id))?.id ?? ctx.models.find((m) => /^claude-/.test(m.id))?.id

Object.assign(kiro, {
  // A request that carries tool_use / tool_result history but offers no tools
  // (a compaction or summary call) is a Bedrock 400 unless the history rides as text.
  async toolHistoryWithoutTools(chat, ctx) {
    const model = haiku(ctx)
    if (!model) return fail('no Claude model in the live catalog')
    const messages = [
      { role: 'user', content: 'Call read_file for a.ts, then reply DONE.' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.ts"}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: 'const a = 1' },
      { role: 'user', content: 'Summarise what happened in one sentence.' },
    ]
    const r = await chat({ model, messages })
    return r.status === 200 && r.text ? pass(`${model}: ${JSON.stringify(r.text.slice(0, 60))} (${ms(r)})`) : fail(`HTTP ${r.status} ${JSON.stringify(r.raw).slice(0, 200)}`)
  },
  // A tool with no parameters streams no argument text; the host needs a JSON object.
  async noArgTool(chat, ctx) {
    const model = haiku(ctx)
    if (!model) return fail('no Claude model in the live catalog')
    const tools = [{ type: 'function', function: { name: 'git_status', description: 'Show git status', parameters: { type: 'object', properties: {} } } }]
    const res = await fetch(`${ctx.base}/kiro/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(args.timeoutMs),
      body: JSON.stringify({ model, stream: true, tools, messages: [{ role: 'user', content: 'Call git_status now.' }] }),
    })
    const deltas = (await res.text()).split('\n').filter((line) => line.startsWith('data: {')).flatMap((line) => JSON.parse(line.slice(6)).choices?.[0]?.delta?.tool_calls ?? [])
    const text = deltas.map((call) => call.function?.arguments ?? '').join('')
    try {
      return deltas.length && typeof JSON.parse(text) === 'object' ? pass(`arguments ${JSON.stringify(text)}`) : fail(`no tool call: ${res.status}`)
    } catch {
      return fail(`arguments are not JSON: ${JSON.stringify(text)}`)
    }
  },
})

// ── Devin ─────────────────────────────────────────────────────────────────

const devin = {
  // Usage buckets must arrive OpenAI-style: prompt_tokens is the whole
  // prompt (uncached + cache read + write), so the host's
  // prompt_tokens − cached − write recovers the uncached input. The old
  // mapping sent the bare exclusive count, clamping warm calls to 0 input.
  // Devin's prefix cache commits async — a run with no hit still passes on
  // turn 1's usage; only a whole-prompt violation (prompt < cached) fails.
  async usageBuckets(chat) {
    const key = `live-smoke-devin-${Date.now().toString(36)}`
    const filler = Array.from({ length: 160 }, (_, i) => `context line ${i} ${'x'.repeat(60)}`).join('\n')
    const messages: any[] = [{ role: 'user', content: `Reply with the single word PONG.\n${filler}` }]
    const one = await chat({ model: 'swe-2', max_tokens: 256, prompt_cache_key: key, messages })
    if (one.status !== 200) return fail(`turn 1 HTTP ${one.status} ${JSON.stringify(one.raw).slice(0, 160)}`)
    const first = one.raw?.usage
    if (!first?.prompt_tokens) return fail(`no usage on turn 1: ${JSON.stringify(one.raw).slice(0, 160)}`)
    messages.push({ role: 'assistant', content: one.text || 'PONG' }, { role: 'user', content: 'Reply PONG again.' })
    const two = await chat({ model: 'swe-2', max_tokens: 256, prompt_cache_key: key, messages })
    const usage = two.status === 200 && two.raw?.usage ? two.raw.usage : first
    const cached = usage.prompt_tokens_details?.cached_tokens ?? 0
    const write = usage.prompt_tokens_details?.cache_write_tokens ?? 0
    if (usage.prompt_tokens < cached) return fail(`prompt_tokens ${usage.prompt_tokens} < cached ${cached} — exclusive mapping is back`)
    const which = two.status === 200 && two.raw?.usage ? 'turn2' : 'turn1 (turn2 HTTP ' + two.status + ')'
    return pass(`${which}: prompt ${usage.prompt_tokens} · cached ${cached} · write ${write} · uncached ${usage.prompt_tokens - cached - write}`)
  },
}

const CHECKS = {
  cursor: { checks: cursor },
  devin: { checks: devin },
  kiro: {
    checks: kiro,
    async setup(session) {
      const { refreshKiroCatalog } = await import('../lib/oauth/kiro/catalog.js')
      return { models: await refreshKiroCatalog(session) }
    },
  },
}

if (!args.families.length || args.families.some((family) => !CHECKS[family])) {
  console.error(`usage: node --experimental-strip-types scripts/live-smoke.ts <${Object.keys(CHECKS).join('|')}>[,…] [--profile desktop] [--account N] [--timeout 90]`)
  process.exit(2)
}

let failed = 0
for (const family of args.families) {
  const { checks, setup } = CHECKS[family]
  let session
  let proxy
  try {
    session = await pickSession(family)
    const ctx = setup ? await setup(session) : {}
    proxy = createProxy({ port: 0, apiKey: KEY, tokens: { [family]: { session: async () => session } } })
    const server = await proxy.listen()
    const base = `http://127.0.0.1:${server.address().port}`
    const chat = chatClient(base, family)
    ctx.base = base
    for (const [name, run] of Object.entries<any>(checks)) {
      const result = await run(chat, ctx).catch((error) => fail(`threw ${error?.name ?? 'Error'}: ${error?.message ?? error}`))
      if (!result.ok) failed += 1
      console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${family}/${name}  ${result.detail}`)
    }
  } catch (error) {
    failed += 1
    console.log(`FAIL  ${family}  ${error?.message ?? error}`)
  } finally {
    await proxy?.close()
  }
}
process.exit(failed ? 1 : 0)
