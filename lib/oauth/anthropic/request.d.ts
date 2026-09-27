/**
 * Shape the DSH anthropic-messages body for api.anthropic.com.
 *
 * The host already speaks anthropic-messages natively (system / tools /
 * thinking / cache_control are the host's own lane), so this module only
 * repairs the edges Anthropic is strict about — it must not re-manage cache
 * checkpoints or thinking:
 *   - `max_tokens` is required by the Messages API; DSH compaction can send a
 *     missing/invalid one only on malformed requests, so the family default
 *     (64k) keeps the hop answerable instead of 400ing.
 *   - `service_tier` fast/priority is a Codex concept; Anthropic's tier
 *     values are auto/standard only and a stray value would 400.
 * Everything else passes through byte-for-byte.
 */
export declare function normalizeAnthropicMessagesBody(payload: any): any;
