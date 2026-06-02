// Pluggable clock contract used by the animation engine. AnimationManager
// subscribes once per active storyboard set and ticks every active
// Storyboard from the callback.
//
// Two implementations ship in-repo:
//   * ManualClock (this file)         — deterministic, advanced by Tick(dt)
//                                       from test code. Used as the default
//                                       so tests don't need rAF / timers.
//   * RafClock    (visual-engine)     — wraps requestAnimationFrame for the
//                                       browser. HtmlTarget installs it on
//                                       AnimationManager at first construction.
//
// Times are in milliseconds since an arbitrary epoch (NOT wall-clock).
// Subscribers compare deltas, never absolute values.
export interface IClock
{
    /** Current time in milliseconds since this clock's arbitrary epoch. */
    Now(): number;

    /** Subscribe to tick notifications. Returns an unsubscribe function. */
    Subscribe(callback: (now: number) => void): () => void;
}

// Deterministic clock — does NOT advance until the caller invokes Tick or
// AdvanceTo. The animation engine's default clock so tests can drive
// animations without timers or rAF. Browser hosts replace this on the
// AnimationManager singleton with a RafClock instance.
export class ManualClock implements IClock
{
    private _now = 0;
    private readonly _listeners = new Set<(now: number) => void>();

    public Now(): number { return this._now; }

    public Subscribe(callback: (now: number) => void): () => void
    {
        this._listeners.add(callback);
        return (): void => { this._listeners.delete(callback); };
    }

    /** Advance the clock by `deltaMs`. All subscribers fire with the new
     *  time after the increment. */
    public Tick(deltaMs: number): void
    {
        if (deltaMs < 0)
        {
            throw new Error(`ManualClock.Tick: delta must be non-negative (got ${deltaMs}).`);
        }
        this._now += deltaMs;
        this.notify();
    }

    /** Jump the clock to an absolute time. The runtime guards against
     *  backwards motion since the animation engine assumes monotonic time —
     *  going backwards would silently reset every running storyboard's
     *  computed elapsed. */
    public AdvanceTo(ms: number): void
    {
        if (ms < this._now)
        {
            throw new Error(
                `ManualClock.AdvanceTo: time cannot go backwards (was ${this._now}, requested ${ms}).`);
        }
        this._now = ms;
        this.notify();
    }

    private notify(): void
    {
        // Snapshot the listener set so a subscriber that unsubscribes
        // mid-tick (the common case at storyboard completion — manager
        // unregisters its own subscription when the active set empties)
        // doesn't perturb iteration.
        const snapshot = Array.from(this._listeners);
        for (const l of snapshot) l(this._now);
    }
}
