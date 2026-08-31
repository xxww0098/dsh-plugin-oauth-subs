/**
 * Kiro credential import. Formats distilled from kiro-manager-lite
 * (https://github.com/lucks-cloud/kiro-manager-lite) plus kiro.rs dumps
 * and the Kiro IDE SSO cache. Original parsers — do not copy AGPL source.
 *
 * Recognised:
 *   卡密        email----password----refreshToken----clientId----clientSecret----provider
 *   compact JSON  [{ email, refreshToken, provider, clientId, clientSecret }]
 *   full backup   { app: "kiro-account-lite", accounts: [{ credentials, idp, email }] }
 *   CSV / TXT     header aliases 邮箱/email/refreshToken/登录方式
 *   kiro.rs       credentials.json array or object
 *   IDE token     ~/.aws/sso/cache/kiro-auth-token.json (+ client registration json)
 *   API keys      ksk_… lines
 */
export declare function kiroSsoClientIdHash(startUrl?: string): string;
/** Merge Kiro IDE token file with the hashed OIDC client registration next to it. */
export declare function hydrateKiroSsoToken(token: any, registration: any): any;
export declare function flattenKiroImport(raw: any): any;
export declare function sessionsFromKiroAuth(raw: any): any[];
/**
 * @returns {{ kind: string, sessions: object[] }}
 * kind: json | kami | csv | keys | raw-token | empty
 */
export declare function parseKiroImportText(raw: any): {
    kind: string;
    sessions: any[];
};
export declare function isKiroBatchImport(kind: any): boolean;
