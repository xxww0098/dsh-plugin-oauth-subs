/** Minimal JWT payload decoding for claims extraction (no signature verification). */
/**
 * Decode a JWT payload without verifying the signature. Used only to read
 * account claims from tokens issued over the provider's own TLS channel
 * during a code exchange we initiated — never to authorize anything.
 */
export declare function decodeJwtPayload(token: any): any;
