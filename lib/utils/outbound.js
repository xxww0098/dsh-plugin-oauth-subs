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
import { execFile as execFileCb } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Agent, Headers, ProxyAgent, WebSocket, fetch } from 'undici';
import { describeError } from './http.js';
import { writePrivateText } from './private-text.js';
export { WebSocket as OutboundWebSocket };
export const OUTBOUND_PROXY_FILE = 'outbound-proxy.json';
export const OUTBOUND_MODES = ['auto', 'off', 'custom'];
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0', '[::1]']);
export function outboundProxyPath(dataDir) {
    return join(dataDir, OUTBOUND_PROXY_FILE);
}
export function normalizeProxyUrl(raw) {
    if (typeof raw !== 'string')
        return undefined;
    const trimmed = raw.trim();
    if (!trimmed)
        return undefined;
    let parsed;
    try {
        parsed = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`);
    }
    catch {
        return undefined;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
        return undefined;
    if (!parsed.hostname)
        return undefined;
    const auth = parsed.username
        ? `${decodeURIComponent(parsed.username)}${parsed.password ? `:${decodeURIComponent(parsed.password)}` : ''}@`
        : '';
    return `${parsed.protocol}//${auth}${parsed.host}`;
}
export function envProxyUrl(env = process.env) {
    return normalizeProxyUrl(env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy);
}
export function envNoProxy(env = process.env) {
    const raw = env.NO_PROXY || env.no_proxy || '';
    return String(raw).split(/[\s,]+/).map((part) => part.trim()).filter(Boolean);
}
/**
 * Resolve the effective proxy URL. `settingsUrl`/`mode` carry the Settings
 * prefs; a legacy caller that passes no `mode` gets the pre-mode semantics
 * (a non-empty settings URL means custom, an empty one means auto).
 */
export function resolveProxyUrl(configUrl, settingsUrl, env = process.env, mode = undefined, autoUrl = '') {
    const config = normalizeProxyUrl(configUrl);
    if (config)
        return config;
    const resolvedMode = OUTBOUND_MODES.includes(mode) ? mode : (settingsUrl ? 'custom' : 'auto');
    if (resolvedMode === 'off')
        return undefined;
    if (resolvedMode === 'custom')
        return normalizeProxyUrl(settingsUrl) || undefined;
    return normalizeProxyUrl(autoUrl) || envProxyUrl(env);
}
/** Which tier won: config > settings > os (scutil) > env > off. */
export function proxySource(configUrl, settingsUrl, env = process.env, mode = undefined, autoSource = '') {
    if (normalizeProxyUrl(configUrl))
        return 'config';
    const resolvedMode = OUTBOUND_MODES.includes(mode) ? mode : (settingsUrl ? 'custom' : 'auto');
    if (resolvedMode === 'off')
        return 'off';
    if (resolvedMode === 'custom')
        return normalizeProxyUrl(settingsUrl) ? 'settings' : 'off';
    return autoSource === 'os' || autoSource === 'env' ? autoSource : (envProxyUrl(env) ? 'env' : 'off');
}
export const SCUTIL_PATH = '/usr/sbin/scutil';
/** The auto tier re-reads the system proxy at most this often. */
const AUTO_TTL_MS = 60_000;
/** Parse `scutil --proxy` output: HTTPS wins over plain HTTP, SOCKS/PAC-only
 *  settings yield no URL (ProxyAgent speaks http(s) CONNECT tunnels only),
 *  and ExceptionsList entries join the bypass rules verbatim — the suffix
 *  matcher in `shouldBypassProxy` already understands bare domains. */
export function parseScutilProxy(text) {
    const dict = String(text ?? '');
    const flag = (key) => Number(dict.match(new RegExp(`^\\s*${key}\\s*:\\s*(\\d+)\\s*$`, 'm'))?.[1] ?? 0);
    const host = (key) => dict.match(new RegExp(`^\\s*${key}\\s*:\\s*(\\S+)\\s*$`, 'm'))?.[1] ?? '';
    const bypass = [];
    const block = dict.match(/ExceptionsList\s*:\s*<array>\s*\{([\s\S]*?)\}/);
    if (block) {
        for (const line of block[1].split('\n')) {
            const entry = line.match(/^\s*\d+\s*:\s*(.+?)\s*$/);
            if (entry)
                bypass.push(entry[1]);
        }
    }
    if (flag('HTTPSEnable') === 1 && host('HTTPSProxy') && flag('HTTPSPort')) {
        return { url: `http://${host('HTTPSProxy')}:${flag('HTTPSPort')}`, bypass };
    }
    if (flag('HTTPEnable') === 1 && host('HTTPProxy') && flag('HTTPPort')) {
        return { url: `http://${host('HTTPProxy')}:${flag('HTTPPort')}`, bypass };
    }
    return { url: '', bypass };
}
const execFileAsync = promisify(execFileCb);
/** macOS system proxy, absolute path so the host's minimal PATH is irrelevant. */
async function readSystemProxyDefault() {
    if (process.platform !== 'darwin')
        return undefined;
    try {
        const { stdout } = await execFileAsync(SCUTIL_PATH, ['--proxy'], { timeout: 3000 });
        return parseScutilProxy(stdout);
    }
    catch {
        return undefined;
    }
}
export function shouldBypassProxy(target, noProxy = envNoProxy()) {
    let url;
    try {
        url = typeof target === 'string' ? new URL(target) : new URL(String(target?.url ?? target));
    }
    catch {
        return true;
    }
    const host = String(url.hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
    if (!host)
        return true;
    if (LOCAL_HOSTS.has(host) || host.endsWith('.localhost'))
        return true;
    for (const rule of noProxy) {
        const needle = String(rule).trim().toLowerCase();
        if (!needle)
            continue;
        if (needle === '*')
            return true;
        const bare = needle.startsWith('.') ? needle.slice(1) : needle;
        if (host === bare)
            return true;
        if (needle.startsWith('.') && host.endsWith(needle))
            return true;
        if (host.endsWith(`.${bare}`))
            return true;
    }
    return false;
}
export function redactProxyUrl(url) {
    const normalized = normalizeProxyUrl(url);
    if (!normalized)
        return '';
    try {
        const parsed = new URL(normalized);
        if (!parsed.username && !parsed.password)
            return normalized;
        parsed.username = '***';
        parsed.password = '';
        return `${parsed.protocol}//***@${parsed.host}`;
    }
    catch {
        return normalized;
    }
}
/** `{mode, url}`; a legacy `{url}` file means custom, a missing mode means auto. */
export function normalizeOutboundPrefs(raw) {
    const url = typeof raw?.url === 'string' ? raw.url.trim() : '';
    const mode = OUTBOUND_MODES.includes(raw?.mode) ? raw.mode : (url ? 'custom' : 'auto');
    return { mode, url };
}
export function defaultOutboundPrefs() {
    return { mode: 'auto', url: '' };
}
export async function readOutboundPrefs(path) {
    try {
        const text = await readFile(path, 'utf8');
        return normalizeOutboundPrefs(JSON.parse(text));
    }
    catch {
        return defaultOutboundPrefs();
    }
}
export async function writeOutboundPrefs(path, prefs) {
    const next = normalizeOutboundPrefs(prefs);
    await writePrivateText(path, JSON.stringify(next) + '\n');
    return next;
}
/**
 * chatgpt.com / ollama.com send no `Keep-Alive` hint, so undici's 4s default
 * would drop a pooled socket before the next turn and pay a fresh handshake
 * (~1.7s to chatgpt.com). A stale socket reset before output is retried
 * upstream as a pre-output transport failure.
 */
const KEEP_ALIVE = { keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000 };
function makeAgent(url, agentFor) {
    return typeof agentFor === 'function' ? agentFor(url) : new ProxyAgent({ uri: url, ...KEEP_ALIVE });
}
async function release(agent) {
    try {
        await agent?.close?.();
    }
    catch { /* already closed */ }
}
function requestUrl(input) {
    if (typeof input === 'string')
        return input;
    if (input && typeof input === 'object' && typeof input.url === 'string')
        return input.url;
    try {
        return String(input);
    }
    catch {
        return '';
    }
}
/** Global fetch sent `user-agent: node`; undici's own fetch would say `undici`. */
function withDefaultUserAgent(input, headers) {
    const next = new Headers(headers ?? (typeof input === 'object' ? input?.headers : undefined));
    if (!next.has('user-agent'))
        next.set('user-agent', 'node');
    return next;
}
/**
 * One configured owner: a direct Agent plus the proxy agent. `ready` always
 * settles; a build failure is kept as `error` and fails every proxied request
 * instead of silently going direct.
 */
export function createOutboundSession({ path = undefined, configUrl = undefined, env = process.env, fetchFn = fetch, agentFor = undefined, readSystemProxy = readSystemProxyDefault, } = {}) {
    let settingsMode = 'auto';
    let settingsUrl = '';
    // The auto tier's cached resolution: system proxy first, env as fallback.
    let autoUrl = '';
    let autoSource = ''; // 'os' | 'env' | ''
    let autoBypass = [];
    let autoCheckedAt = 0;
    let autoRefreshing;
    const direct = new Agent(KEEP_ALIVE);
    let agent = undefined;
    let error = '';
    // Last proxied transport failure: an agent that builds fine can still point
    // at a dead proxy, and the settings page must show that too.
    let failure = '';
    const configSet = () => Boolean(normalizeProxyUrl(configUrl));
    function resolvedUrl() {
        return resolveProxyUrl(configUrl, settingsUrl, env, settingsMode, autoUrl);
    }
    function sourceOf() {
        return proxySource(configUrl, settingsUrl, env, settingsMode, autoSource);
    }
    function bypassList() {
        // System exceptions only bind the tier that produced them.
        return autoSource === 'os' ? [...envNoProxy(env), ...autoBypass] : envNoProxy(env);
    }
    /** Reconcile the agent with the resolved URL; swap+release is atomic. */
    function syncAgent() {
        const url = resolvedUrl();
        const next = url ? makeAgent(url, agentFor) : undefined;
        const prev = agent;
        agent = next;
        void release(prev);
    }
    async function refreshAuto({ force = false } = {}) {
        if (configSet())
            return; // a pinned config proxy makes the auto tier moot
        if (!force && Date.now() - autoCheckedAt < AUTO_TTL_MS)
            return;
        if (autoRefreshing)
            return autoRefreshing;
        autoCheckedAt = Date.now();
        autoRefreshing = (async () => {
            let nextUrl = '';
            let nextSource = '';
            let nextBypass = [];
            const system = await readSystemProxy();
            if (system?.url) {
                nextUrl = system.url;
                nextSource = 'os';
                nextBypass = Array.isArray(system.bypass) ? system.bypass.filter(Boolean) : [];
            }
            else {
                nextUrl = envProxyUrl(env) ?? '';
                if (nextUrl)
                    nextSource = 'env';
            }
            const before = resolvedUrl();
            autoUrl = normalizeProxyUrl(nextUrl) ?? '';
            autoSource = autoUrl ? nextSource : '';
            autoBypass = nextBypass;
            if (before !== resolvedUrl())
                syncAgent();
        })();
        try {
            await autoRefreshing;
        }
        finally {
            autoRefreshing = undefined;
        }
    }
    async function load() {
        try {
            if (path) {
                const prefs = await readOutboundPrefs(path);
                settingsMode = prefs.mode;
                settingsUrl = prefs.url;
            }
            await refreshAuto({ force: true });
            const url = resolvedUrl();
            agent = url ? makeAgent(url, agentFor) : undefined;
        }
        catch (caught) {
            error = describeError(caught);
        }
    }
    const ready = load();
    /** Proxy URL for `target`, or undefined when it goes direct (unset, NO_PROXY, loopback). */
    function proxyFor(target) {
        const url = resolvedUrl();
        if (!url || !target || shouldBypassProxy(target, bypassList()))
            return undefined;
        return url;
    }
    async function request(input, init = {}) {
        // A configured proxy must never be skipped because its prefs file is still loading.
        await ready;
        // Auto-tier staleness: refresh in the background; requests keep riding the
        // cached agent, the swap lands when the fresh resolution differs.
        if (settingsMode === 'auto' && !configSet() && Date.now() - autoCheckedAt >= AUTO_TTL_MS)
            void refreshAuto();
        const options = { ...init, headers: withDefaultUserAgent(input, init?.headers) };
        if (!proxyFor(requestUrl(input)))
            return fetchFn(input, { ...options, dispatcher: direct });
        if (!agent)
            throw new Error(`outbound proxy unavailable: ${error || 'closed'}`);
        const via = redactProxyUrl(resolvedUrl());
        try {
            const response = await fetchFn(input, { ...options, dispatcher: agent });
            failure = '';
            return response;
        }
        catch (caught) {
            if (init?.signal?.aborted)
                throw caught;
            failure = `${describeError(caught)} via ${via}`;
            // The cause stays on the chain: upstream.ts retries a stale keep-alive
            // connection at once instead of on the backoff schedule.
            throw new Error(`outbound proxy unavailable: ${failure}`, { cause: caught });
        }
    }
    return {
        ready,
        request,
        async proxyFor(target) {
            await ready;
            return proxyFor(target);
        },
        snapshot() {
            const url = resolvedUrl();
            return {
                mode: settingsMode,
                url: redactProxyUrl(url),
                source: sourceOf(),
                configured: Boolean(url),
                ...(error || failure ? { error: error || failure } : {}),
            };
        },
        /** Settings view: carries the raw custom URL for the input prefill — it
         *  must never flow into the status snapshot (that one is cached in
         *  localStorage); `resolved` stays redacted for display. */
        async prefs() {
            await ready;
            if (settingsMode === 'auto' && !configSet())
                await refreshAuto();
            return {
                mode: settingsMode,
                url: settingsUrl,
                source: sourceOf(),
                resolved: redactProxyUrl(resolvedUrl()),
                configured: Boolean(resolvedUrl()),
                ...(error || failure ? { error: error || failure } : {}),
            };
        },
        /** Tri-state write; a legacy `{url}` payload means custom (a URL was
         *  given) or auto (clearing). Non-custom modes keep the stored URL so the
         *  draft survives an 自动/关闭 detour. */
        async setPrefs(raw = {}) {
            const mode = OUTBOUND_MODES.includes(raw?.mode) ? raw.mode : (raw?.url ? 'custom' : 'auto');
            const text = typeof raw?.url === 'string' ? raw.url.trim() : '';
            let url = text;
            if (mode === 'custom') {
                const normalized = text ? normalizeProxyUrl(text) : undefined;
                if (!normalized)
                    throw new Error('Invalid proxy URL; use http(s)://host:port');
                url = normalized;
            }
            if (mode === 'auto' && !configSet())
                await refreshAuto({ force: true });
            // Build → persist → swap: a failure at either step leaves file and state as they were.
            const nextResolved = resolveProxyUrl(configUrl, url, env, mode, autoUrl);
            const next = nextResolved ? makeAgent(nextResolved, agentFor) : undefined;
            try {
                if (path)
                    await writeOutboundPrefs(path, { mode, url });
            }
            catch (caught) {
                void release(next);
                throw caught;
            }
            const prev = agent;
            settingsMode = mode;
            settingsUrl = url;
            agent = next;
            error = '';
            failure = '';
            void release(prev);
            return this.prefs();
        },
        /** Frees both agents; later proxied requests fail instead of going direct. */
        async close() {
            const prev = agent;
            agent = undefined;
            if (resolvedUrl())
                error = 'closed';
            await Promise.all([release(prev), release(direct)]);
        },
    };
}
// Until the plugin configures the owner (unit tests, live scripts) every hop
// goes direct through undici — never through the global fetch, and never
// through the machine's system proxy. Built lazily, so a configured plugin
// never holds a second, unclosed Agent.
let current;
let unconfigured;
function owner() {
    current ??= unconfigured = createOutboundSession({ env: {}, readSystemProxy: () => undefined });
    return current;
}
/**
 * Point the module-level owner at this plugin instance. The caller's
 * `ctx.effect` cleanup calls `close()` on the returned session; a newer
 * instance simply replaces it, so hot reload order does not matter.
 */
export function configureOutbound(options = {}) {
    if (current && current === unconfigured)
        void current.close();
    unconfigured = undefined;
    current = createOutboundSession(options);
    return current;
}
/** The one outbound fetch: direct Agent, or ProxyAgent when a proxy applies. */
export function outboundFetch(input, init = undefined) {
    return owner().request(input, init);
}
/**
 * Dispatcher an outbound WebSocket rides: the proxy tunnel when one applies
 * to `url`, else a direct Agent. The caller owns the returned dispatcher and
 * closes it with the socket — pooling would outlive the connection it serves.
 */
export async function outboundWebsocketDispatcher(url) {
    await owner().ready;
    const proxyUrl = await owner().proxyFor(url);
    return proxyUrl ? new ProxyAgent({ uri: proxyUrl, ...KEEP_ALIVE }) : new Agent(KEEP_ALIVE);
}
/** Proxy URL (with credentials) the Cursor h2 dialer should tunnel through, if any. */
export function outboundProxyFor(url) {
    return owner().proxyFor(url);
}
