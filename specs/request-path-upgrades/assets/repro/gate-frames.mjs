// F3 repro. The old regex scan treated nested "type" keys inside
// `response.created` as output, and its ~128KB `instructions` echo blew the
// 64 KiB cap. Slice 03 classifies complete frames by their top-level type
// (lib/oauth/responses-sse.js); preamble bytes no longer count toward the cap.
// Run from the repo root after `npm run build`:
//   node specs/request-path-upgrades/assets/repro/gate-frames.mjs
// Expected: output=false for preamble-only and mid-frame splits, true once a
// delta frame is whole. test/fixtures/*-preamble.sse hold the live captures.
const { SseFrameScanner } = await import(new URL('../../../../lib/oauth/responses-sse.js', import.meta.url))

function scan(text) {
  const frames = new SseFrameScanner().push(new TextEncoder().encode(text))
  return {
    preamble: frames.some((f) => f.kind === 'preamble'),
    output: frames.some((f) => f.kind === 'output'),
    preambleBytes: frames.filter((f) => f.kind === 'preamble').reduce((n, f) => n + f.bytes, 0),
  }
}

const instructions = 'x'.repeat(130_000) // DSH system prompt is ~128KB
const created = `event: response.created\ndata: {"type":"response.created","response":{"instructions":"${instructions}","text":{"format":{"type":"text"}},"tools":[{"type":"function","name":"shell","parameters":{"type":"object"}}]}}\n\n`
const inProgress = created.replaceAll('response.created', 'response.in_progress')
const delta = 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hi"}\n\n'

console.log('preamble only   :', scan(created + inProgress), '(preamble bytes are not capped)')
console.log('split mid-frame :', scan(created + delta.slice(0, 20)))
console.log('then output     :', scan(created + inProgress + delta))
