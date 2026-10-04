/**
 * Per-RPC wire envelope for Devin Connect calls: the Basic auth header and
 * the Metadata message every RPC (chat, catalog, status, jwt) carries. Split
 * from request.js as a leaf so catalog.js and request.js don't value-import
 * each other.
 */
import { DEVIN_IDE_NAME, DEVIN_IDE_VERSION, DEVIN_EXTENSION_NAME, DEVIN_EXTENSION_VERSION, DEVIN_LOCALE, } from './index.js';
import { encodeDevinMetadata } from './proto.js';
/**
 * The real CLI sends `Authorization: Basic <apiKey>-<sessionId>` where the
 * session id is the session token itself (MITM capture). metadata.api_key
 * alone is accepted, but the header keeps the hop's fingerprint faithful.
 */
export function devinBasicAuth(session) {
    const key = session?.accessToken;
    return typeof key === 'string' && key ? `Basic ${key}-${key}` : undefined;
}
/** Wire Metadata message for every Devin RPC (chat, catalog, status, jwt). */
export function devinMetadataBytes(session, { userJwt, modelDisplays } = {}) {
    return encodeDevinMetadata({
        apiKey: session?.accessToken,
        userJwt,
        ideName: DEVIN_IDE_NAME,
        ideVersion: DEVIN_IDE_VERSION,
        extensionName: DEVIN_EXTENSION_NAME,
        extensionVersion: DEVIN_EXTENSION_VERSION,
        locale: DEVIN_LOCALE,
        os: process.platform,
        modelDisplays,
    });
}
