/**
 * Inbound request body: size-capped read and the per-family rewrite that
 * strips or applies cache fields before a hop. The rewrite itself lives in
 * each family's own cache.ts; this only dispatches, by looking the family's
 * `applyCache` row up in `families.ts`.
 */
export declare const MAX_REQUEST_BODY_BYTES: number;
export declare function readBody(request: any, limit?: number): Promise<unknown>;
/**
 * Per-family count of inbound bodies with / without DSH's `prompt_cache_key`,
 * taken before any family strips it. Served on `/health` as the one signal
 * that the host actually sends session ids to the loopback. Counts only.
 */
export declare const inboundCacheKeys: Record<string, {
    with: number;
    without: number;
}>;
export declare function rewriteUpstreamBody(buffer: any, family: any, wire?: any): {
    payload: any;
    cacheSessionId: any;
    stream: boolean;
    [extra: string]: any;
};
