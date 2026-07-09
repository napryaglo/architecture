import type { Model, PropertyKey } from '../../runtime/model.js';
import { resolveKey } from '../../runtime/model-internals.js';

import { AnimationManager } from './manager.js';
import { FillBehavior, type AnimationTimeline } from './timeline.js';

// Run state of a Storyboard:
//   NotStarted — Created but Begin() hasn't been called.
//   Running    — Begin() called; clock subscription active; storyboard
//                evaluates every tick.
//   Filling    — All children completed with HoldEnd. Clock subscription
//                released to save frames; the animated slots stay pinned
//                at the final values. Stop() releases them; otherwise
//                they hold until the consumer explicitly clears.
//   Stopped    — Explicit Stop() called OR all children completed with
//                FillBehavior.Stop. Animation slots cleared; underlying
//                local / binding values re-surface.
export enum StoryboardState
{
    NotStarted = 'NotStarted',
    Running    = 'Running',
    /** Tick paused — animation slots stay pinned at their last computed
     *  value, the manager no longer ticks this storyboard. Resume()
     *  re-anchors the clock and re-registers. */
    Paused     = 'Paused',
    Filling    = 'Filling',
    Stopped    = 'Stopped',
}

interface StoryboardChild
{
    readonly target:       Model;
    readonly propertyName: string;
    /** Resolved at Add() so per-tick reads / animated-slot writes go
     *  through the typed-key API on Model rather than re-resolving the
     *  string on every clock tick. */
    readonly propertyKey:  PropertyKey<unknown>;
    readonly timeline:     AnimationTimeline;
    /** Property's value captured at Begin() — used as the From when the
     *  timeline's own From is undefined ("animate FROM the current"). */
    baseValue:             unknown;
    /** Was the animation slot SET at any point during this storyboard's
     *  run? Used by Stop / completion to clear only the targets we
     *  actually wrote to (a 'before'-phase child we never reached
     *  shouldn't get a spurious ClearAnimatedValue). */
    everWritten:           boolean;
}

// Composes multiple AnimationTimelines, each bound to a (Model, propertyName)
// target. Begin() captures every target's current value as that timeline's
// baseValue (used when From is undefined) and registers the storyboard with
// the AnimationManager. AdvanceTo (called once per clock tick) evaluates
// each child and writes the result into the target's animation slot.
//
// When every child has rolled past its (BeginTime + Duration) end, the
// storyboard transitions to Filling (if any child has FillBehavior.HoldEnd)
// or Stopped (all children Stop), releasing animation slots as appropriate.
//
// Authoring patterns:
//
//   // Single-target — wrap a Timeline in a Storyboard implicitly via
//   // Model.BeginAnimation(propertyName, timeline) below. Storyboard
//   // returned for explicit .Stop() control.
//
//   // Multi-target — explicit Storyboard.
//   const sb = new Storyboard();
//   sb.Add(panel, 'Opacity', new DoubleAnimation({ From: 0, To: 1, Duration: 300 }));
//   sb.Add(panel, 'Width',   new DoubleAnimation({ To: 200, Duration: 300,
//                                                  Easing: Easings.CubicOut }));
//   sb.Begin();
export class Storyboard
{
    private readonly _children: StoryboardChild[] = [];
    private readonly _completedListeners = new Set<() => void>();
    private _state:    StoryboardState = StoryboardState.NotStarted;
    /** Clock time when Begin() ran. AdvanceTo elapsed = clock.Now() - _beginAt. */
    private _beginAt:  number = 0;
    /** Captured elapsed at Pause() time, restored at Resume(). undefined
     *  when no pause is currently active. */
    private _pausedElapsed: number | undefined;

    public get State(): StoryboardState { return this._state; }
    public get Children(): readonly StoryboardChild[] { return this._children; }

    /** Bind a timeline to (target, propertyName). All Adds must happen
     *  before Begin(); adding after Begin throws — capturing baseValue
     *  consistently requires a fixed child set at start. */
    public Add(target: Model, propertyName: string, timeline: AnimationTimeline): void
    {
        if (this._state !== StoryboardState.NotStarted)
        {
            throw new Error(
                'Storyboard.Add: cannot add children to a Storyboard that has already begun. ' +
                'Stop() it first or construct a new Storyboard.');
        }
        this._children.push({
            target,
            propertyName,
            propertyKey: resolveKey(target, undefined, propertyName),
            timeline,
            baseValue:   undefined,
            everWritten: false,
        });
    }

    /** Capture every target's current value, register with the manager,
     *  and start ticking. A repeat Begin() on a Running / Filling
     *  storyboard is a no-op (idempotent like ScrollViewer.ScrollTo*) —
     *  Stop() first to restart. */
    public Begin(): void
    {
        if (this._state === StoryboardState.Running
         || this._state === StoryboardState.Filling)
        {
            return;
        }
        const manager = AnimationManager.Instance;
        this._beginAt = manager.Clock.Now();
        // baseValue capture — read each target's PRE-animation value so
        // when the timeline's From is undefined we animate from where the
        // property currently is. Reads via get_property_value so any
        // active binding / inherited / default value falls through
        // correctly.
        for (const c of this._children)
        {
            c.baseValue   = c.target.get_property_value(c.propertyKey);
            c.everWritten = false;
        }
        this._state = StoryboardState.Running;
        manager.Register(this);
        // First evaluation at storyboard-elapsed = 0 so a non-zero
        // BeginTime stays correctly in the 'before' phase (no spurious
        // From write) and a zero-BeginTime + zero-Duration animation
        // commits its To value on the same frame.
        this.AdvanceTo(this._beginAt);
    }

