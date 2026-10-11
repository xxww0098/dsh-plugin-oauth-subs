/**
 * Single owner of outbound HTTP: chat, quota, catalog, refresh, and login
 * hops all go through `outboundFetch`; the Cursor h2 dialer asks
 * `outboundProxyFor`. Nothing else in src/ imports undici or the global fetch.
 *
 * Resolution: plugin config proxyUrl always wins; below that the Settings
 * mode tri-state decides — auto (system proxy via `scutil --proxy` on darwin,
 * env HTTPS_PROXY/HTTP_PROXY/ALL_PROXY as fallback), off (direct even when
 * env is set), custom (the saved URL). Loopback and NO_PROXY stay direct.
 * Does not call setGlobalDispatcher — DSH and other plugins keep their fetch.
 */
import { Agent, ProxyAgent, WebSocket } from 'undici';
export { WebSocket as OutboundWebSocket };
export declare const OUTBOUND_PROXY_FILE = "outbound-proxy.json";
export declare const OUTBOUND_MODES: string[];
export declare function outboundProxyPath(dataDir: any): string;
export declare function normalizeProxyUrl(raw: any): string | undefined;
export declare function envProxyUrl(env?: NodeJS.ProcessEnv): string | undefined;
export declare function envNoProxy(env?: NodeJS.ProcessEnv): string[];
/**
 * Resolve the effective proxy URL. `settingsUrl`/`mode` carry the Settings
 * prefs; a legacy caller that passes no `mode` gets the pre-mode semantics
 * (a non-empty settings URL means custom, an empty one means auto).
 */
export declare function resolveProxyUrl(configUrl: any, settingsUrl: any, env?: NodeJS.ProcessEnv, mode?: any, autoUrl?: string): string | undefined;
/** Which tier won: config > settings > os (scutil) > env > off. */
export declare function proxySource(configUrl: any, settingsUrl: any, env?: NodeJS.ProcessEnv, mode?: any, autoSource?: string): "off" | "config" | "settings" | "os" | "env";
export declare const SCUTIL_PATH = "/usr/sbin/scutil";
/** Parse `scutil --proxy` output: HTTPS wins over plain HTTP, SOCKS/PAC-only
 *  settings yield no URL (ProxyAgent speaks http(s) CONNECT tunnels only),
 *  and ExceptionsList entries join the bypass rules verbatim — the suffix
 *  matcher in `shouldBypassProxy` already understands bare domains. */
export declare function parseScutilProxy(text: any): {
    url: string;
    bypass: string[];
};
export declare function shouldBypassProxy(target: any, noProxy?: string[]): boolean;
export declare function redactProxyUrl(url: any): string;
/** `{mode, url}`; a legacy `{url}` file means custom, a missing mode means auto. */
export declare function normalizeOutboundPrefs(raw: any): {
    mode: any;
    url: any;
};
export declare function defaultOutboundPrefs(): {
    mode: string;
    url: string;
};
export declare function readOutboundPrefs(path: any): Promise<{
    mode: any;
    url: any;
}>;
export declare function writeOutboundPrefs(path: any, prefs: any): Promise<{
    mode: any;
    url: any;
}>;
/**
 * One configured owner: a direct Agent plus the proxy agent. `ready` always
 * settles; a build failure is kept as `error` and fails every proxied request
 * instead of silently going direct.
 */
export declare function createOutboundSession({ path, configUrl, env, fetchFn, agentFor, readSystemProxy, }?: any): {
    ready: Promise<void>;
    request: (input: any, init?: any) => Promise<any>;
    proxyFor(target: any): Promise<string | undefined>;
    snapshot(): {
        error?: string | undefined;
        mode: string;
        url: string;
        source: string;
        configured: boolean;
    };
    /** Settings view: carries the raw custom URL for the input prefill — it
     *  must never flow into the status snapshot (that one is cached in
     *  localStorage); `resolved` stays redacted for display. */
    prefs(): Promise<{
        error?: string | undefined;
        mode: string;
        url: string;
        source: string;
        resolved: string;
        configured: boolean;
    }>;
    /** Tri-state write; a legacy `{url}` payload means custom (a URL was
     *  given) or auto (clearing). Non-custom modes keep the stored URL so the
     *  draft survives an 自动/关闭 detour. */
    setPrefs(raw?: any): Promise<any>;
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
/**
 * Dispatcher an outbound WebSocket rides: the proxy tunnel when one applies
 * to `url`, else a direct Agent. The caller owns the returned dispatcher and
 * closes it with the socket — pooling would outlive the connection it serves.
 */
export declare function outboundWebsocketDispatcher(url: any): Promise<ProxyAgent | Agent>;
/** Proxy URL (with credentials) the Cursor h2 dialer should tunnel through, if any. */
export declare function outboundProxyFor(url: any): any;
