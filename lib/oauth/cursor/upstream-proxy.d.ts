/**
 * Optional upstream egress for the Cursor h2 hop. Region-gated providers
 * (Anthropic / OpenAI / Gemini) are refused server-side when the request
 * leaves from an unsupported region; the official client escapes this
 * with VS Code `http.proxy`. This hop honors `PI_CURSOR_PROXY` /
 * `CURSOR_PROXY` (`http://`, `https://`, `socks5://`, optional user:pass),
 * then falls back to the plugin's outbound proxy (which honors NO_PROXY and
 * loopback). Auth poll, token refresh, and quota JSON use `outboundFetch`.
 */
/** Raw TCP tunnel to `target` through `proxy` (http/https CONNECT or socks5). */
export declare function dialCursorProxy(proxy: any, target: any, { timeoutMs }?: {
    timeoutMs?: number | undefined;
}): Promise<any>;
/**
 * Egress for one Cursor h2 dial: `cursorProxy` config → `PI_CURSOR_PROXY` /
 * `CURSOR_PROXY` → the outbound proxy for `url`. The explicit Cursor knob is
 * taken as-is; NO_PROXY / loopback only gate the outbound fallback.
 */
export declare function cursorEgressProxy(url: any): Promise<any>;
/** Drop every pooled session (plugin stop / config change); in-flight streams finish. */
export declare function clearCursorH2Pool(): void;
/**
 * `http2.connect` replacement for the Cursor hop, pooled: Run and unary RPCs
 * share one session per (origin, egress) and close only their own stream.
 * When an upstream proxy applies the tunnel is dialed first, then http2
 * attaches over it — the TLS handshake to the Cursor host still happens
 * inside `createConnection` so ALPN/session handling is unchanged. A session
 * must connect within `timeoutMs`; it leaves the pool on close / GOAWAY /
 * error / 60s without frames (graceful close, open streams run on).
 */
export declare function cursorH2Connect(url: any, { timeoutMs }?: {
    timeoutMs?: number | undefined;
}): Promise<any>;
