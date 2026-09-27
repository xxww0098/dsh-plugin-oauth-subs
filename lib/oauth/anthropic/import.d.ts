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
export declare const ANTHROPIC_IMPORT_EMPTY = "anthropic-import-empty";
export declare function importAnthropicAuth(paths?: undefined): Promise<{
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
