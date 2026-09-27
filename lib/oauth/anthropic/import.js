/**
 * Import an existing Claude Code login so a user who already ran
 * `claude login` on this machine does not have to repeat the browser flow.
 *
 * Recognised file:
 *   ~/.claude/.credentials.json  Claude Code CLI
 *     { "claudeAiOauth": { "accessToken", "refreshToken", "expiresAt", "scopes" } }
 *
 * The macOS Keychain copy ("Claude Code-credentials") is not read here: it
 * needs an interactive `security` prompt and the file store is present on
 * every non-Keychain setup. The token carries no identity, so the importing
 * login hydrates its account uuid / email through the profile endpoint in the
 * controller (the same finisher the browser login uses).
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { anthropicSession } from './index.js';
export const ANTHROPIC_IMPORT_EMPTY = 'anthropic-import-empty';
function credentialsPaths() {
    const home = homedir();
    return [join(home, '.claude', '.credentials.json')];
}
async function readJson(path) {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    }
    catch {
        return undefined;
    }
}
function tokensFromClaudeCode(raw) {
    const oauth = raw?.claudeAiOauth;
    if (!oauth || typeof oauth !== 'object')
        return undefined;
    const accessToken = typeof oauth.accessToken === 'string' ? oauth.accessToken : undefined;
    const refreshToken = typeof oauth.refreshToken === 'string' ? oauth.refreshToken : undefined;
    if (!accessToken || !refreshToken)
        return undefined;
    const expiresAt = typeof oauth.expiresAt === 'number' && Number.isFinite(oauth.expiresAt)
        ? oauth.expiresAt
        : undefined;
    if (!expiresAt)
        return undefined;
    return { accessToken, refreshToken, expiresAt, scopes: oauth.scopes };
}
export async function importAnthropicAuth(paths = undefined) {
    const tried = [];
    const candidates = paths ?? credentialsPaths();
    for (const path of candidates) {
        tried.push(path);
        const raw = await readJson(path);
        if (raw === undefined)
            continue;
        const tokens = tokensFromClaudeCode(raw);
        if (tokens === undefined)
            continue;
        const session = anthropicSession({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            expires_in: Math.max(1, Math.round((tokens.expiresAt - Date.now()) / 1000)),
            scope: Array.isArray(tokens.scopes) ? tokens.scopes.join(' ') : tokens.scopes,
        });
        return { session, source: path };
    }
    const error = new Error(`no Anthropic session found in ${tried.join(' or ')}`);
    error.code = ANTHROPIC_IMPORT_EMPTY;
    error.message = ANTHROPIC_IMPORT_EMPTY;
    throw error;
}
