/** Visible Chrome owned by the plugin; no host browser API or cookie replay. */
import { spawn } from 'node:child_process';
import { type ArenaBoard } from './arena.js';
export declare function arenaChromePaths(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string[];
export declare function fetchArenaWithChrome({ signal: parentSignal, timeoutMs, chromePath, spawnImpl, }?: {
    signal?: AbortSignal;
    timeoutMs?: number;
    chromePath?: string;
    spawnImpl?: typeof spawn;
}): Promise<Record<string, ArenaBoard>>;
