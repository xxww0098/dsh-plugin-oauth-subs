/**
 * Per-RPC wire envelope for Devin Connect calls: the Basic auth header and
 * the Metadata message every RPC (chat, catalog, status, jwt) carries. Split
 * from request.js as a leaf so catalog.js and request.js don't value-import
 * each other.
 */
/**
 * The real CLI sends `Authorization: Basic <apiKey>-<sessionId>` where the
 * session id is the session token itself (MITM capture). metadata.api_key
 * alone is accepted, but the header keeps the hop's fingerprint faithful.
 */
export declare function devinBasicAuth(session: any): string | undefined;
/** Wire Metadata message for every Devin RPC (chat, catalog, status, jwt). */
export declare function devinMetadataBytes(session: any, { userJwt, modelDisplays }?: any): Buffer<ArrayBuffer>;
