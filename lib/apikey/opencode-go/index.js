/**
 * OpenCode Go API-key family (quota only).
 *
 * Chat is DSH's builtin opencode-go + OPENCODE_API_KEY (Responses, no
 * loopback hop). This module stores a web session cookie + workspace id
 * so Settings can show remaining quota.
 */
export const OPENCODE_GO_ID = 'opencode-go';
export const OPENCODE_GO_ORIGIN = 'https://opencode.ai';
export const OPENCODE_GO_RESPONSES_URL = 'https://opencode.ai/zen/go/v1';
export const OPENCODE_GO_COOKIE_MASK = '••••••••';
const AUTH_COOKIE_NAMES = new Set(['auth', '__host-auth']);
const WORKSPACE_RE = /wrk_[A-Za-z0-9]+/;
export function parseOpencodeGoCookie(raw) {
    const text = String(raw ?? '').trim();
    if (!text)
        return undefined;
    const parts = text.split(';').map((part) => part.trim()).filter(Boolean);
    const picked = [];
    for (const part of parts) {
        const eq = part.indexOf('=');
        if (eq <= 0)
            continue;
        const name = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        if (!value)
            continue;
        if (AUTH_COOKIE_NAMES.has(name.toLowerCase()))
            picked.push(`${name}=${value}`);
    }
    if (picked.length > 0)
        return picked.join('; ');
    if (text.includes('=') || /\s/.test(text))
        return undefined;
    return `auth=${text}`;
}
export function normalizeOpencodeGoWorkspaceId(raw) {
    const text = String(raw ?? '').trim();
    if (!text)
        return undefined;
    if (/^wrk_[A-Za-z0-9]+$/.test(text))
        return text;
    try {
        const url = new URL(text);
        const parts = url.pathname.split('/').filter(Boolean);
        const index = parts.indexOf('workspace');
        if (index >= 0) {
            const candidate = parts[index + 1];
            if (typeof candidate === 'string' && /^wrk_[A-Za-z0-9]+$/.test(candidate))
                return candidate;
        }
    }
    catch {
        // not a URL
    }
    const match = text.match(WORKSPACE_RE);
    return match ? match[0] : undefined;
}
export function publicOpencodeGo(entry, quota) {
    const cookieSet = Boolean(entry?.cookieHeader);
    const workspaceId = typeof entry?.workspaceId === 'string' && entry.workspaceId.trim()
        ? entry.workspaceId.trim()
        : '';
    return {
        id: OPENCODE_GO_ID,
        cookieSet,
        workspaceId,
        configured: cookieSet,
        quota: quota ?? { status: cookieSet ? 'idle' : 'idle' },
    };
}
export function isOpencodeGoCookieMask(value) {
    return String(value ?? '').trim() === OPENCODE_GO_COOKIE_MASK;
}
