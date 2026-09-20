/**
 * Ollama Cloud import is `OLLAMA_API_KEY` only.
 *
 * `ollama signin` stores an SSH identity (`~/.ollama/id_ed25519` /
 * `.pub`) that the local daemon uses to sign registry requests. That
 * is not a Bearer API key. Do not send the public key upstream.
 * Desktop `db.sqlite` / community `credentials.json` schemas are not
 * documented as Bearer stores — do not invent a parser.
 */
export declare const OLLAMA_IMPORT_EMPTY = "ollama-import-empty";
export declare function resolveOllamaLocalCredentials({ env }?: {
    env?: NodeJS.ProcessEnv | undefined;
}): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: string;
    source: any;
} | undefined>;
export declare function importOllamaAuth(options?: any): Promise<{
    source: any;
    session: {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
        account: string;
        source: any;
    };
}>;