    /** Cancel a running / filling / paused storyboard. Releases every
     *  animation slot we wrote to. A no-op when NotStarted / Stopped
     *  (idempotent). */
    public Stop(): void
    {
        if (this._state === StoryboardState.NotStarted
         || this._state === StoryboardState.Stopped)
        {
            return;
        }
        AnimationManager.Instance.Unregister(this);
        for (const c of this._children)
        {
            if (c.everWritten) c.target.ClearAnimatedValue(c.propertyKey);
        }
        this._state = StoryboardState.Stopped;
        this._pausedElapsed = undefined;
    }

    /** Suspend ticks WITHOUT releasing the animation slots. The current
     *  pinned values stay visible until Resume / Stop. A no-op unless
     *  currently Running (paused / completed storyboards have nothing
     *  to suspend). */
    public Pause(): void
    {
        if (this._state !== StoryboardState.Running) return;
        const now = AnimationManager.Instance.Clock.Now();
        // Capture elapsed at pause time; Resume re-anchors _beginAt so
        // (now - newBeginAt) reconstructs the captured elapsed.
        this._pausedElapsed = now - this._beginAt;
        AnimationManager.Instance.Unregister(this);
        this._state = StoryboardState.Paused;
    }

    /** Resume a Paused storyboard from where it suspended. The clock
     *  re-anchors so the storyboard's elapsed time picks up at the
     *  paused value. A no-op when not paused. */
    public Resume(): void
    {
        if (this._state !== StoryboardState.Paused) return;
        if (this._pausedElapsed === undefined) return;
        const now = AnimationManager.Instance.Clock.Now();
        // _beginAt = now - elapsed means the next AdvanceTo(now) sees
        // exactly the elapsed it had at Pause; subsequent ticks
        // continue forward from there.
        this._beginAt = now - this._pausedElapsed;
        this._pausedElapsed = undefined;
        this._state = StoryboardState.Running;
        AnimationManager.Instance.Register(this);
    }

    /** Notified when every child has rolled past its end (whether the
     *  storyboard transitioned to Filling or to Stopped). Fires exactly
     *  once per Begin(); a subsequent Begin() rearms the listener. */
    public AddCompletedListener(callback: () => void): void
    {
        this._completedListeners.add(callback);
    }

    public RemoveCompletedListener(callback: () => void): void
    {
        this._completedListeners.delete(callback);
    }

    /** Promise that resolves the next time this storyboard completes —
     *  the clock-source-agnostic counterpart to AddCompletedListener
     *  (§18.4). Under a browser RafClock it settles on the frame the
     *  storyboard ends; under the default ManualClock it settles when a
     *  test advances the clock past the storyboard's duration. Resolves
     *  immediately when the storyboard isn't currently Running (already
     *  Stopped / Filling, or never Begun), so an `await` never hangs on
     *  a finished animation. Lets callers chain teardown off the
     *  storyboard (`await sb.AwaitCompleted(); detach()`) instead of a
     *  wall-clock `setTimeout`. */
    public AwaitCompleted(): Promise<void>
    {
        if (this._state !== StoryboardState.Running) return Promise.resolve();
        return new Promise<void>(resolve =>
        {
            const listener = (): void =>
            {
                this.RemoveCompletedListener(listener);
                resolve();
            };
            this.AddCompletedListener(listener);
        });
    }

    /** Called by AnimationManager every clock tick. Public so a host
     *  can also drive a Storyboard in isolation from outside the manager
     *  (tests, headless renders). `now` is the clock's absolute time;
     *  storyboard-elapsed is computed from _beginAt. */
    public AdvanceTo(now: number): void
    {
        if (this._state !== StoryboardState.Running) return;
        const elapsed = now - this._beginAt;
        let allFinished = true;

        for (const c of this._children)
        {
            const phase = c.timeline.StateAt(elapsed);
            if (phase === 'before')
            {
                // Not yet in the active region. Don't touch the animation
                // slot — a too-early write would shadow the underlying
                // value visibly during the BeginTime delay.
                allFinished = false;
                continue;
            }
            if (phase === 'after')
            {
                // Past the end. FillBehavior.Stop releases NOW; HoldEnd
                // pins the To value via one final Evaluate (which returns
                // To at p = 1).
                if (c.timeline.FillBehavior === FillBehavior.Stop)
                {
                    if (c.everWritten)
                    {
                        c.target.ClearAnimatedValue(c.propertyKey);
                        c.everWritten = false;
                    }
                    continue;
                }
                const finalValue = c.timeline.Evaluate(elapsed, c.baseValue);
                c.target.SetAnimatedValue(c.propertyKey, finalValue);
                c.everWritten = true;
                continue;
            }
            // phase === 'running' — Evaluate against the captured base
            // and push to the animation slot.
            allFinished = false;
            const value = c.timeline.Evaluate(elapsed, c.baseValue);
            c.target.SetAnimatedValue(c.propertyKey, value);
            c.everWritten = true;
        }

        if (allFinished) this.transitionToEnd();
    }

    private transitionToEnd(): void
    {
        // ANY child with HoldEnd pins the storyboard in Filling state so
        // its slot keeps the To value. Otherwise the storyboard fully
        // Stops and every child's slot was already released in the
        // FillBehavior.Stop branch above.
        const anyHold = this._children.some(
            c => c.timeline.FillBehavior === FillBehavior.HoldEnd);

        AnimationManager.Instance.Unregister(this);
        this._state = anyHold ? StoryboardState.Filling : StoryboardState.Stopped;

        // Snapshot listeners so a callback that calls Stop() / removes
        // itself doesn't perturb iteration.
        const snapshot = Array.from(this._completedListeners);
        for (const l of snapshot) l();
    }
}
