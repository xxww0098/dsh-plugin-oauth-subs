/**
 * Inbound request body: size-capped read and the per-family rewrite that
 * strips or applies cache fields before a hop (each family's own cache.ts
 * owns the rewrite; this only dispatches).
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
    grokModel?: undefined;
    routingHint?: undefined;
    copilotVision?: undefined;
    copilotInitiator?: undefined;
    threadId?: undefined;
} | {
    payload: any;
    cacheSessionId: string;
    stream: boolean;
    grokModel: any;
    routingHint?: undefined;
    copilotVision?: undefined;
    copilotInitiator?: undefined;
    threadId?: undefined;
} | {
    payload: any;
    cacheSessionId: string | undefined;
    stream: boolean;
    routingHint: string | undefined;
    grokModel?: undefined;
    copilotVision?: undefined;
    copilotInitiator?: undefined;
    threadId?: undefined;
} | {
    payload: any;
    cacheSessionId: string;
    stream: boolean;
    copilotVision: boolean;
    copilotInitiator: string;
    grokModel?: undefined;
    routingHint?: undefined;
    threadId?: undefined;
} | {
    payload: any;
    cacheSessionId: string | undefined;
    threadId: string | undefined;
    stream: boolean;
    grokModel?: undefined;
    routingHint?: undefined;
    copilotVision?: undefined;
    copilotInitiator?: undefined;
};
