/**
 * DSH OpenAI-Completions body ↔ Devin GetChatMessage (Connect/protobuf).
 *
 * Mapping (from the exa protos + the reference client):
 *   system / developer   → request.prompt (one string, joined — it IS the
 *                          Cascade system prompt; DSH's extra snapshots join
 *                          in order so the stable leading system stays first)
 *   user                 → ChatMessagePrompt{ source: USER(1) }
 *   assistant            → ChatMessagePrompt{ source: SYSTEM(2), prompt,
 *                          thinking, signature, tool_calls }
 *   tool                 → ChatMessagePrompt{ source: TOOL(4), tool_call_id }
 *   tools[]              → ChatToolDefinition{ json_schema_string }
 *   model + effort       → chat_model_uid via catalog `variants` (effort is a
 *                          uid suffix upstream, not a parameter)
 *
 * `message_id`s are deterministic UUIDs off the cascade so history rebuilds
 * keep stable ids (same shape the reference client uses).
 */
export { devinBasicAuth, devinMetadataBytes } from './metadata.js';
/**
 * Resolve the picker id + DSH reasoning_effort to a backend chat_model_uid.
 * A raw `*-low`-style uid passes through untouched; a family row resolves via
 * the catalog's `variants` map (defaultUid when effort is unset/unknown).
 */
export declare function devinWireModelId(model: any, reasoningEffort: any): any;
/**
 * Build the GetChatMessageRequest fields (submessages already encoded) plus
 * the conversation ids the transport needs. `metadata` is applied at send
 * time by the transport (it carries the per-request user_jwt).
 */
export declare function openaiToDevin(payload: any, { cascadeId, executionId }?: any): {
    fields: {
        prompt: string;
        chatMessagePrompts: any[];
        chatModelUid: any;
        cascadeId: any;
        executionId: any;
        configuration: Buffer<ArrayBuffer>;
        tools: {
            name: string;
            description: string;
            jsonSchemaString: string;
            strict: boolean;
        }[];
        toolChoice: {
            optionName: string;
            toolName?: undefined;
        } | {
            toolName: string;
            optionName?: undefined;
        };
    };
    cascadeId: any;
    chatModelUid: any;
};
/**
 * ModelUsageStats' buckets are disjoint (Anthropic-style): input_tokens is
 * the uncached remainder, cache read/write their own fields, their sum the
 * whole prompt (oh-my-pi usage/devin.ts totalTokens). OpenAI prompt_tokens
 * must be that whole prompt — the host recovers the uncached input as
 * prompt_tokens − cached_tokens − cache_write_tokens (pi-ai
 * parseChunkUsage), so a bare inputTokens clamps every cache-hit call's
 * input to 0. Cache write rides prompt_tokens_details: that is the only
 * cache-write field the host reads.
 */
export declare function mapDevinUsage(usage: any): any;
export declare function devinStopReasonToFinish(reason: any, hasToolCalls: any): "tool_calls" | "stop" | "length";
/**
 * `collected` is what runDevinChat accumulated:
 *   { text, thinking, toolCalls:[{id,name,argumentsJson}], usage, stopReason, messageId }
 */
export declare function devinToOpenai(collected: any, { model, id }?: any): any;
/**
 * Translate Devin stream events into OpenAI chat.completion.chunk objects. Events
 * come from runDevinChat: {type:'text'|'thinking'|'tool'|'usage'|'done', …}.
 */
export declare function createDevinOpenaiStream({ model, id }?: any): {
    id: any;
    text: () => string;
    thinking: () => string;
    /**
     * The role chunk rides with the first content chunk: usage or a stop
     * before any output must not commit the client head.
     */
    push(event: any): any[];
    finish(): any[];
};
