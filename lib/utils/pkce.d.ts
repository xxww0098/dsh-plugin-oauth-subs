/** PKCE (RFC 7636) and random-token helpers for the OAuth login flows. */
/** Base64url-encode without padding. */
export declare function base64url(buffer: any): any;
/** Mint a fresh PKCE pair (32-byte verifier, S256 challenge). */
export declare function createPkce(): {
    verifier: any;
    challenge: any;
};
/** Mint a URL-safe random token (default 32 bytes) for OAuth `state`. */
export declare function randomToken(bytes?: number): any;
/** Mint lowercase-hex random bytes (for Grok's `nonce` parameter). */
export declare function randomHex(bytes?: number): string;
