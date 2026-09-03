/**
 * Cursor PKCE deep-link login. Opens loginDeepControl; the plugin polls
 * api2.cursor.sh/auth/poll until tokens arrive. No loopback callback.
 */
import { completeCursorLogin, cursorLoginParams, pollCursorAuth } from './index.js';
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason instanceof Error ? signal.reason : new Error('login cancelled'));
            return;
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason instanceof Error ? signal.reason : new Error('login cancelled'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
export class CursorPollFlowManager {
    constructor() {
        this.attempts = new Map();
    }
    isBusy(provider) {
        return this.attempts.has(provider);
    }
    pending(provider) {
        return this.attempts.get(provider);
    }
    async start(provider, { fetchFn = fetch } = {}) {
        if (this.attempts.has(provider)) {
            throw new Error(`a ${provider} login attempt is already in progress`);
        }
        const started = cursorLoginParams();
        const controller = new AbortController();
        let resolveToken;
        let rejectToken;
        const tokenPromise = new Promise((resolve, reject) => {
            resolveToken = resolve;
            rejectToken = reject;
        });
        tokenPromise.catch(() => undefined);
        const settle = (error, ready) => {
            if (this.attempts.get(provider) !== attempt)
                return;
            this.attempts.delete(provider);
            if (error)
                rejectToken(error);
            else
                resolveToken(ready);
        };
        const attempt = {
            authorizeUrl: started.loginUrl,
            uuid: started.uuid,
            mode: 'cli',
            waitToken: () => tokenPromise,
            cancel: () => {
                controller.abort(new Error('login cancelled'));
                settle(new Error('login cancelled'));
            },
        };
        this.attempts.set(provider, attempt);
        void (async () => {
            try {
                const tokens = await pollCursorAuth(started.uuid, started.verifier, {
                    fetchFn,
                    sleep,
                    signal: controller.signal,
                });
                const session = await completeCursorLogin(tokens, { source: 'pkce' });
                settle(undefined, session);
            }
            catch (error) {
                settle(error instanceof Error ? error : new Error(String(error)));
            }
        })();
        return attempt;
    }
}
