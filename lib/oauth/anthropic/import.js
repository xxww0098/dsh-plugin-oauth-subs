/**
 * Import an existing Claude Code login so a user who already ran
 * `claude login` on this machine does not have to repeat the browser flow.
 *
 * Stores, in the order the pinned client (`claude-cli/2.1.283`) reads them —
 * the macOS Keychain first, the plaintext file as its fallback:
 *
 *   macOS Keychain   service "Claude Code-credentials", account $USER
 *     `security find-generic-password -a <user> -w -s <service>`
 *     (service gains "-<sha256(configDir)[:8]>" when CLAUDE_CONFIG_DIR /
 *      CLAUDE_SECURESTORAGE_CONFIG_DIR is set, and reads
 *      "Claude Code-custom-oauth-credentials" when CLAUDE_CODE_OAUTH_CLIENT_ID is)
 *   <CLAUDE_CONFIG_DIR or ~/.claude>/.credentials.json   plaintext store
 *     { "claudeAiOauth": { "accessToken", "refreshToken", "expiresAt", "scopes" } }
 *
 * Both stores hold the same document, and 2.1.283 writes the Keychain first and
 * deletes the plaintext file once that write succeeds (the composed
 * `keychain-with-plaintext-fallback` store's `update()`). On macOS the file is
 * therefore normally absent: a file-only reader can never see a macOS login.
 *
 * The token carries no identity, so the importing login hydrates its account
 * uuid / email through the profile endpoint in the controller (the same
 * finisher the browser login uses).
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { anthropicSession } from './index.js';
const execFileAsync = promisify(execFile);
export const ANTHROPIC_IMPORT_EMPTY = 'anthropic-import-empty';
/** Keychain item is there, but this process was not allowed to read it. */
export const ANTHROPIC_IMPORT_LOCKED = 'anthropic-import-locked';
/**
 * Read budget for the Keychain probe. An absent item returns at once; a present
 * one can wait on the system "…wants to use your confidential information"
 * dialog, which the user answers by hand — so this is seconds, not the pinned
 * client's 2s cached read.
 */
export const ANTHROPIC_KEYCHAIN_TIMEOUT_MS = 30_000;
const KEYCHAIN_SERVICE = 'Claude Code';
const KEYCHAIN_SERVICE_SUFFIX = '-credentials';
const KEYCHAIN_CUSTOM_CLIENT_SUFFIX = '-custom-oauth';
const KEYCHAIN_ACCOUNT_FALLBACK = 'claude-code-user';
const KEYCHAIN_ACCOUNT_PATTERN = /^[a-zA-Z0-9._-]+$/;
/** `CLAUDE_CONFIG_DIR` when set, else `~/.claude` — the client's config root. */
export function anthropicConfigDir({ env = process.env, home = homedir() } = {}) {
    const custom = typeof env.CLAUDE_CONFIG_DIR === 'string' ? env.CLAUDE_CONFIG_DIR.trim() : '';
    return custom || join(home, '.claude');
}
/** `RD()` of the pinned client: `Claude Code${OAUTH_FILE_SUFFIX}${n}${configHash}`. */
export function anthropicKeychainService({ env = process.env } = {}) {
    const secure = typeof env.CLAUDE_SECURESTORAGE_CONFIG_DIR === 'string'
        ? env.CLAUDE_SECURESTORAGE_CONFIG_DIR
        : undefined;
    const configDir = secure !== undefined
        ? secure
        : (typeof env.CLAUDE_CONFIG_DIR === 'string' ? env.CLAUDE_CONFIG_DIR : '');
    const hash = configDir
        ? `-${createHash('sha256').update(configDir.normalize('NFC')).digest('hex').slice(0, 8)}`
        : '';
    const client = typeof env.CLAUDE_CODE_OAUTH_CLIENT_ID === 'string' && env.CLAUDE_CODE_OAUTH_CLIENT_ID
        ? KEYCHAIN_CUSTOM_CLIENT_SUFFIX
        : '';
    return `${KEYCHAIN_SERVICE}${client}${KEYCHAIN_SERVICE_SUFFIX}${hash}`;
}
/** `tA()` of the pinned client: `$USER` while it is a safe keychain account name. */
export function anthropicKeychainAccount({ env = process.env } = {}) {
    let name = '';
    try {
        name = (typeof env.USER === 'string' && env.USER) || userInfo().username || '';
    }
    catch {
        name = '';
    }
    return KEYCHAIN_ACCOUNT_PATTERN.test(name) ? name : KEYCHAIN_ACCOUNT_FALLBACK;
}
function credentialsPaths({ env, home }) {
    return [join(anthropicConfigDir({ env, home }), '.credentials.json')];
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
function sessionFromTokens(tokens) {
    return anthropicSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: Math.max(1, Math.round((tokens.expiresAt - Date.now()) / 1000)),
        scope: Array.isArray(tokens.scopes) ? tokens.scopes.join(' ') : tokens.scopes,
    });
}
function keychainMissing(error) {
    const message = `${error?.stderr ?? ''} ${error?.message ?? error ?? ''}`;
    return /could not be found/i.test(message) || error?.code === 44 || error?.status === 44;
}
/**
 * macOS only. Read-only: `find-generic-password -w`. Never
 * `add-generic-password`, never a write to `.credentials.json` — that
 * document is Claude Code's own login, and a partial rewrite or a refresh
 * that rotates the shared refresh token destroys it.
 *
 * Absent item or a non-JSON payload → `undefined`. Refused / timed-out
 * read throws `anthropic-import-locked` so the UI can ask for the system
 * prompt instead of claiming there is no login.
 */
