/**
 * DSH OpenAI-Completions body ↔ Command Code `POST /alpha/generate` wire.
 *
 * Wire shape (decoded from the command-code CLI bundle; re-verified identical at 1.77.0):
 *   request : { config, memory:null, taste:null, skills:null, mode:'chat',
 *               permissionMode, threadId?, params:{ model, messages, tools,
 *               system, max_tokens, stream:true, temperature?,
 *               reasoning_effort? } }
 *   messages: user    { role:'user',      content: string | part[] }
 *             assist. { role:'assistant', content: [{type:'text'|'reasoning'|
 *                          'tool-call', text, signature?, toolCallId, toolName,
 *                          input}] }
 *             tool    { role:'tool',      content: [{type:'tool-result',
 *                          toolCallId, toolName, output:{type:'text'|
 *                          'error-text', value}}] }
 *   tools   : [{ name, description, input_schema }]   (Anthropic spelling)
 *   response: JSONL events — reasoning-delta/text-delta {text}, tool-call
 *             {toolCallId, toolName, input}, finish {totalUsage, finishReason,
 *             rawFinishReason}, error {message,statusCode,isRetryable}, abort.
 *
 * `config` mirrors buildServerConfig with honest empty context: DSH has no
 * working directory or git state to report, so the fields stay blank rather
 * than fabricating a workspace.
 */
export declare const COMMAND_CODE_MAX_TOKENS = 64000;
/**
 * Build the `/alpha/generate` body. `threadId` is the cache-affinity field the
 * server uses to pin a conversation's KV; it must be a uuid or absent.
 */
export declare function openaiToCommandCode(payload: any, { threadId }?: any): any;
export declare function mapCommandCodeUsage(usage: any): any;
export declare function commandCodeFinishReason(reason: any, hasToolCalls: any): "tool_calls" | "stop" | "length";
/**
 * `collected` is what runCommandCodeChat accumulated:
 *   { text, reasoning, toolCalls:[{id,name,argumentsJson}], usage, finishReason }
 */
export declare function commandCodeToOpenai(collected: any, { model, id }?: any): any;
/**
 * Translate Command Code JSONL events into OpenAI chat.completion.chunk SSE.
 * `tool-call` events carry the complete `input` object (the upstream emits the
 * call whole, not argument deltas), so each becomes one tool_calls chunk.
 */
export declare function createCommandCodeOpenaiStream({ model, id }?: any): {
    id: any;
    push(event: any): any[];
    finish(): any[];
};
