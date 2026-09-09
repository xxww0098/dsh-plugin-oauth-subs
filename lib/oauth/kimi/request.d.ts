/**
 * Kimi Completions hop. Map DSH `reasoning_effort` onto
 * `thinking` / `thinking.effort` when the catalog advertises it.
 * Official Kimi Code accepts effort only inside `thinking`.
 */
export declare function applyKimiThinking(payload: {}, model: any): {};
/** Map vendor cache-read aliases. Absent field stays absent — do not invent 0. */
export declare function mapKimiUsage(usage: any): any;
/** Completions SSE omits usage unless the vendor is asked. Do not override an explicit value. */
export declare function applyKimiStreamUsage(payload?: {}): {};
