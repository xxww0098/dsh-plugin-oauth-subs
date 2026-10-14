/**
 * Command Code failure mapping.
 *
 * Both surfaces answer an `{error:{…}}` envelope — `/alpha/generate` as
 * `{success:false, error:{code,status,message,hint}}`, `/provider/v1/*` as
 * `{error:{message,type,code}}` — and the CLI's own classifier
 * (`classifyKind`, bundle 1.79.2) sorts those into auth / credits / plan /
 * usage-limit / rate-limit / overloaded.
 *
 * Three of those kinds must not reach the DSH host as-is. Its
 * `classifyPiAiError` reads `\b401\b` or `\b403\b` anywhere in
 * `<status> <body>` as AUTH and never retries it, so a refusal that keeps
 * that status — or merely echoes those digits — reads as a dead login:
 *
 *   upgrade_required    the client version is below the server's `minVersion`.
 *                       Live 2026-10-10: a request with no version header, or
 *                       `0.1.0`, answers `403 {"code":"upgrade_required",
 *                       "minVersion":"0.18.10"}`; our pinned 1.82.1 passes.
 *   model_not_in_plan   the plan does not carry the model.
 *   credits / window    out of credits, or a 5-hour / weekly window is used up.
 *
 * The first two become 400 (INVALID_REQUEST: shown, not retried, login kept).
 * Credits and window limits become 429 `usage limit reached: …`
 * (QUOTA_EXCEEDED: shown, not retried) through the shared `quotaFailure`.
 * Everything else returns `undefined` — the upstream's own answer.
 */
/** Flatten either envelope into the first code, the message, and minVersion. */
export declare function commandCodeErrorBits(payload: any): {
    code: string;
    message: string;
    minVersion: string;
};
/**
 * `{status, message}` for a refusal this hop must not forward verbatim, or
 * `undefined` to keep the upstream status and body.
 */
export declare function commandCodeFailure(status: any, payload: any): {
    status: any;
    message: any;
} | undefined;
