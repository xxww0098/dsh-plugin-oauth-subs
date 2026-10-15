/**
 * One comparison for "did this catalog change in a way that affects routes".
 * Warmup, login discovery, and manual quota refresh all use it. Alias and
 * per-model window overrides are applied at the settings write, not here.
 */
export declare function catalogRouteSignature(models: readonly any[] | undefined): string;
/**
 * First login still notifies (loggedIn flipped). A later discovery notifies
 * only when the routing signature changed. A thrown sync does not fail discovery.
 */
export declare function notifyCatalogDiscovery(ctl: any, provider: string, options: {
    wasSignedIn: boolean;
    before: string;
    models: readonly any[] | undefined;
}): Promise<void>;
