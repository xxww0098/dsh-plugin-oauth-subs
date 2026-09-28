/**
 * SSE frame classification for the Responses commit gate. Only complete frames
 * are classified, and only by their top-level type: `response.created` echoes
 * the request's `instructions` and `tools`, whose nested `"type"` keys are not
 * events.
 */

export type SseFrameKind = 'preamble' | 'output' | 'other'

/**
 * Events that carry no output, so a stream ending here is worth retrying. The
 * `codex.*` frames are handshake metadata; the allow-list mirrors CLIProxyAPI's
 * `isCodexHandshakeMetadataEvent`, which solves the same problem against the
 * same backend.
 */
const PREAMBLE_EVENT_TYPES = new Set([
  'response.created',
  'response.in_progress',
  'response.queued',
  'codex.rate_limits',
  'codex.response.metadata',
])

/**
 * `event:` wins; without one, the top-level `type` of the `data:` JSON. Any
 * typed non-preamble frame is output — a terminal `response.failed` or an
 * Anthropic `message_start` included — and anything untyped is `other`.
 */
export function classifySseFrame(frame: string): SseFrameKind {
  const data: string[] = []
  let type: unknown
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      type = line.slice(6).trim()
      break
    }
    if (line.startsWith('data:')) data.push(line.slice(5))
  }
  if (type === undefined) {
    try { type = JSON.parse(data.join('\n'))?.type } catch { type = undefined }
  }
  if (typeof type !== 'string' || !type) return 'other'
  return PREAMBLE_EVENT_TYPES.has(type) ? 'preamble' : 'output'
}

/**
 * Splits a byte stream into classified frames, keeping the unfinished tail for
 * the next chunk. The tail is held as latin1 so byte counts are exact and a
 * UTF-8 sequence split across chunks is only decoded once its frame is whole.
 */
export class SseFrameScanner {
  #tail = ''

  push(chunk: Uint8Array): { kind: SseFrameKind, bytes: number }[] {
    // A separator already fully in the old tail would have been split off, so
    // only its last 3 bytes can start one.
    const from = Math.max(0, this.#tail.length - 3)
    this.#tail += Buffer.from(chunk).toString('latin1')
    const separator = /\r?\n\r?\n/g
    separator.lastIndex = from
    const frames: { kind: SseFrameKind, bytes: number }[] = []
    let start = 0
    for (let match = separator.exec(this.#tail); match; match = separator.exec(this.#tail)) {
      const end = match.index + match[0].length
      const frame = Buffer.from(this.#tail.slice(start, match.index), 'latin1').toString('utf8')
      frames.push({ kind: classifySseFrame(frame), bytes: end - start })
      start = end
    }
    this.#tail = this.#tail.slice(start)
    return frames
  }
}
