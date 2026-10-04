/**
 * Grok CLI / Hermes local-session import: a user who has already logged in
 * on this machine does not have to repeat the browser flow.
 *
 * Recognised files:
 *   ~/.grok/auth.json           Grok CLI ($GROK_HOME/auth.json)
 *   ~/.hermes/auth.json         Hermes multi-provider store
 */
import { join } from 'node:path';
import { decodeJwtPayload } from '../../utils/jwt.js';
import { GROK_CLIENT_ID, grokSession } from './index.js';
import { asPositiveNumber, homeFile, parseTime, pickString, readJson, tokensFromHermes, withExpiry, } from '../import-auth.js';
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
function grokHomeDir() {
    const override = process.env.GROK_HOME?.trim();
    return override || homeFile('.grok');
}
export function grokAuthSearchPaths() {
    return [join(grokHomeDir(), 'auth.json'), homeFile('.hermes', 'auth.json')];
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
function grokSessionFromTokens(tokens, lastRefresh) {
    const normalized = withExpiry(tokens, lastRefresh);
    return grokSession(normalized, normalized.token_endpoint ?? GROK_TOKEN_ENDPOINT, normalized.account ? { account: normalized.account } : undefined);
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
