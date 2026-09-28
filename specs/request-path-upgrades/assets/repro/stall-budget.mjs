// F2 repro: the compiled proxy against a fake upstream, with scaled upstreamTimeouts
// (first byte 2s, budget 5.5s). The backoff (1s, 4s) is not scaled, so the budget
// is picked to keep production's shape: 2 × first byte + 1s fits, + 4s does not.
// Run from the repo root after `npm run build`:
//   node specs/request-path-upgrades/assets/repro/stall-budget.mjs
// Before the fix (idle timeout scaled to 1s):
//   stall before headers -> the proxy never gives up (client aborts at 12s)
//   headers, no body     -> 502 after ~7.2s (3 x idle + ~5s backoff); at production
//                           scale 3 x 120s + 5s ≈ 365s > the host's 300s watchdog
// After slice 04:
//   stall before headers -> 504 "no output within 5.5s (2 attempts)" after ~5s
//   headers, no body     -> the same; at production scale 120 + 1 + 120 ≈ 241s < 300s
const { createProxy } = await import(new URL('../../../../lib/oauth/proxy.js', import.meta.url))

const session = { accessToken: 't', apiKey: 'k' }
const tokens = { ollama: { session: async () => session } }

async function run(label, fetchFn, clientTimeoutMs) {
  const proxy = createProxy({ port: 0, apiKey: 'p', tokens, fetchFn, upstreamTimeouts: { firstByteMs: 2000, budgetMs: 5500 } })
  const server = await proxy.listen()
  const started = Date.now()
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), clientTimeoutMs)
  let outcome
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/ollama/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer p', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'm', stream: true, messages: [] }),
      signal: abort.signal,
    })
    outcome = `HTTP ${response.status} ${(await response.text()).slice(0, 120)}`
  } catch (error) {
    outcome = `client gave up (${error.name})`
  }
  clearTimeout(timer)
  console.log(`${label} -> ${outcome} after ${((Date.now() - started) / 1000).toFixed(1)}s`)
  server.closeAllConnections?.()
  await proxy.close()
}

await run('stall before headers', () => new Promise(() => {}), 12_000)
await run('headers, no body', async () => new Response(
  new ReadableStream({ pull: () => new Promise(() => {}) }),
  { status: 200, headers: { 'content-type': 'text/event-stream' } },
), 30_000)