export async function readAnthropicKeychainTokens({ platform = process.platform, env = process.env, execFileFn = execFileAsync, timeoutMs = ANTHROPIC_KEYCHAIN_TIMEOUT_MS, service, } = {}) {
    if (platform !== 'darwin')
        return undefined;
    const name = typeof service === 'string' && service ? service : anthropicKeychainService({ env });
    try {
        const { stdout } = await execFileFn('security', ['find-generic-password', '-a', anthropicKeychainAccount({ env }), '-w', '-s', name], { encoding: 'utf8', timeout: timeoutMs });
        const raw = String(stdout ?? '').trim();
        if (!raw)
            return undefined;
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            // A malformed item is not a login and not a permission denial —
            // reporting it as locked would prompt for a system grant that fixes
            // nothing.
            return undefined;
        }
        return parsed && typeof parsed === 'object' ? parsed : undefined;
    }
    catch (error) {
        if (keychainMissing(error))
            return undefined;
        const denied = new Error(ANTHROPIC_IMPORT_LOCKED);
        denied.code = ANTHROPIC_IMPORT_LOCKED;
        denied.cause = error;
        throw denied;
    }
}
/** A session imported from Claude Code's own store — not a plugin-owned browser login. */
export function isAnthropicImportedSource(source) {
    return typeof source === 'string' && (source.startsWith('keychain:') || source.endsWith('/.credentials.json') || source.endsWith('\\.credentials.json'));
}
/**
 * `paths` pins the plaintext candidates and skips the OS store — tests and
 * callers that already know the file. Called bare it mirrors the pinned client:
 * macOS Keychain first, plaintext file as the fallback.
 */
export async function importAnthropicAuth(paths = undefined, deps = {}) {
    const tried = [];
    let keychainDenied = false;
    if (paths === undefined && (deps.platform ?? process.platform) === 'darwin') {
        const service = anthropicKeychainService(deps);
        tried.push(`keychain:${service}`);
        try {
            const tokens = tokensFromClaudeCode(await readAnthropicKeychainTokens({ ...deps, service }));
            if (tokens !== undefined)
                return { session: sessionFromTokens(tokens), source: `keychain:${service}` };
        }
        catch (error) {
            if (error?.code !== ANTHROPIC_IMPORT_LOCKED)
                throw error;
            keychainDenied = true;
        }
    }
    const candidates = paths ?? credentialsPaths(deps);
    for (const path of candidates) {
        tried.push(path);
        const raw = await readJson(path);
        if (raw === undefined)
            continue;
        const tokens = tokensFromClaudeCode(raw);
        if (tokens === undefined)
            continue;
        return { session: sessionFromTokens(tokens), source: path };
    }
    const error = new Error(keychainDenied ? ANTHROPIC_IMPORT_LOCKED : ANTHROPIC_IMPORT_EMPTY);
    error.code = error.message;
    throw error;
}
/**
 * Re-read an imported Claude Code login. Does not exchange the refresh
 * token and does not write the store: the refresh token is shared with
 * Claude Code, and rotating it without writing the successor back leaves
 * the local login `invalid_grant`.
 */
export async function rereadAnthropicImport(source, deps = {}) {
    if (!isAnthropicImportedSource(source))
        return undefined;
    if (source.startsWith('keychain:')) {
        const service = source.slice('keychain:'.length);
        let raw;
        try {
            raw = await readAnthropicKeychainTokens({ ...deps, service });
        }
        catch (error) {
            if (error?.code === ANTHROPIC_IMPORT_LOCKED)
                return undefined;
            throw error;
        }
        const tokens = tokensFromClaudeCode(raw);
        if (tokens === undefined)
            return undefined;
        return { ...sessionFromTokens(tokens), source };
    }
    const tokens = tokensFromClaudeCode(await readJson(source));
    if (tokens === undefined)
        return undefined;
    return { ...sessionFromTokens(tokens), source };
}
