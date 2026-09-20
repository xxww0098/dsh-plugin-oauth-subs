/**
 * Optional upstream egress for the Cursor h2 hop. Region-gated providers
 * (Anthropic / OpenAI / Gemini) are refused server-side when the request
 * leaves from an unsupported region; the official client escapes this
 * with VS Code `http.proxy`. This hop honors `PI_CURSOR_PROXY` /
 * `CURSOR_PROXY` (`http://`, `https://`, `socks5://`, optional user:pass).
 * Only the h2 RPC path (agentn Run / GetUsableModels, api2 unary) is
 * tunneled — auth poll, token refresh, and quota JSON stay direct.
 */
import http2 from 'node:http2';
/** Raw TCP tunnel to `target` through `proxy` (http/https CONNECT or socks5). */
export declare function dialCursorProxy(proxy: any, target: any, { timeoutMs }?: {
    timeoutMs?: number | undefined;
}): Promise<any>;
/**
 * `http2.connect` replacement for the Cursor hop. When an upstream proxy is
 * configured the tunnel is dialed first, then http2 attaches over it — the
 * TLS handshake to the Cursor host still happens inside `createConnection`
 * so ALPN/session handling is unchanged. Without a proxy this is a plain
 * `http2.connect`.
 */
export declare function cursorH2Connect(url: any): Promise<http2.ClientHttp2Session>;
