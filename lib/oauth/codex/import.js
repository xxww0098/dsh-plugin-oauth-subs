/**
 * Codex CLI / Hermes local-session import: a user who has already logged in
 * on this machine does not have to repeat the browser flow.
 *
 * Recognised files:
 *   ~/.codex/auth.json          Codex CLI
 *   ~/.hermes/auth.json         Hermes multi-provider store
 */
import { decodeJwtPayload } from '../../utils/jwt.js';
import { codexProfileClaims, codexSession } from './index.js';
import { homeFile, readJson, tokensFromHermes, withExpiry } from '../import-auth.js';
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
/**
 * One Codex CLI / Hermes `auth.json`. The access token's JWT `exp` is the
 * expiry: Codex CLI rotates only every ~8 days, so `last_refresh + 1h` would
 * mark a live import stale and reread it on every request.
 */
async function readCodexAuth(path) {
    const raw = await readJson(path);
    if (raw === undefined)
        return undefined;
    const fromCli = path.includes('.codex') ? tokensFromCodexCli(raw) : undefined;
    const fromHermes = tokensFromHermes(raw, ['openai-codex', 'openai_codex', 'codex', 'chatgpt']);
    const tokens = fromCli ?? fromHermes;
    if (tokens === undefined)
        return undefined;
    const exp = decodeJwtPayload(tokens.access_token)?.exp;
    const session = codexSession(typeof exp === 'number' && exp > 0
        ? { ...tokens, expires_in: undefined }
        : withExpiry(tokens, raw.last_refresh ?? raw.lastRefresh));
    // `source` marks the login as the CLI's: TokenManager rereads, never exchanges.
    return { ...session, ...codexProfileClaims(session.idToken), source: path };
}
export async function importCodexAuth() {
    const tried = [];
    const paths = [homeFile('.codex', 'auth.json'), homeFile('.hermes', 'auth.json')];
    for (const path of paths) {
        tried.push(path);
        const session = await readCodexAuth(path);
        if (session)
            return { session, source: path };
    }
    throw new Error(`no Codex session found in ${tried.join(' or ')}`);
}
/** Codex CLI / Hermes imports carry their file path; PKCE logins carry none. */
export const codexImported = {
    cli: 'codex',
    is: (session) => typeof session?.source === 'string',
    reread: (session) => readCodexAuth(session.source),
    identity: (session) => session?.accountId,
};
