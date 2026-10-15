/**
 * One comparison for "did this catalog change in a way that affects routes".
 * Warmup, login discovery, and manual quota refresh all use it. Alias and
 * per-model window overrides are applied at the settings write, not here.
 */
export function catalogRouteSignature(models) {
    return (models ?? []).map((model) => {
        const input = Array.isArray(model?.input) ? model.input.join('\u0002') : '';
        let efforts = '';
        if (model?.reasoningEfforts === false)
            efforts = 'false';
        else if (model?.reasoningEfforts && typeof model.reasoningEfforts === 'object') {
            efforts = Object.keys(model.reasoningEfforts).sort()
                .map((key) => `${key}=${model.reasoningEfforts[key]}`)
                .join('\u0002');
        }
        return `${model?.id ?? ''}\u0001${model?.contextWindow ?? ''}\u0001${input}\u0001${efforts}`;
    }).join('\0');
}
/**
 * First login still notifies (loggedIn flipped). A later discovery notifies
 * only when the routing signature changed. A thrown sync does not fail discovery.
 */
export async function notifyCatalogDiscovery(ctl, provider, options) {
    if (options.wasSignedIn && catalogRouteSignature(options.models) === options.before)
        return;
    try {
        await ctl.onAuthChanged?.(provider);
    }
    catch {
        // Discovery stays up when the settings write fails.
    }
}
