/**
 * Cursor PKCE deep-link login. Opens loginDeepControl; the plugin polls
 * api2.cursor.sh/auth/poll until tokens arrive. No loopback callback.
 */
export declare class CursorPollFlowManager {
    constructor();
    isBusy(provider: any): any;
    pending(provider: any): any;
    start(provider: any, { fetchFn }?: {
        fetchFn?: typeof fetch;
    }): Promise<{
        authorizeUrl: string;
        uuid: string;
        mode: string;
        waitToken: () => Promise<unknown>;
        cancel: () => void;
    }>;
}
