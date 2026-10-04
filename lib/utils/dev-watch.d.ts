/**
 * Debounced serial build queue behind `npm run dev` (scripts/dev-watch.ts).
 *
 * The dev loop is: source change → rebuild `lib/` → the two DSH HMR halves
 * pick it up (dsh-hmr reloads the host plugin, dsh-client-hmr swaps
 * `lib/ui/client.js` in open pages). A save and a build each emit bursts —
 * editors fire several events, tsc rewrites dozens of files — so the queue
 * collapses every burst into one run inside a fixed window measured from the
 * FIRST push (a rolling window could starve under continuous writes; a fixed
 * one bounds time-to-build at debounceMs). Runs never overlap: a push during
 * a build only marks the queue dirty and schedules exactly one re-run, so
 * `npm run dev-build` itself is the only writer of `lib/`. A failing run
 * reports through onError and leaves the queue alive — a broken intermediate
 * save must not kill the loop.
 *
 * Pure mechanism, no fs/child_process: tests drive it with injected timers
 * (test/dev-watch.test.ts), the script wires fs.watch + spawn.
 */
export interface BuildQueueOptions {
    /** Window from the first push to the run; default 500ms. */
    debounceMs?: number;
    /** Injectable so tests can fire the window deterministically. */
    setTimer?: (fn: () => void, ms: number) => unknown;
    /** Injectable counterpart of setTimer; default clearTimeout. */
    clearTimer?: (handle: unknown) => void;
    /** Called when a run starts. */
    onStart?: () => void;
    /** Called when a run settles; ok is false when run rejected (or onError threw). */
    onDone?: (ok: boolean) => void;
    /** Called with the rejection; must not throw (a throw is swallowed and counted as a failed run). */
    onError?: (error: unknown) => void;
}
export interface BuildQueue {
    /** A change happened; collapses into the open window or marks dirty during a run. */
    push(): void;
    waiting(): boolean;
    running(): boolean;
    /** Cancels the pending window, waits for the in-flight run, ignores later pushes. Never rejects. */
    stop(): Promise<void>;
}
export declare function createBuildQueue(run: () => Promise<unknown>, options?: BuildQueueOptions): BuildQueue;
export interface HmrWiringProbe {
    /** Profile directory names under the dsh profiles root. */
    listProfiles(): string[];
    /** Real path of a profile's installed plugin package; undefined when absent. */
    packageRealPath(profile: string): string | undefined;
    /** The profile's `cordis.patch.yml` text; undefined when there is none. */
    readPatch(profile: string): string | undefined;
}
export interface ProfileHmrStatus {
    profile: string;
    /** linked: the profile runs this working tree; copy: an installed package copy. */
    kind: 'linked' | 'copy';
    /** The patch has an `hmr` entry at all. */
    hmrEntryPresent: boolean;
    /** That entry's `root` list names this repo — without it, host-half edits never reload. */
    hmrCoversRepo: boolean;
}
/**
 * Which profiles run this working tree (symlink → linked) versus an installed
 * copy, and whether each profile's `hmr` entry watches this repo. This is the
 * one manual step of the dev loop, and its failure mode is silent (edits just
 * never hot-reload), so `npm run dev` probes it at startup and after every
 * build. Read-only on purpose: the patch file belongs to DSH, fixing it stays
 * a paste — the watcher prints the exact block with the absolute path filled in.
 * Substring checks are a hint, not a gate: profiles patching `hmr` differently
 * (merged roots, other repos) only get a nudge, never a rewrite.
 */
export declare function inspectHmrWiring({ root, probe }: {
    root: string;
    probe: HmrWiringProbe;
}): ProfileHmrStatus[];
