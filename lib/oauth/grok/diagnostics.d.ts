import type { FamilyResponseObserver } from '../families.js';
import { type GrokPinDecision } from './cache.js';
export declare function setGrokCacheLog(path: string | undefined): void;
export declare function flushGrokCacheLog(): Promise<void>;
/** One factory per logical request. Retries must not become their own baseline. */
export declare function createGrokCacheObserver(payload: any, cacheSessionId: string | undefined, pin?: GrokPinDecision): FamilyResponseObserver | undefined;
