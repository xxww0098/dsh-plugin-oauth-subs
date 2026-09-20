/**
 * Outbound HTTP(S) proxy for upstream model / quota / login hops.
 * Never used for the 127.0.0.1 loopback server itself.
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
export declare function proxySource(configUrl: any, settingsUrl: any, env?: NodeJS.ProcessEnv): "env" | "settings" | "off" | "config";
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
export declare function createOutboundFetch({ proxyUrl, env, fetchFn, agentFor, }?: any): any;
export declare function createOutboundSession({ path, configUrl, env, fetchFn, agentFor, }?: any): {
    ready: Promise<unknown>;
    fetchFn: (input: any, init?: any) => any;
    resolvedUrl: () => string | undefined;
    snapshot(): {
        url: string;
        source: string;
        configured: boolean;
    };
    setUrl(raw: any): Promise<any>;
};
