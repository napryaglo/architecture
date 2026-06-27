import { Color, Thickness } from '../primitives.js';
import { Easings, type EasingFunction } from './easing.js';
import {
    interpolateColor,
    interpolateNumber,
    interpolateThickness,
} from './interpolation.js';

// What a Timeline does once it has rolled past `BeginTime + Duration`.
//   HoldEnd — keep the To value pinned on the animated slot. Underlying
//             local / binding / style values stay shadowed until the
//             Storyboard is explicitly Stopped.
//   Stop    — release the animation slot immediately on completion. The
//             underlying value re-surfaces.
export enum FillBehavior
{
    HoldEnd = 'HoldEnd',
    Stop    = 'Stop',
}

// Where a timeline sits relative to storyboard-elapsed time `t`. Drives
// the Storyboard's per-tick "evaluate / hold / release" routing.
export enum TimelinePhase
{
    Before  = 'before',
    Running = 'running',
    After   = 'after',
}

// Shared shape of all timeline constructor props. Subclasses extend
// this with From / To. Using a Partial-style options bag lets authoring
// stay terse:  new DoubleAnimation({ From: 0, To: 1, Duration: 500 }).
export interface AnimationTimelineProps
{
    Duration?:       number;
    BeginTime?:      number;
    FillBehavior?:   FillBehavior;
    Easing?:         EasingFunction;
    RepeatBehavior?: number;
    AutoReverse?:    boolean;
}

// Abstract base. Holds the four timing knobs every animation respects
// and the StateAt helper that classifies the timeline's progress in
// storyboard-elapsed time.
//
// Subclasses provide From / To (per-type) and override Evaluate to
// produce the typed interpolated value.
//
// Naming follows WPF's *Animation class hierarchy — DoubleAnimation,
// ColorAnimation, ThicknessAnimation. New types can subclass directly:
// the only contract is implementing Evaluate(t, baseValue) and exposing
// the From / To pair.
export abstract class AnimationTimeline
{
    /** Length of the active portion in milliseconds. Default 1 s — long
     *  enough for the easing curve to be visible, short enough that an
     *  unconfigured animation doesn't feel broken. */
    public Duration:     number         = 1000;

    /** Delay relative to the owning Storyboard's Begin time. The timeline
     *  reports phase TimelinePhase.Before until storyboard-elapsed ≥ BeginTime. */
    public BeginTime:    number         = 0;

    /** What happens at storyboard-elapsed ≥ BeginTime + Duration. See
     *  FillBehavior. Default HoldEnd matches WPF. */
    public FillBehavior: FillBehavior   = FillBehavior.HoldEnd;

    /** Maps normalised progress t ∈ [0, 1] to eased-progress. Default
     *  Linear. Easings.{QuadIn, CubicOut, ...} cover the standard curves;
     *  custom curves are plain functions. */
    public Easing:       EasingFunction = Easings.Linear;

    /** Number of iterations. 1 = play once (default), Infinity = loop
     *  forever (the storyboard never reaches the TimelinePhase.After phase and
     *  never fires Completed). Fractional values are allowed (1.5 plays
     *  the back half of a second iteration); the final progress is
     *  computed against whatever phase of the partial iteration the
     *  active window ends in.
     *
     *  WPF's RepeatBehavior also supports duration-based looping; we
     *  trade that for the simpler count-only form. Duration-based
     *  repeat is `RepeatBehavior = wantedTotalMs / Duration`. */
    public RepeatBehavior: number       = 1;

    /** When true, each iteration goes Forward then Reverse — so one
     *  iteration takes `Duration * 2` and ends back at From. The
     *  storyboard's total Active window is `Duration * 2 * RepeatBehavior`
     *  in that case. Matches WPF AutoReverse semantics. */
    public AutoReverse:    boolean      = false;

    public StateAt(t: number): TimelinePhase
    {
        if (t < this.BeginTime) return TimelinePhase.Before;
        const iterDuration = this.AutoReverse ? this.Duration * 2 : this.Duration;
        const totalActive  = iterDuration * this.RepeatBehavior;
        // RepeatBehavior=Infinity → totalActive=Infinity, never TimelinePhase.After.
        if (!Number.isFinite(totalActive)) return TimelinePhase.Running;
        if (t >= this.BeginTime + totalActive) return TimelinePhase.After;
        return TimelinePhase.Running;
    }

