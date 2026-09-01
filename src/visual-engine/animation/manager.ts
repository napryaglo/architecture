import { ManualClock, type IClock } from './clock.js';
import type { Storyboard } from './storyboard.js';

// Process-global animation registry. Holds the active clock and the set
// of running storyboards; subscribes to the clock when the set is
// non-empty and unsubscribes when it empties, so an idle app doesn't
// burn rAF frames forever.
//
// One singleton instance lives at AnimationManager.Instance. Host shells
// replace the default ManualClock with a RafClock at startup:
//
//   import { AnimationManager, RafClock } from '@pragmatic-tech-ai/mural/runtime';
//   AnimationManager.Instance.Clock = new RafClock();
//
// Replacing Clock when storyboards are active rewires the subscription
// onto the new clock — running storyboards just see ticks from the
// replacement source. Existing elapsed times stay anchored against
// whichever clock they were Begun on, so a swap mid-animation produces
// monotonic continuity rather than time-warp.
export class AnimationManager
{
    private static _instance: AnimationManager | undefined;

    public static get Instance(): AnimationManager
    {
        if (AnimationManager._instance === undefined)
        {
            AnimationManager._instance = new AnimationManager();
        }
        return AnimationManager._instance;
    }

    // Test helper: drops the singleton so the next .Instance access
    // produces a fresh manager with a fresh ManualClock. Production code
    // should never call this — replace Clock on the existing instance
    // instead so subscribers don't lose their wiring.
    public static ResetForTests(): void
    {
        AnimationManager._instance?._unsubscribe?.();
        AnimationManager._instance = undefined;
    }

    private _clock:        IClock = new ManualClock();
    private _storyboards   = new Set<Storyboard>();
    private _unsubscribe:  (() => void) | undefined;

    public get Clock(): IClock { return this._clock; }
    public set Clock(c: IClock)
    {
        if (c === this._clock) return;
        // Detach from the old clock first so the swap doesn't double-
        // subscribe. Re-subscribe to the new clock IFF there are still
        // active storyboards, so an empty manager doesn't keep an
        // animation frame alive.
        const wasSubscribed = this._unsubscribe !== undefined;
        this._unsubscribe?.();
        this._unsubscribe = undefined;
        this._clock = c;
        if (wasSubscribed && this._storyboards.size > 0)
        {
            this._unsubscribe = c.Subscribe(now => this.tickAll(now));
        }
    }

    public Register(sb: Storyboard): void
    {
        if (this._storyboards.has(sb)) return;
        this._storyboards.add(sb);
        if (this._storyboards.size === 1)
        {
            this._unsubscribe = this._clock.Subscribe(now => this.tickAll(now));
        }
    }

    public Unregister(sb: Storyboard): void
    {
        if (!this._storyboards.has(sb)) return;
        this._storyboards.delete(sb);
        if (this._storyboards.size === 0)
        {
            this._unsubscribe?.();
            this._unsubscribe = undefined;
        }
    }

    public get ActiveCount(): number { return this._storyboards.size; }

    private tickAll(now: number): void
    {
        // Snapshot the active set — a storyboard that completes mid-tick
        // calls Unregister(this) from inside AdvanceTo, mutating the set
        // we'd otherwise be iterating.
        const snapshot = Array.from(this._storyboards);
        for (const sb of snapshot) sb.AdvanceTo(now);
    }
}
