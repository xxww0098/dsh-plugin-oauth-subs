/**
 * Fast / Priority Processing for the DSH proxy.
 *
 * Fast is the Codex catalog's `priority` service tier — "1.5x speed, increased
 * usage". Measured at 88.3 against 57.5 output tokens/second on gpt-5.6-luna
 * (1.54x, four interleaved runs, 2026-08-26); it lifts generation throughput
 * only, not time to first token. Eligibility comes from each model's catalog
 * row, so models whose `service_tiers` is empty — gpt-5.4-mini, Spark — never
 * get the suffix. On xAI, Grok 4.6 accepts Priority Processing; older ids
 * reject the field outright.
 *
 * The `-fast` suffix is host-side only and is peeled before the upstream request.
 */
export declare const FAST_SUFFIX = "-fast";
export declare function isGrok46Family(modelId: any): boolean;
/** Eligibility is a property of the base model, so peel host-side aliases first. */
export declare function modelSupportsFastMode(modelId: any): boolean;
export declare function peelFastSuffix(modelId: any): {
    model: string;
    requestedFast: boolean;
};
export declare function applyFastMode(payload: any): any;
