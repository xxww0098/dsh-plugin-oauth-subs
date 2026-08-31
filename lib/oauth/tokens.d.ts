/** Refresh-aware session loader. Preempts expiry and drops permanent failures. */
export declare class TokenManager {
    #private;
    constructor({ displayName, preemptMs, load, save, remove, refresh, isPermanent, onRemoved }: {
        displayName: any;
        preemptMs: any;
        load: any;
        save: any;
        remove: any;
        refresh: any;
        isPermanent: any;
        onRemoved: any;
    });
    session(): Promise<any>;
    remember(fields: any): Promise<void>;
}
