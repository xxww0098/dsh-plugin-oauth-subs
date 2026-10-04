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
  return scanSseFrame(frame).kind
}

/**
 * One frame, fully read: its classification, its event type, and — only when
 * the caller asked for that type — the parsed `data:` JSON. `data` is set only
 * for a capture match, so a classification-time parse of a data-only frame is
 * never mistaken for a captured one, and a captured frame's JSON is parsed
 * only when classification did not already parse it.
 */
export function scanSseFrame(frame: string, captureType?: string): { kind: SseFrameKind, type: string | undefined, data: any } {
  const data: string[] = []
  let event: string | undefined
  for (const line of frame.split(/\r?\n/)) {
    // Data lines can follow the event line (and do, in every real frame), so
    // the scan never breaks early.
    if (line.startsWith('event:') && event === undefined) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5))
  }
  let parsed: any
  let type = event
  if (type === undefined) {
    try {
      parsed = JSON.parse(data.join('\n'))
      type = parsed?.type
    } catch { type = undefined }
  }
  if (typeof type !== 'string' || !type) return { kind: 'other', type: undefined, data: undefined }
  if (captureType === type && parsed === undefined) {
    try { parsed = JSON.parse(data.join('\n')) } catch { parsed = undefined }
  }
  return {
    kind: PREAMBLE_EVENT_TYPES.has(type) ? 'preamble' : 'output',
    type,
    data: captureType === type ? parsed : undefined,
  }
}

/**
 * Splits a byte stream into classified frames, keeping the unfinished tail for
 * the next chunk. The tail is held as latin1 so byte counts are exact and a
 * UTF-8 sequence split across chunks is only decoded once its frame is whole.
 */
export class SseFrameScanner {
  #tail = ''
  #captureType: string | undefined
  #onCaptured: ((data: any) => void) | undefined

  constructor(capture?: { type: string, onData: (data: any) => void }) {
    this.#captureType = capture?.type
    this.#onCaptured = capture?.onData
  }

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
      const scanned = scanSseFrame(frame, this.#captureType)
      frames.push({ kind: scanned.kind, bytes: end - start })
      if (this.#onCaptured && scanned.data !== undefined) this.#onCaptured(scanned.data)
      start = end
    }
    this.#tail = this.#tail.slice(start)
    return frames
  }
}
