/** One refresh owner per stored login and credential version. */
import { deleteSession, getStoredSession, updateAccountSession } from './store.js';
export class TokenManager {
    constructor({ provider, authPath, displayName, preemptMs, refresh, isPermanent, onRemoved }) {
        this.provider = provider;
        this.authPath = authPath;
        this.displayName = displayName;
        this.preemptMs = preemptMs;
        this.refresh = refresh;
        this.isPermanent = isPermanent;
        this.onRemoved = onRemoved;
        this.inflight = new Map();
        this.sources = new WeakMap();
    }
    async session(id) {
        return (await this.account(id)).session;
    }
    async account(id) {
        const source = await getStoredSession(this.provider, id, this.authPath);
        if (!source)
            throw new Error(`${this.displayName} is not logged in`);
        let current = source;
        if (source.session.expiresAt - Date.now() <= this.preemptMs) {
            let pending = this.inflight.get(source.version);
            if (!pending) {
                pending = this.#refresh(source).finally(() => this.inflight.delete(source.version));
                this.inflight.set(source.version, pending);
            }
            current = await pending;
        }
        this.sources.set(current.session, current);
        return current;
    }
    async remember(session, fields) {
        const source = this.sources.get(session);
        if (!source)
            return;
        await updateAccountSession(this.provider, source, { ...session, ...fields }, this.authPath);
    }
    async #refresh(source) {
        let next;
        try {
            next = await this.refresh(source.session);
        }
        catch (error) {
            if (this.isPermanent(error)) {
                const removed = await deleteSession(this.provider, this.authPath, source.id, source);
                if (removed)
                    this.onRemoved?.();
                throw new Error(`${this.displayName} login expired; sign in again`);
            }
            throw error;
        }
        const saved = await updateAccountSession(this.provider, source, next, this.authPath);
        if (!saved)
            throw new Error(`${this.displayName} session changed; retry the request`);
        return saved;
    }
}
