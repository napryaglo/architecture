import { Color, Thickness } from '../primitives.js';
import { Easings, type EasingFunction } from './easing.js';
import {
    interpolateColor,
    interpolateNumber,
    interpolateThickness,
} from './interpolation.js';
import { AnimationTimeline, type AnimationTimelineProps } from './timeline.js';

// Keyframe animations — a property follows a sequence of (KeyTime, Value)
// waypoints rather than a single From → To pair. Each keyframe's
// `Interpolate(prev, t)` defines how the segment ending at THIS keyframe
// reads from the previous keyframe's value forward.
//
// Two subclasses ship per value type:
//   Linear*KeyFrame   — interpolates linearly from `prev` toward Value.
//                       Default segment shape; matches CSS keyframe
//                       interpolation when no easing is specified.
//   Discrete*KeyFrame — snaps to Value the moment the segment starts.
//                       Pinned-value behaviour — produces staircase /
//                       step animations.
//
// The *AnimationUsingKeyFrames class drives evaluation: at storyboard-
// elapsed `t` it finds the segment containing `t` and asks that
// keyframe to interpolate from the previous keyframe's value.
//
// KeyTime is always an absolute millisecond offset relative to the
// timeline's BeginTime — not a fraction of Duration (WPF's percentage
// KeyTime is deferred). Duration auto-derives from the max KeyTime when
// the consumer leaves it undefined; passing a Duration explicitly clips
// later keyframes to the truncated region.

// ── Double keyframes ───────────────────────────────────────────────────

export abstract class DoubleKeyFrame
{
    public KeyTime: number = 0;
    public Value:   number = 0;

    public constructor(props?: { KeyTime?: number; Value?: number })
    {
        if (props !== undefined) Object.assign(this, props);
    }

    /** Compute the segment value at segment-local progress `t` ∈ [0, 1].
     *  `prev` is the previous keyframe's Value (or the timeline's
     *  baseValue for the first segment). */
    public abstract Interpolate(prev: number, t: number): number;
}

// Linear ramp from `prev` to `Value` across the segment.
export class LinearDoubleKeyFrame extends DoubleKeyFrame
{
    public override Interpolate(prev: number, t: number): number
    {
        return interpolateNumber(prev, this.Value, t);
    }
}

// Step function — Value is pinned at this keyframe's Value for the
// entire segment leading up to KeyTime, regardless of segment progress.
export class DiscreteDoubleKeyFrame extends DoubleKeyFrame
{
    public override Interpolate(_prev: number, _t: number): number
    {
        return this.Value;
    }
}

// Eased ramp from `prev` to `Value` — same shape as LinearDoubleKeyFrame
// but with a per-segment easing curve. Pair with cubicBezier(x1, y1, x2, y2)
// from easing.ts to get WPF's SplineKeyFrame behaviour (a Bezier
// easing curve defined by two control points). Note the easing applies
// to the SEGMENT (this keyframe's `prev` → `Value`), not the whole
// animation — successive easing keyframes layer different curves on
// each leg of the journey.
export class EasingDoubleKeyFrame extends DoubleKeyFrame
{
    public Easing: EasingFunction = Easings.Linear;

    public constructor(props?: { KeyTime?: number; Value?: number; Easing?: EasingFunction })
    {
        super(props);
        if (props?.Easing !== undefined) this.Easing = props.Easing;
    }

    public override Interpolate(prev: number, t: number): number
    {
        return interpolateNumber(prev, this.Value, this.Easing(t));
    }
}

// ── Color keyframes ────────────────────────────────────────────────────

export abstract class ColorKeyFrame
{
    public KeyTime: number = 0;
    public Value:   Color  = Color.Black;

    public constructor(props?: { KeyTime?: number; Value?: Color })
    {
        if (props !== undefined) Object.assign(this, props);
    }

    public abstract Interpolate(prev: Color, t: number): Color;
}

export class LinearColorKeyFrame extends ColorKeyFrame
{
    public override Interpolate(prev: Color, t: number): Color
    {
        return interpolateColor(prev, this.Value, t);
    }
}

export class DiscreteColorKeyFrame extends ColorKeyFrame
{
    public override Interpolate(_prev: Color, _t: number): Color
    {
        return this.Value;
    }
}

