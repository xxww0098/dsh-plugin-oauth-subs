/**
 * In-flight refresh for one family's in-memory catalog.
 *
 * The instance holds that family's rows only. Callers keep their own floor,
 * identity, and egress discriminator. A failed or empty read never refreshes
 * `expiresAt`. A result from an older publish, or from a fetch that started
 * before `reset`, does not write.
 */
export interface LiveRefreshRequest<T> {
    /** Empty skips the read and returns the static fallback. */
    credential: string;
    ttlMs?: number;
    /** Caller clock. Freshness is `now < expiresAt`, not a negative ttl. */
    now?: number;
    /**
     * When false, a successful read is remembered for same-identity fallback
     * but the next refresh always asks again. Devin has no TTL.
     */
    reuse?: boolean;
    fetch: () => Promise<readonly T[] | null | undefined>;
    /** Awaited after the in-flight slot is taken. Joins the cache identity. */
    discriminator?: () => Promise<string>;
    /**
     * Stored with a non-empty read and run again whenever that identity is
     * shown, including a cache hit that does not fetch.
     */
    publish?: (rows: readonly T[]) => void;
}
export declare function createLiveCatalog<T>(options: {
    fallback: () => readonly T[];
    /** False keeps the stored array (Devin `===` the static floor and the live rows). */
    copy?: boolean;
    onStore?: (state: {
        identity: string;
        rows: readonly T[];
        expiresAt: number;
    } | null) => void;
}): {
    reset(): void;
    /**
     * Ask again without dropping the published rows. In-flight reads from
     * before this call do not publish. A failed re-ask keeps the getter, so
     * it is not a settings write. Test isolation uses `reset`.
     */
    reask(): void;
    /** Install rows without treating them as a timed fetch. Same array when `copy` is false. */
    adopt(rows: readonly T[]): void;
    /** Stored rows, or undefined when the getter should use the static floor. */
    stored(): readonly T[] | undefined;
    models(): readonly T[];
    refresh(request: LiveRefreshRequest<T>): Promise<readonly T[]>;
};
