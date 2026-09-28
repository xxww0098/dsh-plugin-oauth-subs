// F3 repro + accepted prototype. The shipped regex scan treats nested "type"
// keys inside `response.created` as output; the frame-level classifier below
// (top-level type of complete frames only, preamble bytes not counted) does not.
// Run from the repo root after `npm run build`:
//   node specs/request-path-upgrades/assets/repro/gate-frames.mjs
// Frame shape follows the OpenAI Responses docs; Slice 03 replaces it with a
// live Codex capture before the fix lands.
const { hasOutputEvent, hasPreambleEvent } = await import(new URL('../../../../lib/oauth/proxy.js', import.meta.url))

const PREAMBLE = new Set(['response.created', 'response.in_progress', 'response.queued', 'codex.rate_limits', 'codex.response.metadata'])

function frameType(frame) {
  let data = ''
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) return line.slice(6).trim()
    if (line.startsWith('data:')) data += line.slice(5).trimStart()
  }
  try { return JSON.parse(data)?.type } catch { return undefined }
}

// Complete frames only; an unfinished tail waits for the next chunk.
function scan(text) {
  const frames = text.split(/\r?\n\r?\n/)
  frames.pop()
  let preamble = false
  let output = false
  for (const frame of frames) {
    const type = frameType(frame)
    if (type === undefined) continue
    if (PREAMBLE.has(type)) preamble = true
    else output = true
  }
  return { preamble, output }
}

const instructions = 'x'.repeat(130_000) // DSH system prompt is ~128KB
const created = `event: response.created\ndata: {"type":"response.created","response":{"instructions":"${instructions}","text":{"format":{"type":"text"}},"tools":[{"type":"function","name":"shell","parameters":{"type":"object"}}]}}\n\n`
const inProgress = created.replaceAll('response.created', 'response.in_progress')
const delta = 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hi"}\n\n'

console.log('shipped regex on response.created: preamble', hasPreambleEvent(created), 'output', hasOutputEvent(created), '(output=true is the bug)')
console.log('preamble bytes (created + in_progress):', (created + inProgress).length, '> 64 KiB cap')
console.log('prototype, preamble only :', scan(created + inProgress))
console.log('prototype, split mid-frame:', scan(created + delta.slice(0, 20)))
console.log('prototype, then output   :', scan(created + inProgress + delta))
