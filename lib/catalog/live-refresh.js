/**
 * In-flight refresh for one family's in-memory catalog.
 *
 * The instance holds that family's rows only. Callers keep their own floor,
 * identity, and egress discriminator. A failed or empty read never refreshes
 * `expiresAt`. A result from an older publish, or from a fetch that started
 * before `reset`, does not write.
 */
export function createLiveCatalog(options) {
    const copyOnRead = options.copy !== false;
    let generation = 0;
    let seq = 0;
    let current;
    let currentIdentity;
    const entries = new Map();
    const byCredential = new Map();
    const publishedSeq = new Map();
    const inflight = new Map();
    const read = (rows) => (copyOnRead ? [...rows] : rows);
    const mirror = (identity, rows, expiresAt) => {
        if (!identity || !rows?.length) {
            current = undefined;
            currentIdentity = undefined;
            options.onStore?.(null);
            return;
        }
        current = rows;
        currentIdentity = identity;
        options.onStore?.({ identity, rows, expiresAt });
        const publish = entries.get(identity)?.publish;
        if (!publish)
            return;
        try {
            publish(rows);
        }
        catch {
            // A side effect must not drop a catalog that already published.
        }
    };
    const finish = (flight, rows) => {
        flight.resolve(read(rows));
    };
    async function run(flight) {
        try {
            // Same-turn callers replace `fetch` before this yield. One upstream read.
            await Promise.resolve();
            if (flight.generation !== generation) {
                finish(flight, current?.length ? current : options.fallback());
                return;
            }
            flight.started = true;
            let disc = '';
            if (flight.discriminator) {
                try {
                    disc = String(await flight.discriminator() ?? '');
                }
                catch {
                    disc = '';
                }
            }
            if (flight.generation !== generation) {
                finish(flight, current?.length ? current : options.fallback());
                return;
            }
            const identity = `${flight.credential}\n${disc}`;
            const hit = entries.get(identity);
            if (flight.reuse && hit && hit.rows.length > 0 && flight.now < hit.expiresAt) {
                byCredential.set(flight.credential, identity);
                mirror(identity, hit.rows, hit.expiresAt);
                finish(flight, hit.rows);
                return;
            }
            let rows;
            try {
                rows = await flight.fetch();
            }
            catch {
                rows = null;
            }
            if (flight.generation !== generation) {
                finish(flight, current?.length ? current : options.fallback());
                return;
            }
            const published = publishedSeq.get(identity) ?? 0;
            if (flight.seq < published) {
                const newer = entries.get(identity);
                finish(flight, newer?.rows?.length ? newer.rows : (current?.length ? current : options.fallback()));
                return;
            }
            if (Array.isArray(rows) && rows.length > 0) {
                const expiresAt = flight.reuse ? flight.now + flight.ttlMs : flight.now;
                entries.set(identity, { rows, expiresAt, publish: flight.publish });
                publishedSeq.set(identity, flight.seq);
                byCredential.set(flight.credential, identity);
                mirror(identity, rows, expiresAt);
                finish(flight, rows);
                return;
            }
            if (hit?.rows?.length) {
                // This call returns the same identity's previous success. Publishing
                // it would replace another account's rows, and a quota refresh would
                // sync that signature. Only the identity already on display falls back
                // in place.
                if (currentIdentity === identity) {
                    byCredential.set(flight.credential, identity);
                    mirror(identity, hit.rows, hit.expiresAt);
                }
                finish(flight, hit.rows);
                return;
            }
            byCredential.delete(flight.credential);
            // This identity has no success to fall back to. Its return value is the
            // static floor. Another identity's published rows stay: a later account's
            // failure must not become the catalog the settings sync writes.
            if (currentIdentity === identity) {
                current = undefined;
                currentIdentity = undefined;
                options.onStore?.(null);
            }
            finish(flight, options.fallback());
        }
        finally {
            if (inflight.get(flight.credential) === flight)
                inflight.delete(flight.credential);
        }
    }
    return {
        reset() {
            generation += 1;
            entries.clear();
            byCredential.clear();
            publishedSeq.clear();
            inflight.clear();
            current = undefined;
            currentIdentity = undefined;
            options.onStore?.(null);
        },
        /**
         * Ask again without dropping the published rows. In-flight reads from
         * before this call do not publish. A failed re-ask keeps the getter, so
         * it is not a settings write. Test isolation uses `reset`.
         */
        reask() {
            generation += 1;
            inflight.clear();
            for (const entry of entries.values())
                entry.expiresAt = 0;
        },
        /** Install rows without treating them as a timed fetch. Same array when `copy` is false. */
        adopt(rows) {
            current = rows;
            currentIdentity = undefined;
        },
        /** Stored rows, or undefined when the getter should use the static floor. */
        stored() {
            return current?.length ? current : undefined;
        },
        models() {
            return read(current?.length ? current : options.fallback());
        },
        refresh(request) {
            const credential = typeof request.credential === 'string' ? request.credential : '';
            if (!credential)
                return Promise.resolve(read(options.fallback()));
            const now = typeof request.now === 'number' ? request.now : Date.now();
            const ttlMs = typeof request.ttlMs === 'number' ? request.ttlMs : 0;
            const reuse = request.reuse !== false;
            if (!request.discriminator && reuse) {
                const identity = byCredential.get(credential);
                const hit = identity ? entries.get(identity) : undefined;
                if (hit && hit.rows.length > 0 && now < hit.expiresAt) {
                    mirror(identity, hit.rows, hit.expiresAt);
                    return Promise.resolve(read(hit.rows));
                }
            }
            const existing = inflight.get(credential);
            if (existing && existing.generation === generation) {
                if (!existing.started) {
                    existing.seq = ++seq;
                    existing.ttlMs = ttlMs;
                    existing.now = now;
                    existing.reuse = reuse;
                    existing.fetch = request.fetch;
                    existing.discriminator = request.discriminator;
                    existing.publish = request.publish;
                }
                return existing.promise;
            }
            let resolve;
            const promise = new Promise((res) => {
                resolve = res;
            });
            const flight = {
                promise,
                resolve,
                generation,
                seq: ++seq,
                started: false,
                credential,
                ttlMs,
                now,
                reuse,
                fetch: request.fetch,
                discriminator: request.discriminator,
                publish: request.publish,
            };
            inflight.set(credential, flight);
            void run(flight);
            return promise;
        },
    };
}
