/**
 * Fast / Priority Processing for the DSH proxy.
 *
 * Fast is Codex-only. Eligible catalog rows (gpt-5.6-sol/terra/luna, gpt-5.5,
 * gpt-5.4 — not mini, not Spark) grow a host-side `-fast` sibling. The suffix
 * is peeled before the wire; the request then asks for Priority the way Codex
 * CLI does: body `service_tier: "priority"` plus
 * `x-codex-routing-hint: model=<id>;tier=priority`.
 *
 * Grok never gets a `-fast` row and never sends `service_tier`. Grok 4.6
 * accepts `priority` on the wire but a 2026-08-30 interleaved run showed no
 * throughput gain (ratio 0.994). Older Grok ids reject the field; a stale
 * `grok-*-fast` id is still peeled so it cannot 400 as a fake model.
 *
 * Suffix peeling does not read `fast-mode.json`. That leftover UI toggle is
 * ignored.
 */
export declare const FAST_SUFFIX = "-fast";
/** Eligibility is a property of the Codex catalog row, so peel host aliases first. */
export declare function modelSupportsFastMode(modelId: any): boolean;
export declare function peelFastSuffix(modelId: any): {
    model: string;
    requestedFast: boolean;
};
export declare function applyFastMode(payload: any): any;