    /** Normalised progress at storyboard-elapsed `t`. Returned value is
     *  in [0, 1]; subclasses pass it straight into Easing without
     *  re-clamping.
     *
     *  With AutoReverse, progress travels 0 → 1 over the first half of
     *  each iteration and 1 → 0 over the second half. After the last
     *  iteration completes (when RepeatBehavior < Infinity), the value
     *  freezes at whichever endpoint the final iteration was heading
     *  toward — so an integer-RepeatBehavior animation with AutoReverse
     *  ends at progress=0 (back at From), while one without AutoReverse
     *  ends at progress=1 (at To).
     *
     *  Returns NaN when Duration is 0 — subclasses snap to To in that
     *  case rather than dividing by zero. */
    protected progress(t: number): number
    {
        if (this.Duration <= 0) return Number.NaN;
        const local = t - this.BeginTime;
        if (local <= 0) return 0;

        const iterDuration = this.AutoReverse ? this.Duration * 2 : this.Duration;
        const totalActive  = iterDuration * this.RepeatBehavior;

        // Past the end (only reachable when RepeatBehavior is finite —
        // Infinity branch keeps progress oscillating forever). Freeze
        // at the endpoint of the final iteration.
        if (Number.isFinite(totalActive) && local >= totalActive)
        {
            // Position at the END of the active window. When totalActive
            // is a clean integer multiple of iterDuration (RepeatBehavior
            // is a whole number), modulo gives 0 — but conceptually
            // we're at the END of iteration (completedIters - 1), not
            // the start of iteration completedIters. Map to the
            // appropriate endpoint:
            //   * no AutoReverse → 1 (last iteration ended at To)
            //   * AutoReverse    → 0 (forward + reverse = back at From)
            // For fractional RepeatBehavior the partial-iteration math
            // (normaliseIterLocal) gives the right answer directly.
            const completedIters  = Math.floor(totalActive / iterDuration);
            const finalIterLocal  = totalActive - completedIters * iterDuration;
            if (finalIterLocal === 0 && completedIters > 0)
            {
                return this.AutoReverse ? 0 : 1;
            }
            return this.normaliseIterLocal(finalIterLocal);
        }

        const iterLocal = local % iterDuration;
        return this.normaliseIterLocal(iterLocal);
    }

    // Map a within-iteration offset to a 0..1 progress, honouring
    // AutoReverse. Forward half goes 0 → 1; reverse half goes 1 → 0.
    private normaliseIterLocal(iterLocal: number): number
    {
        if (this.AutoReverse)
        {
            if (iterLocal <= this.Duration) return iterLocal / this.Duration;
            return 1 - (iterLocal - this.Duration) / this.Duration;
        }
        return iterLocal / this.Duration;
    }

    /** Compute the timeline's value at storyboard-elapsed `t`.
     *  `baseValue` is the property's value captured at Storyboard.Begin
     *  — used when `From` is undefined so consumers can write
     *  "animate from the current value to X". */
    public abstract Evaluate(t: number, baseValue: unknown): unknown;
}

// ── Per-type animations ────────────────────────────────────────────────

export interface DoubleAnimationProps extends AnimationTimelineProps
{
    From?: number;
    To?:   number;
}

// Animation of a numeric DP — Opacity / Width / Height / X / Y /
// ScrollOffset / FontSize and any DP whose registered type is `number`.
export class DoubleAnimation extends AnimationTimeline
{
    /** Starting value. When undefined, the storyboard captures the
     *  property's value at Begin() and uses that as From. */
    public From: number | undefined;

    /** Target value at storyboard-elapsed = BeginTime + Duration. */
    public To:   number = 0;

    public constructor(props?: DoubleAnimationProps)
    {
        super();
        if (props !== undefined) Object.assign(this, props);
    }

    public override Evaluate(t: number, baseValue: unknown): number
    {
        const from = this.From ?? (baseValue as number);
        // Zero-duration animation: snap to To immediately. The
        // alternative — leaving From in place forever — would silently
        // skip the user's intended end state.
        if (this.Duration <= 0) return this.To;
        const p = this.progress(t);
        if (p === 0) return from;
        if (p === 1) return this.To;
        return interpolateNumber(from, this.To, this.Easing(p));
    }
}

export interface ColorAnimationProps extends AnimationTimelineProps
{
    From?: Color;
    To?:   Color;
}

// Animation of a Color DP — typically a brush's colour channel via a
// custom forwarding setter, since SolidColorBrush itself isn't a DP.
// (A future ColorBrushAnimation could land for the brush case.)
export class ColorAnimation extends AnimationTimeline
{
    public From: Color | undefined;
    public To:   Color = Color.Black;

    public constructor(props?: ColorAnimationProps)
    {
        super();
        if (props !== undefined) Object.assign(this, props);
    }

    public override Evaluate(t: number, baseValue: unknown): Color
    {
        const from = this.From ?? (baseValue as Color);
        if (this.Duration <= 0) return this.To;
        const p = this.progress(t);
        if (p === 0) return from;
        if (p === 1) return this.To;
        return interpolateColor(from, this.To, this.Easing(p));
    }
}

export interface ThicknessAnimationProps extends AnimationTimelineProps
{
    From?: Thickness;
    To?:   Thickness;
}

// Animation of a Thickness DP — Padding / Margin / BorderThickness.
// Each edge interpolates independently so a (10, 0, 10, 0) → (0, 10, 0, 10)
// animation rotates the inset around the rect predictably.
export class ThicknessAnimation extends AnimationTimeline
{
    public From: Thickness | undefined;
    public To:   Thickness = new Thickness(0);

    public constructor(props?: ThicknessAnimationProps)
    {
        super();
        if (props !== undefined) Object.assign(this, props);
    }

    public override Evaluate(t: number, baseValue: unknown): Thickness
    {
        const from = this.From ?? (baseValue as Thickness);
        if (this.Duration <= 0) return this.To;
        const p = this.progress(t);
        if (p === 0) return from;
        if (p === 1) return this.To;
        return interpolateThickness(from, this.To, this.Easing(p));
    }
}
