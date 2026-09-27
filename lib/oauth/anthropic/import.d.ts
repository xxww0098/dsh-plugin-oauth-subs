/**
 * Import an existing Claude Code login so a user who already ran
 * `claude login` on this machine does not have to repeat the browser flow.
 *
 * Stores, in the order the pinned client (`claude-cli/2.1.280`) reads them —
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
 * Both stores hold the same document, and 2.1.280 writes the Keychain first and
 * deletes the plaintext file once that write succeeds (the composed
 * `keychain-with-plaintext-fallback` store's `update()`). On macOS the file is
 * therefore normally absent: a file-only reader can never see a macOS login.
 *
 * The token carries no identity, so the importing login hydrates its account
 * uuid / email through the profile endpoint in the controller (the same
 * finisher the browser login uses).
 */
export declare const ANTHROPIC_IMPORT_EMPTY = "anthropic-import-empty";
/**
 * Read budget for the Keychain probe. An absent item returns at once; a present
 * one can wait on the system "…wants to use your confidential information"
 * dialog, which the user answers by hand — so this is seconds, not the pinned
 * client's 2s cached read.
 */
export declare const ANTHROPIC_KEYCHAIN_TIMEOUT_MS = 30000;
/** `CLAUDE_CONFIG_DIR` when set, else `~/.claude` — the client's config root. */
export declare function anthropicConfigDir({ env, home }?: any): any;
/** `RD()` of the pinned client: `Claude Code${OAUTH_FILE_SUFFIX}${n}${configHash}`. */
export declare function anthropicKeychainService({ env }?: any): string;
/** `tA()` of the pinned client: `$USER` while it is a safe keychain account name. */
export declare function anthropicKeychainAccount({ env }?: any): string;
/**
 * macOS only. Every failure — absent item, refused read, dismissed dialog,
 * non-JSON payload — means "no login here"; never surface it to the UI.
 */
export declare function readAnthropicKeychainTokens({ platform, env, execFileFn, timeoutMs, }?: any): Promise<any>;
/**
 * `paths` pins the plaintext candidates and skips the OS store — tests and
 * callers that already know the file. Called bare it mirrors the pinned client:
 * macOS Keychain first, plaintext file as the fallback.
 */
export declare function importAnthropicAuth(paths?: undefined, deps?: any): Promise<{
    session: {
        planType?: any;
        accountId?: any;
        account?: any;
        scope?: any;
        accessToken: any;
        refreshToken: any;
        expiresAt: number;
    };
    source: string;
}>;
