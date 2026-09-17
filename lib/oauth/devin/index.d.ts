/**
 * Devin Agent subscription family. Login is the Devin CLI's own PKCE hop:
 * app.devin.ai/auth/cli/continue → loopback → POST api.devin.ai/auth/cli/token.
 * Chat is Connect/protobuf ApiServerService/GetChatMessage on the Codeium
 * server (server.codeium.com) — not OpenAI REST. The session token rides in
 * `Metadata.api_key` as `devin-session-token$…`; identity metadata presents
 * the Windsurf-compatible ide/extension pair the backend gates on.
 *
 * Reference: Devin CLI 3000.10.31 (binary strings + live wire probes) and
 * oh-my-pi `pi-catalog` devin provider (Connect framing + message shapes).
 */
export declare const DEVIN_WEBAPP_URL = "https://app.devin.ai";
export declare const DEVIN_API_URL = "https://api.devin.ai";
export declare const DEVIN_API_SERVER = "https://server.codeium.com";
/** CLI login pages and the token exchange the real `devin auth login` hits. */
export declare const DEVIN_AUTHORIZE_PATH = "/auth/cli/continue";
export declare const DEVIN_TOKEN_PATH = "/auth/cli/token";
export declare const DEVIN_CALLBACK_PORT = 59653;
export declare const DEVIN_CALLBACK_PATH = "/callback";
/** Marker the CLI puts on its PKCE continue URL. */
export declare const DEVIN_PKCE_MARKER = "cli_pkce_marker=1";
export declare const DEVIN_AUTHORIZE_URL = "https://app.devin.ai/auth/cli/continue";
export declare const DEVIN_TOKEN_URL = "https://api.devin.ai/auth/cli/token";
export declare const DEVIN_CHAT_PATH = "/exa.api_server_pb.ApiServerService/GetChatMessage";
export declare const DEVIN_MODELS_PATH = "/exa.api_server_pb.ApiServerService/GetCliModelConfigs";
export declare const DEVIN_USER_JWT_PATH = "/exa.auth_pb.AuthService/GetUserJwt";
export declare const DEVIN_USER_STATUS_PATH = "/exa.seat_management_pb.SeatManagementService/GetUserStatus";
/**
 * MITM capture of the real `devin` binary (3000.10.31, Rust Codeium engine):
 * every RPC carries Metadata{ ide_name:'chisel', ide_version/extension_version:
 * cli version, extension_name:'chisel', locale:'en', os: process.platform,
 * api_key } and unary calls add `Authorization: Basic <token>-<token>`.
 * `ide_name: devin`/`Devin`/`devin-cli` are stub-gated (1 config); `chisel`
 * and `windsurf` both unlock the live catalog — `chisel` is what the CLI
 * actually sends.
 */
export declare const DEVIN_IDE_NAME = "chisel";
export declare const DEVIN_CLI_VERSION = "3000.10.31";
export declare const DEVIN_IDE_VERSION = "3000.10.31";
export declare const DEVIN_EXTENSION_NAME = "chisel";
export declare const DEVIN_EXTENSION_VERSION = "3000.10.31";
export declare const DEVIN_LOCALE = "en";
/** Packed DisplayOption values the CLI advertises on catalog RPCs (MITM). */
export declare const DEVIN_MODEL_DISPLAYS: readonly number[];
export declare const DEVIN_SESSION_PREFIX = "devin-session-token$";
export declare const DEVIN_PREEMPT_MS: number;
/** Session tokens outlive any sane login; JWT `exp` wins when it exists. */
export declare const DEVIN_FALLBACK_EXPIRES_MS: number;
/** Stop patterns the reference client always sends. */
export declare const DEVIN_STOP_PATTERNS: readonly string[];
export declare const DEVIN_PLAN_NAMES: Readonly<{
    free: "Free";
    devin_free: "Free";
    trial: "Trial";
    devin_trial: "Trial";
    pro: "Pro";
    devin_pro: "Pro";
    max: "Max";
    devin_max: "Max";
    teams: "Teams";
    devin_teams: "Teams";
    devin_teams_v2: "Teams";
    enterprise: "Enterprise";
    devin_enterprise: "Enterprise";
}>;
/** `teams_tier` enum → plan label (codeium_common.proto TeamsTier). */
export declare const DEVIN_TIER_NAMES: Readonly<{
    12: "Enterprise";
    14: "Teams";
    15: "Teams";
    16: "Pro";
    17: "Max";
    19: "Free";
    20: "Trial";
}>;
/** CLI stores `devin-session-token$…`; a pasted raw key gets the prefix once. */
export declare function normalizeDevinToken(value: any): string;
export declare function devinTokenExpiry(token: any, now?: number): number;
/** `user-…` ids and token-suffix vault keys are not display names. */
export declare function isDevinOpaqueAccount(value: any): boolean;
export declare function pickDevinHumanAccount(...candidates: any[]): string;
/** api.devin.ai/auth/cli/token answers `{ token }` (JSON). */
export declare function parseDevinTokenResponse(value: any, endpoint?: string): {
    token: string;
};
export declare function devinSession({ accessToken, expiresAt, account, planType, apiServer, source, }?: {
    source?: string;
}): {
    source: string;
    apiServer?: string;
    planType?: string;
    account?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
};
export declare const DEVIN_SOURCES: readonly string[];
export declare function devinSourceLabel(source: any): "key" | "env" | "CLI" | "PKCE";
export declare function devinApiServer(session: any): string;
/**
 * The token has no refresh grant. When the stored expiry is near, probe
 * GetUserStatus: a live session token stays valid, a dead one is a permanent
 * 401 → re-login. Never mutates the stored credential.
 */
export declare function refreshDevin(session: any, { fetchFn, statusFn }?: {
    fetchFn?: typeof fetch;
}): Promise<any>;
export declare function isDevinPermanentRefreshError(error: any): boolean;
/**
 * Loopback PKCE spec for the shared OAuthFlowManager. The authorize URL is
 * what `devin auth login` builds (including `cli_pkce_marker=1`).
 */
export declare const devinFlow: Readonly<{
    callbackPath: "/callback";
    listen: {
        host: string;
        ports: number[];
    };
    buildAuthorizeUrl({ redirectUri, state, pkce }: {
        redirectUri: any;
        state: any;
        pkce: any;
    }): string;
}>;
export declare function exchangeDevinCode(code: any, verifier: any, { fetchFn }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    source: string;
    apiServer?: string;
    planType?: string;
    account?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}>;
/** Devin chat is Completions-shaped at the DSH edge; efforts ride the uid. */
export declare const DEVIN_REASONING: Readonly<{
    off: "none";
    minimal: "minimal";
    low: "low";
    medium: "medium";
    high: "high";
    xhigh: "xhigh";
    max: "max";
}>;
/**
 * Static floor from the live GetCliModelConfigs probe (209 configs, 46
 * families, Pro tier, 3000.10.31 credentials). `variants` maps a DSH effort
 * key to the backend's `chat_model_uid`; `defaultUid` is the config upstream
 * flags `is_default_model_in_family`. Live discovery overlays this.
 */
export declare const DEVIN_MODELS: readonly {
    id: any;
    name: any;
    contextWindow: any;
    maxTokens: any;
    input: string[];
    variants: any;
    defaultUid: any;
    reasoningEfforts: any;
}[];
