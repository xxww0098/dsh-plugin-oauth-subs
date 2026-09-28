/**
 * Command Code credential import: same order the CLI resolves its key in
 * (`getCommandAuthKey` → `getCommandApiKeyFromEnv` first, then the auth
 * file):
 *
 *   1. `COMMAND_CODE_API_KEY` environment variable → source 'env'
 *   2. `~/.commandcode/auth.json` `{ apiKey, userId, userName, keyName,
 *      authenticatedAt }` → source 'cli'
 *
 * The auth file is what `cmd auth login` writes; its fields map onto the
 * session directly so the imported row shows the same username the CLI does.
 */
/** Sentinel for "nothing to import" — the UI maps this to a friendly hint. */
export declare const COMMAND_CODE_IMPORT_EMPTY = "command-code-import-empty";
/** Parse ~/.commandcode/auth.json; returns undefined when missing/invalid. */
export declare function readCommandCodeAuthFile({ home, path, readFileFn }?: any): Promise<{
    apiKey: any;
    userId: any;
    userName: any;
    keyName: any;
} | undefined>;
/**
 * Import one session. Env wins over the auth file, matching the CLI. Throws
 * COMMAND_CODE_IMPORT_EMPTY-coded errors when neither source has a key.
 */
export declare function importCommandCodeAuth(options?: any): Promise<{
    source: string;
    session: any;
}>;
