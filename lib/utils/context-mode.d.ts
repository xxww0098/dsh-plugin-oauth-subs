/**
 * Codex large-context — host-side picker aliases.
 *
 * Eligible models advertise a `max_context_window` well above their default
 * window: 872K on GPT-5.6 Sol / Terra / Luna, 1M on gpt-5.4. The large window
 * is opt-in via a `-900k` suffix, kept as a stable id even though the real
 * ceiling is per-model. The suffix is stripped before the id goes upstream.
 *
 * gpt-5.5, gpt-5.4-mini and Spark cap at their default window — no variant.
 */
export declare const CONTEXT_VARIANT_SUFFIX = "-900k";
export declare function isLargeContextId(modelId: any): boolean;
export declare function isLargeContextKey(key: any): boolean;
/** The model's `max_context_window`, or undefined when it has no large variant. */
export declare function codexLargeContext(modelId: any): number;
export declare function isCodex900kBase(modelId: any): boolean;
export declare function peelContextSuffix(modelId: any): {
    model: string;
    requestedLarge: boolean;
};
export declare function applyContextMode(payload: any): any;
