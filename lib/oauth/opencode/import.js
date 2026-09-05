/**
 * OpenCode Go Free import is OPENCODE_API_KEY / OPENCODE_GO_API_KEY only.
 *
 * Official CLI `/connect` pastes a key from https://opencode.ai/auth.
 * There is no local credential file to harvest. Never write back to
 * the user's OpenCode CLI store. Auto-import only when the roster is
 * empty. Never overwrite a stored session.
 */
import { opencodeSession, parseOpencodeApiKey } from './index.js';
export const OPENCODE_IMPORT_EMPTY = 'opencode-import-empty';
export async function resolveOpencodeLocalCredentials({ env = process.env } = {}) {
    const raw = typeof env.OPENCODE_GO_API_KEY === 'string' && env.OPENCODE_GO_API_KEY.trim()
        ? env.OPENCODE_GO_API_KEY
        : typeof env.OPENCODE_API_KEY === 'string' ? env.OPENCODE_API_KEY : '';
    if (!raw.trim())
        return undefined;
    return opencodeSession({ accessToken: parseOpencodeApiKey(raw), source: 'env' });
}
export async function importOpencodeAuth(options = {}) {
    const session = await resolveOpencodeLocalCredentials(options);
    if (!session) {
        const error = new Error(OPENCODE_IMPORT_EMPTY);
        error.code = OPENCODE_IMPORT_EMPTY;
        throw error;
    }
    return { source: session.source, session };
}