export class EasingColorKeyFrame extends ColorKeyFrame
{
    public Easing: EasingFunction = Easings.Linear;

    public constructor(props?: { KeyTime?: number; Value?: Color; Easing?: EasingFunction })
    {
        super(props);
        if (props?.Easing !== undefined) this.Easing = props.Easing;
    }

    public override Interpolate(prev: Color, t: number): Color
    {
        return interpolateColor(prev, this.Value, this.Easing(t));
    }
}

// ── Thickness keyframes ────────────────────────────────────────────────

export abstract class ThicknessKeyFrame
{
    public KeyTime: number    = 0;
    public Value:   Thickness = new Thickness(0);

    public constructor(props?: { KeyTime?: number; Value?: Thickness })
    {
        if (props !== undefined) Object.assign(this, props);
    }

    public abstract Interpolate(prev: Thickness, t: number): Thickness;
}

export class LinearThicknessKeyFrame extends ThicknessKeyFrame
{
    public override Interpolate(prev: Thickness, t: number): Thickness
    {
        return interpolateThickness(prev, this.Value, t);
    }
}

export class DiscreteThicknessKeyFrame extends ThicknessKeyFrame
{
    public override Interpolate(_prev: Thickness, _t: number): Thickness
    {
        return this.Value;
    }
}

export class EasingThicknessKeyFrame extends ThicknessKeyFrame
{
    public Easing: EasingFunction = Easings.Linear;

    public constructor(props?: { KeyTime?: number; Value?: Thickness; Easing?: EasingFunction })
    {
        super(props);
        if (props?.Easing !== undefined) this.Easing = props.Easing;
    }

    public override Interpolate(prev: Thickness, t: number): Thickness
    {
        return interpolateThickness(prev, this.Value, this.Easing(t));
    }
}

// ── Animations using keyframes ─────────────────────────────────────────

// Generic constructor helper. Each concrete *UsingKeyFrames subclass
// follows the same shape: extract KeyFrames + maybe-undefined Duration
// from the props bag, apply the rest via Object.assign, then auto-derive
// Duration from max KeyTime when the consumer didn't pass one.
//
// Without the dance, the Partial-style Object.assign would copy an
// explicit `Duration: undefined` over the base default and stick the
// timeline at a NaN/0 length.
function applyKeyFrameProps<TFrame, TInstance extends { Duration: number; KeyFrames: TFrame[] }>(
    target: TInstance,
    props: (AnimationTimelineProps & { KeyFrames?: TFrame[] }) | undefined,
    getKeyTime: (f: TFrame) => number,
): void
{
    if (props === undefined) return;
    const { Duration: explicitDuration, ...rest } = props;
    Object.assign(target, rest);
    if (explicitDuration !== undefined)
    {
        target.Duration = explicitDuration;
    }
    else if (target.KeyFrames.length > 0)
    {
        target.Duration = Math.max(0, ...target.KeyFrames.map(getKeyTime));
    }
}

export interface DoubleAnimationUsingKeyFramesProps extends AnimationTimelineProps
{
    KeyFrames?: DoubleKeyFrame[];
}

export class DoubleAnimationUsingKeyFrames extends AnimationTimeline
{
    public KeyFrames: DoubleKeyFrame[] = [];

    public constructor(props?: DoubleAnimationUsingKeyFramesProps)
    {
        super();
        applyKeyFrameProps(this, props, k => k.KeyTime);
    }

    public override Evaluate(t: number, baseValue: unknown): number
    {
        const frames = this.KeyFrames;
        if (frames.length === 0) return baseValue as number;
        if (this.Duration <= 0)  return frames[frames.length - 1]!.Value;

        // `progress * Duration` gives the within-iteration time in
        // millis. With AutoReverse the same forward / reverse logic
        // applies — progress oscillates 0 → 1 → 0 and so does the
        // keyframe walk, traversing segments in both directions.
        const iterLocalT = this.progress(t) * this.Duration;
        return evaluateDoubleKeyframes(frames, iterLocalT, baseValue as number);
    }
}

export interface ColorAnimationUsingKeyFramesProps extends AnimationTimelineProps
{
    KeyFrames?: ColorKeyFrame[];
}

