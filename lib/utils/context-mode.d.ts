/**
 * Large-context ceilings and stale-alias peeling.
 *
 * Some catalog rows advertise a `maxContextWindow` well above the window
 * their plan serves by default: Codex rows carry `max_context_window` 872K
 * on top of the 258K default; GLM-5.3 / GLM-5.3-Flash keep the official 1M
 * window (docs.z.ai model page) on top of the plan's 400K input cap. Devin /
 * Cline / Command Code / Ollama rows can carry one too (same family-scoped
 * lookup) — their sources expose a single window each, so none declares one
 * yet; the slot is what makes a maintainer pin (or a source that later grows
 * a second field) authoritative instead of silently ignored. The
 * large window is the row's custom input-context ceiling (`maxContextOfRow`)
 * — older plugin versions also grew opt-in `-900k` / `-1m` picker rows from
 * it; those rows no longer exist, but `peelContextSuffix` keeps stripping
 * the suffix from routes those versions wrote (strict base validation, so
 * real ids that merely end in a suffix — Devin's `-1m` backends — go
 * upstream untouched).
 */
export declare const CONTEXT_VARIANT_SUFFIX = "-900k";
/**
 * 872000 -> "872K", 1000000 -> "1M". Windows that are exact binary sizes
 * (and not decimal ones) keep their nominal label: 1048576 -> "1M",
 * 262144 -> "256K", instead of the misleading "1049K" / "262K".
 */
export declare function formatWindow(tokens: any): string;
/** The Codex row's `max_context_window`, or undefined when it has none. */
export declare function codexMaxContextWindow(modelId: any): any;
/** The row's `maxContextWindow` across families, or undefined when it has none. */
export declare function maxContextWindowOf(modelId: any): any;
/**
 * Family-scoped ceiling lookup. Vendor ids collide across families
 * (`gpt-6-sol` exists in both `codex` and `copilot`, with different ceilings),
 * so `maxContextOfRow` resolves the row inside its own family and falls back
 * to the row's catalog window — never another family's ceiling. Codex / GLM /
 * Copilot answer from their own catalog lookups; Devin / Cline / Command Code
 * / Ollama are plain static floors, so their branch scans the frozen rows.
 */
export declare function familyMaxContextWindow(family: any, modelId: any): any;
export declare function isCodex900kBase(modelId: any): boolean;
/**
 * Picker classification is suffix-surface: any id ending in a known context
 * suffix is an opt-in alias, even when the base is not in the static catalog
 * (live rows, renamed ids) — an unknown `-900k` / `-1m` key must stay opt-in,
 * never default-on. Peeling is the opposite: strict base validation, so an
 * unknown `foo-1m` model id reaches upstream untouched.
 */
export declare function isLargeContextId(modelId: any): boolean;
export declare function isLargeContextKey(key: any): boolean;
export declare function peelContextSuffix(modelId: any): {
    model: string;
    requestedLarge: boolean;
};
export declare function applyContextMode(payload: any): any;
