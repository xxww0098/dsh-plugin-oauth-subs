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
    env?: NodeJS.ProcessEnv | undefined;
    home?: string | undefined;
}): {
    hosts: string;
    apps: string;
    opencode: string;
};
export declare function resolveCopilotCliCredentials(options?: any): Promise<{
    apiEndpoint?: string | undefined;
    githubRefreshToken?: string | undefined;
    githubToken?: string | undefined;
    planType?: string | undefined;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: any;
} | undefined>;
export declare function resolveCopilotEnvKey({ env }?: {
    env?: NodeJS.ProcessEnv | undefined;
}): {
    githubToken: string;
    source: string;
} | undefined;
export declare function importCopilotAuth(options?: any): Promise<{
    source: string;
    session: {
        apiEndpoint?: string | undefined;
        githubRefreshToken?: string | undefined;
        githubToken?: string | undefined;
        planType?: string | undefined;
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
        tokenEndpoint: string;
        clientId: string;
        account: string;
        source: any;
    };
}>;
/** Build a stored session from a pasted GitHub token (controller useKey). */
export declare function copilotSessionFromGithubToken(token: any, extra?: any): {
    apiEndpoint?: string | undefined;
    githubRefreshToken?: string | undefined;
    githubToken?: string | undefined;
    planType?: string | undefined;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: any;
};
