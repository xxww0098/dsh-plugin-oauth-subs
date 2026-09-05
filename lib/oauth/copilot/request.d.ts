/**
 * Copilot Completions hop. Keep OpenAI `reasoning_effort` when the
 * catalog advertises it. Official Copilot CLI omits maxOutputTokens for
 * GPT models. Map cache_read_* onto OpenAI cached_tokens.
 */
export declare function applyCopilotThinking(payload: {}, model: any): {};
export declare function mapCopilotUsage(usage: any): any;
