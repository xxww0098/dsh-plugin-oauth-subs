/** One refresh owner per stored login and credential version. */
export declare class TokenManager {
    #private;
    constructor({ provider, authPath, displayName, preemptMs, refresh, isPermanent, onRemoved }: {
        provider: any;
        authPath: any;
        displayName: any;
        preemptMs: any;
        refresh: any;
        isPermanent: any;
        onRemoved: any;
    });
    session(id: any): Promise<any>;
    account(id: any): Promise<any>;
    remember(session: any, fields: any): Promise<void>;
}
