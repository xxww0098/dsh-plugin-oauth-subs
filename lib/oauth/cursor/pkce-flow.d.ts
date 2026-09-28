/**
 * Cursor PKCE deep-link login. Opens loginDeepControl; the plugin polls
 * api2.cursor.sh/auth/poll until tokens arrive. No loopback callback.
 */
import { outboundFetch } from '../../utils/outbound.js';
export declare class CursorPollFlowManager {
    attempts: Map<string, any>;
    constructor();
    isBusy(provider: any): boolean;
    pending(provider: any): any;
    start(provider: any, { fetchFn }?: {
        fetchFn?: typeof outboundFetch | undefined;
    }): Promise<{
        authorizeUrl: string;
        uuid: string;
        mode: string;
        waitToken: () => Promise<unknown>;
        cancel: () => void;
    }>;
}
