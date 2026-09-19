/**
 * Import the installed Cline CLI login.
 *
 *   ~/.cline/data/settings/providers.json   (CLINE_HOME overrides ~/.cline)
 *
 * `ProviderSettingsManager` writes one entry per provider id; the OAuth
 * session lives at `providers.<id>.settings.auth` with the `workos:`-prefixed
 * access token, the refresh token, `expiresAt`, the `usr-…` account id and
 * `metadata.userInfo`. `cline-pass` stores under the same shape and is read as
 * a fallback. Read-only: never write back to ~/.cline, never overwrite a
 * stored session (auto-import only runs while the roster is empty).
 */
import { readFile } from 'node:fs/promises';
import { clineDefaultAccount, clineHomePaths } from './index.js';
export const CLINE_IMPORT_EMPTY = 'cline-import-empty';
const CLINE_STORAGE_IDS = ['cline', 'cline-pass'];
function trimmed(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
export function clineSessionFromCliSettings(settings) {
    if (!settings || typeof settings !== 'object')
        return undefined;
    const auth = settings.auth;
    if (!auth || typeof auth !== 'object')
        return undefined;
    const accessToken = trimmed(auth.accessToken);
    const refreshToken = trimmed(auth.refreshToken);
    if (!accessToken || !refreshToken)
        return undefined;
    const expiresAt = typeof auth.expiresAt === 'number' && Number.isFinite(auth.expiresAt)
        ? auth.expiresAt
        : undefined;
    if (expiresAt === undefined)
        return undefined;
    const userInfo = auth.metadata && typeof auth.metadata === 'object' ? auth.metadata.userInfo : undefined;
    // Never fall back to a refresh-token fragment as the account id.
    const account = trimmed(userInfo?.email) ?? trimmed(auth.accountId) ?? clineDefaultAccount(accessToken);
    const userId = trimmed(userInfo?.clineUserId) ?? trimmed(auth.accountId);
    return {
        accessToken,
        refreshToken,
        expiresAt,
        ...(account ? { account } : {}),
        ...(userId ? { userId } : {}),
        tokenType: trimmed(auth.metadata?.tokenType) ?? 'Bearer',
        source: 'cli',
    };
}
/** First `cline` / `cline-pass` entry carrying a usable OAuth session. */
export function clineSessionFromProvidersFile(data) {
    if (!data || typeof data !== 'object')
        return undefined;
    const providers = data.providers;
    if (!providers || typeof providers !== 'object')
        return undefined;
    for (const id of CLINE_STORAGE_IDS) {
        const session = clineSessionFromCliSettings(providers[id]?.settings);
        if (session)
            return session;
    }
    return undefined;
}
export async function resolveClineCliCredentials(options = {}) {
    for (const path of clineHomePaths(options)) {
        try {
            const session = clineSessionFromProvidersFile(JSON.parse(await readFile(path, 'utf8')));
            if (session)
                return session;
        }
        catch {
            // missing or unreadable file — try the next candidate
        }
    }
    return undefined;
}
export async function importClineAuth(options = {}) {
    const cli = await resolveClineCliCredentials(options);
    if (cli)
        return { source: 'cli', session: cli };
    const error = new Error(CLINE_IMPORT_EMPTY);
    error.code = CLINE_IMPORT_EMPTY;
    throw error;
}
