/**
 * On-disk OAuth session store at `<dataDir>/auth.json`.
 *
 * The file is a JSON object keyed by provider id. Writes are atomic
 * (tmp file + rename) with mode 0600 because they carry bearer tokens.
 */
import { readPrivateText, writePrivateText } from '../utils/private-text.js';
export { readPrivateText, writePrivateText };
/**
 * One stored login. The store's hard floor is a usable accessToken; every
 * other field (credentials, identity labels, hydrated hints) is family
 * territory and arrives as an open shape — assertSessionShape enforces the
 * credential triple when the file is read.
 */
export interface StoredSession {
    accessToken: string;
    /** Credential triple the loader asserts on every entry it reads. */
    refreshToken?: string;
    expiresAt: number;
    [key: string]: unknown;
}
/** One provider's entry in auth.json: its logins plus rotation bookkeeping. */
export interface SessionVault {
    activeId: string | undefined;
    accounts: Record<string, StoredSession>;
    /** Opaque change token per account id — rotated on every save. */
    generations: Record<string, string>;
}
/** A stored login plus the change tokens refresh bookkeeping compares on. */
export interface StoredAccount {
    id: string;
    session: StoredSession;
    active: boolean;
    generation: string;
    version: string;
}
/** The parsed auth.json: provider-keyed JSON, values still raw until asVault. */
export type SessionStore = Record<string, unknown>;
export declare const PROVIDER_IDS: readonly string[];
export declare function defaultDataDir(): string;
export declare function authFilePath(dataDir?: string): string;
export declare function accountIdOf(provider: string, session: StoredSession | null | undefined): string;
export declare function asVault(provider: string, entry: unknown): SessionVault;
export declare function loadStore(path?: string): Promise<SessionStore>;
export declare function getSession(provider: string, path?: string): Promise<StoredSession | undefined>;
export declare function listAccounts(provider: string, path?: string): Promise<Record<string, unknown>[]>;
export declare function listStoredSessions(provider: string, path?: string): Promise<StoredAccount[]>;
export declare function getStoredSession(provider: string, id: string | undefined, path?: string): Promise<StoredAccount | undefined>;
/** Only update the login/credentials that produced the result; never activate it. */
export declare function updateAccountSession(provider: string, source: StoredAccount, session: StoredSession, path?: string, nextId?: string): Promise<StoredAccount | undefined>;
export declare function replaceAccountId(provider: string, source: StoredAccount, session: StoredSession, path?: string): Promise<StoredAccount | undefined>;
export declare function saveSession(provider: string, session: StoredSession, path?: string, options?: {
    activate?: boolean;
    id?: string;
}): Promise<StoredAccount | undefined>;
export declare function switchAccount(provider: string, id: string, path?: string): Promise<void>;
export declare function deleteSession(provider: string, path?: string, id?: string, source?: StoredAccount): Promise<boolean>;
export declare function publicSession(provider: string, session: StoredSession | undefined): Record<string, unknown> | undefined;
