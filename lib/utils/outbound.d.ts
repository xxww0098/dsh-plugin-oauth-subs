/**
 * Single owner of outbound HTTP: chat, quota, catalog, refresh, and login
 * hops all go through `outboundFetch`; the Cursor h2 dialer asks
 * `outboundProxyFor`. Nothing else in src/ imports undici or the global fetch.
 *
 * Resolution: plugin config proxyUrl > Settings outbound-proxy.json > env
 * (HTTPS_PROXY / HTTP_PROXY / ALL_PROXY). Loopback and NO_PROXY stay direct.
 * Does not call setGlobalDispatcher — DSH and other plugins keep their fetch.
 */
export declare const OUTBOUND_PROXY_FILE = "outbound-proxy.json";
export declare function outboundProxyPath(dataDir: any): string;
export declare function normalizeProxyUrl(raw: any): string | undefined;
export declare function envProxyUrl(env?: NodeJS.ProcessEnv): string | undefined;
export declare function envNoProxy(env?: NodeJS.ProcessEnv): string[];
export declare function resolveProxyUrl(configUrl: any, settingsUrl: any, env?: NodeJS.ProcessEnv): string | undefined;
export declare function proxySource(configUrl: any, settingsUrl: any, env?: NodeJS.ProcessEnv): "config" | "settings" | "env" | "off";
export declare function shouldBypassProxy(target: any, noProxy?: string[]): boolean;
export declare function redactProxyUrl(url: any): string;
export declare function normalizeOutboundPrefs(raw: any): {
    url: any;
};
export declare function defaultOutboundPrefs(): {
    url: string;
};
export declare function readOutboundPrefs(path: any): Promise<{
    url: any;
}>;
export declare function writeOutboundPrefs(path: any, prefs: any): Promise<{
    url: any;
}>;
/**
 * One configured owner: a direct Agent plus the proxy agent. `ready` always
 * settles; a build failure is kept as `error` and fails every proxied request
 * instead of silently going direct.
 */
export declare function createOutboundSession({ path, configUrl, env, fetchFn, agentFor, }?: any): {
    ready: Promise<void>;
    request: (input: any, init?: any) => Promise<any>;
    proxyFor(target: any): Promise<string | undefined>;
    snapshot(): {
        error?: string | undefined;
        url: string;
        source: string;
        configured: boolean;
    };
    setUrl(raw: any): Promise<any>;
    /** Frees both agents; later proxied requests fail instead of going direct. */
    close(): Promise<void>;
};
/**
 * Point the module-level owner at this plugin instance. The caller's
 * `ctx.effect` cleanup calls `close()` on the returned session; a newer
 * instance simply replaces it, so hot reload order does not matter.
 */
export declare function configureOutbound(options?: any): any;
/** The one outbound fetch: direct Agent, or ProxyAgent when a proxy applies. */
export declare function outboundFetch(input: any, init?: any): any;
/** Proxy URL (with credentials) the Cursor h2 dialer should tunnel through, if any. */
export declare function outboundProxyFor(url: any): any;
