/**
 * Ollama Cloud account lifecycle for AuthController: live catalog discovery, OLLAMA_API_KEY
 * auto-import, and identity from /api/me.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../../oauth/controller.js';
export declare function discoverOllama(ctl: AuthController, session: any): Promise<any>;
export declare function maybeAutoImportOllama(ctl: AuthController): Promise<void>;
export declare function importOllama(ctl: AuthController): Promise<{
    source: any;
    session: any;
    skipped: boolean;
} | {
    session: any;
    source: any;
    skipped?: undefined;
}>;
export declare function finishOllamaSession(ctl: AuthController, session: any): Promise<any>;
export declare function rememberOllamaIdentity(ctl: AuthController, row: any, quota: any): Promise<void>;