export class ColorAnimationUsingKeyFrames extends AnimationTimeline
{
    public KeyFrames: ColorKeyFrame[] = [];

    public constructor(props?: ColorAnimationUsingKeyFramesProps)
    {
        super();
        applyKeyFrameProps(this, props, k => k.KeyTime);
    }

    public override Evaluate(t: number, baseValue: unknown): Color
    {
        const frames = this.KeyFrames;
        if (frames.length === 0) return baseValue as Color;
        if (this.Duration <= 0)  return frames[frames.length - 1]!.Value;
        const iterLocalT = this.progress(t) * this.Duration;
        return evaluateColorKeyframes(frames, iterLocalT, baseValue as Color);
    }
}

export interface ThicknessAnimationUsingKeyFramesProps extends AnimationTimelineProps
{
    KeyFrames?: ThicknessKeyFrame[];
}

export class ThicknessAnimationUsingKeyFrames extends AnimationTimeline
{
    public KeyFrames: ThicknessKeyFrame[] = [];

    public constructor(props?: ThicknessAnimationUsingKeyFramesProps)
    {
        super();
        applyKeyFrameProps(this, props, k => k.KeyTime);
    }

    public override Evaluate(t: number, baseValue: unknown): Thickness
    {
        const frames = this.KeyFrames;
        if (frames.length === 0) return baseValue as Thickness;
        if (this.Duration <= 0)  return frames[frames.length - 1]!.Value;
        const iterLocalT = this.progress(t) * this.Duration;
        return evaluateThicknessKeyframes(frames, iterLocalT, baseValue as Thickness);
    }
}

// ── Segment-walk helpers ───────────────────────────────────────────────
//
// Find the segment containing `iterLocalT` and return the previous
// keyframe's value interpolated forward through the current segment's
// shape. The walk is linear in the number of keyframes — fine for the
// 1–20 keyframes a typical authoring layer would emit. A binary
// search would land in the same code shape if N ever grows past O(100).
//
// "Segment ending at keyframe i" spans the interval (KeyTime[i-1], KeyTime[i]].
// At a boundary `iterLocalT == KeyTime[i]` the walk stops on segment i
// with segT = 1, so the last reading of the segment is the keyframe's
// Value — Discrete keyframes snap there exactly.

function evaluateDoubleKeyframes(
    frames:    readonly DoubleKeyFrame[],
    localT:    number,
    baseValue: number,
): number
{
    let prevTime  = 0;
    let prevValue = baseValue;
    for (const f of frames)
    {
        if (localT <= f.KeyTime)
        {
            const segLen = f.KeyTime - prevTime;
            const segT   = segLen <= 0 ? 1 : clamp01((localT - prevTime) / segLen);
            return f.Interpolate(prevValue, segT);
        }
        prevTime  = f.KeyTime;
        prevValue = f.Value;
    }
    return prevValue;
}

function evaluateColorKeyframes(
    frames:    readonly ColorKeyFrame[],
    localT:    number,
    baseValue: Color,
): Color
{
    let prevTime  = 0;
    let prevValue = baseValue;
    for (const f of frames)
    {
        if (localT <= f.KeyTime)
        {
            const segLen = f.KeyTime - prevTime;
            const segT   = segLen <= 0 ? 1 : clamp01((localT - prevTime) / segLen);
            return f.Interpolate(prevValue, segT);
        }
        prevTime  = f.KeyTime;
        prevValue = f.Value;
    }
    return prevValue;
}

function evaluateThicknessKeyframes(
    frames:    readonly ThicknessKeyFrame[],
    localT:    number,
    baseValue: Thickness,
): Thickness
{
    let prevTime  = 0;
    let prevValue = baseValue;
    for (const f of frames)
    {
        if (localT <= f.KeyTime)
        {
            const segLen = f.KeyTime - prevTime;
            const segT   = segLen <= 0 ? 1 : clamp01((localT - prevTime) / segLen);
            return f.Interpolate(prevValue, segT);
        }
        prevTime  = f.KeyTime;
        prevValue = f.Value;
    }
    return prevValue;
}

function clamp01(t: number): number
{
    if (t < 0) return 0;
    if (t > 1) return 1;
    return t;
}
