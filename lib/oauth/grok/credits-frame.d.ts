/**
 * gRPC-web decoder for grok.com GetGrokCreditsConfig.
 *
 * Live captures (2026-07/08): top-level field 1 is a nested credits message.
 *   field 1  fixed32  usage — either a 0–1 ratio or a 0–100 percent
 *   field 5  message  google.protobuf.Timestamp { seconds, nanos }
 *
 * CLI JSON at /v1/billing?format=credits often omits creditUsagePercent for
 * unified-billing SuperGrok / X Premium+ accounts. This endpoint still has
 * the weekly pool.
 */
export declare const GROK_WEB_EMPTY_FRAME: Buffer<ArrayBuffer>;
export declare function decodeGrokCreditsFrame(buffer: any): {
    usedPercent: number;
    resetAt: number;
};
