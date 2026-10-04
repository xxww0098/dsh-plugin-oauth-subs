/**
 * Per-family TokenManager wiring, extracted verbatim from controller.ts
 * (behavior-identical move): one factory builds the 13 manager instances the
 * controller assigns to `this.tokens`. Everything those literals used to
 * close over from the constructor arrives through `deps`; family refresh
 * hooks, import predicates, and preempt constants stay imports from their own
 * family modules (the preempt values are single-sourced from the family
 * index constants — glm, kiro, ollama, and command-code have no exported
 * constant yet, so their literals stay).
 */
import { TokenManager } from './tokens.js';
/**
 * What the per-family TokenManager literals closed over in the controller
 * constructor — exactly the non-import values they read.
 */
export interface BuildTokenManagersDeps {
    /** Store path handed to every manager (the controller's `authPath`). */
    authPath: string;
    /** Outbound fetch seam (the controller constructor's `fetchFn`). */
    fetchFn: any;
    /** Cursor IDE import table (the controller's `cursorImport` seam object). */
    cursorImport: any;
    /**
     * Fires a family's auth-change notification. The controller passes a reader
     * that resolves `this.onAuthChanged` at call time, exactly like the inline
     * `onRemoved` closures did.
     */
    onAuthChanged: (provider?: string) => void;
}
export declare function buildTokenManagers(deps: BuildTokenManagersDeps): Record<string, TokenManager>;
