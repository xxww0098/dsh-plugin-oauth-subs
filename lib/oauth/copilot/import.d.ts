/**
 * Import GitHub Copilot credentials.
 *
 *   ~/.config/github-copilot/hosts.json   (VS Code / copilot.vim)
 *   ~/.config/github-copilot/apps.json
 *   ~/.local/share/opencode/auth.json     (provider github-copilot)
 *
 * Optional KEY source: COPILOT_GITHUB_TOKEN / GITHUB_TOKEN / GH_TOKEN / pasted ghu_|ghp_.
 * Auto-import only local files, and only when the roster is empty.
 * Never overwrite a stored session. Never write back to those files.
 */
export declare const COPILOT_IMPORT_EMPTY = "copilot-import-empty";
export declare function copilotHomePaths({ env, home }?: {
    env?: NodeJS.ProcessEnv;
    home?: string;
}): {
    hosts: string;
    apps: string;
    opencode: string;
};
export declare function resolveCopilotCliCredentials(options?: {}): Promise<{
    apiEndpoint?: string;
    githubRefreshToken?: string;
    githubToken?: string;
    planType?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: string;
}>;
export declare function resolveCopilotEnvKey({ env }?: {
    env?: NodeJS.ProcessEnv;
}): {
    githubToken: string;
    source: string;
};
export declare function importCopilotAuth(options?: {}): Promise<{
    source: string;
    session: {
        apiEndpoint?: string;
        githubRefreshToken?: string;
        githubToken?: string;
        planType?: string;
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
        tokenEndpoint: string;
        clientId: string;
        account: string;
        source: string;
    };
}>;
/** Build a stored session from a pasted GitHub token (controller useKey). */
export declare function copilotSessionFromGithubToken(token: any, extra?: {}): {
    apiEndpoint?: string;
    githubRefreshToken?: string;
    githubToken?: string;
    planType?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: string;
};
