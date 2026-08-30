/**
 * Import existing Codex CLI / Grok CLI / Hermes OAuth sessions so a user who
 * has already logged in on this machine does not have to repeat the browser
 * flow.
 *
 * Recognised files:
 *   ~/.codex/auth.json          Codex CLI
 *   ~/.grok/auth.json           Grok CLI ($GROK_HOME/auth.json)
 *   ~/.hermes/auth.json         Hermes multi-provider store
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { codexProfileClaims, codexSession } from './codex/index.js';
import { GROK_CLIENT_ID, grokSession } from './grok/index.js';
import { glmSession } from './glm/index.js';
import { decodeJwtPayload } from '../utils/jwt.js';
const GROK_TOKEN_ENDPOINT = 'https://auth.x.ai/oauth2/token';
export const GROK_HERMES_KEYS = Object.freeze([
    'xai-oauth',
    'grok-oauth',
    'x-ai-oauth',
    'xai-grok-oauth',
    'xai',
    'x-ai',
    'grok',
    'xai-grok',
]);
function homeFile(...parts) {
    return join(homedir(), ...parts);
}
function grokHomeDir() {
    const override = process.env.GROK_HOME?.trim();
    return override || homeFile('.grok');
}
export function grokAuthSearchPaths() {
    return [join(grokHomeDir(), 'auth.json'), homeFile('.hermes', 'auth.json')];
}
async function readJson(path) {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return undefined;
        throw error;
    }
}
function asPositiveNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0)
        return value;
    if (typeof value === 'string' && value.trim()) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0)
            return n;
    }
    return undefined;
}
function parseTime(value) {
    if (value == null)
        return undefined;
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? ms : undefined;
    }
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value > 1e12 ? value : value * 1000;
    }
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    if (!trimmed)
        return undefined;
    if (/^\d+(\.\d+)?$/.test(trimmed))
        return parseTime(Number(trimmed));
    const iso = trimmed.replace(/(\.\d{3})\d+/, '$1').replace(' ', 'T');
    const stamp = Date.parse(iso);
    return Number.isFinite(stamp) ? stamp : undefined;
}
function pickString(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim())
            return value;
    }
    return undefined;
}
function tokensFromCodexCli(raw) {
    if (typeof raw !== 'object' || raw === null)
        return undefined;
    const tokens = raw.tokens ?? raw;
    if (typeof tokens.access_token !== 'string')
        return undefined;
    return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? raw.refresh_token,
        id_token: tokens.id_token ?? raw.id_token,
        expires_in: tokens.expires_in ?? raw.expires_in,
    };
}
function hermesEntryTokens(entry) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
        return undefined;
    const nested = entry.tokens ?? entry;
    const access = pickString(nested.access_token, nested.accessToken, entry.access_token, entry.accessToken);
    const refresh = pickString(nested.refresh_token, nested.refreshToken, entry.refresh_token, entry.refreshToken);
    if (typeof access !== 'string')
        return undefined;
    const payload = decodeJwtPayload(access);
    return {
        access_token: access,
        refresh_token: refresh,
        id_token: pickString(nested.id_token, nested.idToken, entry.id_token, entry.idToken),
        expires_in: nested.expires_in ?? nested.expiresIn ?? entry.expires_in ?? entry.expiresIn,
        expires_at: nested.expires_at ?? nested.expiresAt ?? entry.expires_at ?? entry.expiresAt,
        last_refresh: pickString(entry.last_refresh, entry.lastRefresh, nested.last_refresh, nested.lastRefresh),
        token_endpoint: pickString(entry.token_endpoint, entry.tokenEndpoint, nested.token_endpoint, entry.discovery?.token_endpoint, entry.discovery?.tokenEndpoint),
        account: pickString(entry.email, entry.account, nested.email, payload?.email, payload?.preferred_username),
    };
}
export function tokensFromHermes(raw, keys) {
    if (typeof raw !== 'object' || raw === null)
        return undefined;
    const providers = raw.providers ?? raw.auth ?? raw;
    for (const key of keys) {
        const tokens = hermesEntryTokens(providers[key] ?? raw[key]);
        if (tokens !== undefined)
            return tokens;
    }
    const pool = raw.credential_pool ?? raw.credentialPool;
    if (typeof pool === 'object' && pool !== null) {
        for (const key of keys) {
            const rows = pool[key];
            if (!Array.isArray(rows))
                continue;
            for (const row of rows) {
                const tokens = hermesEntryTokens(row);
                if (tokens !== undefined)
                    return tokens;
            }
        }
    }
    return undefined;
}
function isApiKeyMode(entry, mapKey = '') {
    const mode = String(entry?.auth_mode ?? entry?.authMode ?? '').toLowerCase();
    if (mode === 'api_key' || mode === 'apikey')
        return true;
    return /api[_-]?key/i.test(String(mapKey));
}
function isGrokCliMapKey(key) {
    if (typeof key !== 'string' || !key)
        return false;
    const lower = key.toLowerCase();
    if (/api[_-]?key/i.test(lower))
        return false;
    return lower.includes('auth.x.ai')
        || lower.includes('accounts.x.ai')
        || lower.includes('xai::')
        || lower.includes(GROK_CLIENT_ID);
}
function grokCliEntryTokens(entry, mapKey = '') {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
        return undefined;
    if (isApiKeyMode(entry, mapKey))
        return undefined;
    const access = pickString(entry.key, entry.access_token, entry.accessToken);
    const refresh = pickString(entry.refresh_token, entry.refreshToken);
    if (typeof access !== 'string' || typeof refresh !== 'string')
        return undefined;
    const payload = decodeJwtPayload(access);
    const expiresAtMs = parseTime(entry.expires_at ?? entry.expiresAt ?? entry.expired);
    let expires_in = asPositiveNumber(entry.expires_in ?? entry.expiresIn);
    if (expires_in === undefined && expiresAtMs !== undefined) {
        expires_in = Math.max(Math.round((expiresAtMs - Date.now()) / 1000), 60);
    }
    const issuer = pickString(entry.oidc_issuer, entry.oidcIssuer, entry.issuer);
    const clientId = pickString(entry.oidc_client_id, entry.oidcClientId, entry.client_id, entry.clientId);
    const tokenEndpoint = pickString(entry.token_endpoint, entry.tokenEndpoint)
        ?? (typeof issuer === 'string' && issuer.includes('auth.x.ai') ? GROK_TOKEN_ENDPOINT : undefined);
    const account = pickString(entry.email, entry.account, payload?.email, payload?.preferred_username);
    const mode = String(entry.auth_mode ?? entry.authMode ?? '').toLowerCase();
    let score = 0;
    if (`${mapKey} ${clientId ?? ''}`.includes(GROK_CLIENT_ID))
        score += 100;
    if (isGrokCliMapKey(mapKey) || (typeof issuer === 'string' && issuer.includes('auth.x.ai')))
        score += 20;
    if (mode === 'oidc' || mode === 'oauth' || mode === 'supergrok')
        score += 10;
    return {
        access_token: access,
        refresh_token: refresh,
        id_token: pickString(entry.id_token, entry.idToken),
        expires_in,
        token_endpoint: tokenEndpoint,
        account,
        client_id: clientId,
        score,
    };
}
function collectGrokCliEntries(raw) {
    const direct = grokCliEntryTokens(raw, '');
    if (direct)
        return [direct];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
        return [];
    const out = [];
    for (const [key, value] of Object.entries(raw)) {
        const entry = grokCliEntryTokens(value, key);
        if (entry) {
            out.push(entry);
            continue;
        }
        if (!isGrokCliMapKey(key) || typeof value !== 'object' || value === null || Array.isArray(value))
            continue;
        for (const [innerKey, inner] of Object.entries(value)) {
            const nested = grokCliEntryTokens(inner, innerKey);
            if (nested)
                out.push(nested);
        }
    }
    return out;
}
export function tokensFromGrokCli(raw) {
    if (typeof raw !== 'object' || raw === null)
        return undefined;
    const found = collectGrokCliEntries(raw);
    if (found.length === 0)
        return undefined;
    found.sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        return (b.expires_in ?? 0) - (a.expires_in ?? 0);
    });
    const { score: _score, ...tokens } = found[0];
    return tokens;
}
function withExpiry(tokens, lastRefresh) {
    const existing = asPositiveNumber(tokens.expires_in);
    if (existing !== undefined)
        return { ...tokens, expires_in: existing };
    const fromAt = parseTime(tokens.expires_at);
    if (fromAt !== undefined) {
        return { ...tokens, expires_in: Math.max(Math.round((fromAt - Date.now()) / 1000), 60) };
    }
    const stamp = parseTime(lastRefresh ?? tokens.last_refresh);
    if (stamp !== undefined) {
        const remaining = Math.round((stamp + 3_600_000 - Date.now()) / 1000);
        return { ...tokens, expires_in: Math.max(remaining, 60) };
    }
    return { ...tokens, expires_in: 3600 };
}
function grokSessionFromTokens(tokens, lastRefresh) {
    const normalized = withExpiry(tokens, lastRefresh);
    return grokSession(normalized, normalized.token_endpoint ?? GROK_TOKEN_ENDPOINT, normalized.account ? { account: normalized.account } : undefined);
}
export async function importCodexAuth() {
    const tried = [];
    const paths = [homeFile('.codex', 'auth.json'), homeFile('.hermes', 'auth.json')];
    for (const path of paths) {
        tried.push(path);
        const raw = await readJson(path);
        if (raw === undefined)
            continue;
        const fromCli = path.includes('.codex') ? tokensFromCodexCli(raw) : undefined;
        const fromHermes = tokensFromHermes(raw, ['openai-codex', 'openai_codex', 'codex', 'chatgpt']);
        const tokens = fromCli ?? fromHermes;
        if (tokens === undefined)
            continue;
        const session = codexSession(withExpiry(tokens, raw.last_refresh ?? raw.lastRefresh));
        return {
            session: {
                ...session,
                ...codexProfileClaims(session.idToken),
            },
            source: path,
        };
    }
    throw new Error(`no Codex session found in ${tried.join(' or ')}`);
}
export async function importGrokAuth(paths = grokAuthSearchPaths()) {
    const tried = [];
    for (const path of paths) {
        tried.push(path);
        const raw = await readJson(path);
        if (raw === undefined)
            continue;
        const tokens = tokensFromGrokCli(raw) ?? tokensFromHermes(raw, GROK_HERMES_KEYS);
        if (tokens === undefined)
            continue;
        return {
            session: grokSessionFromTokens(tokens, raw.last_refresh ?? raw.lastRefresh),
            source: path,
        };
    }
    throw new Error(`no Grok session found in ${tried.join(' or ')}`);
}
function glmKeyFromZcodeConfig(raw) {
    const providers = raw?.provider ?? raw?.providers ?? raw;
    if (!providers || typeof providers !== 'object')
        return undefined;
    for (const [key, value] of Object.entries(providers)) {
        if (!/zai|glm|coding.?plan|bigmodel/i.test(key))
            continue;
        const options = value?.options ?? value;
        const apiKey = options?.apiKey ?? options?.api_key ?? value?.apiKey;
        if (typeof apiKey === 'string' && apiKey.includes('.'))
            return apiKey;
    }
    return undefined;
}
export function glmAuthSearchPaths() {
    return [
        homeFile('.zcode', 'cli', 'config.json'),
        homeFile('.zcode', 'config.json'),
    ];
}
export async function importGlmAuth(paths = glmAuthSearchPaths()) {
    const tried = [];
    for (const path of paths) {
        tried.push(path);
        const raw = await readJson(path);
        if (raw === undefined)
            continue;
        const apiKey = glmKeyFromZcodeConfig(raw);
        if (!apiKey)
            continue;
        return {
            session: glmSession({ accessToken: apiKey, account: 'zcode', region: 'zai' }),
            source: path,
        };
    }
    throw new Error(`no GLM / ZCode session found in ${tried.join(' or ')}`);
}
