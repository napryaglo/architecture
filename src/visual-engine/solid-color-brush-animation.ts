import {
    AnimationTimeline,
    Color,
    interpolateColor,
    type AnimationTimelineProps,
} from '../runtime/index.js';
import { SolidColorBrush } from './brush.js';

// Animation of a Brush-typed DP (Border.Background, BorderBrush, TextBlock.
// Foreground, …) that interpolates the brush's COLOUR while emitting a
// fresh SolidColorBrush each tick. The Brush slot is overwritten by
// reference, which is what Border's MetaData.Render handler observes —
// so the painted surface refreshes on every clock tick.
//
// Why a per-tick allocation? Mutating an existing brush's Color DP
// wouldn't notify the Border holding the reference (the Brush instance
// is identical, so the DP setter short-circuits the change pipeline).
// A whole-brush swap goes through the Background DP's normal change
// machinery — that's the same pipeline a single Background = brush write
// would use, just driven at 60 fps. The GC absorbs the per-frame
// allocations comfortably.
//
// The animation produces SolidColorBrush instances regardless of what
// brush was set on the DP previously (LinearGradient, ImageBrush, …);
// callers wanting to tween a gradient should write a separate animation
// that produces the matching gradient subclass.
//
// DPs targeted by this animation MUST accept SolidColorBrush as their
// value type (true of every Brush-typed slot in the controls library).
export interface SolidColorBrushAnimationProps extends AnimationTimelineProps
{
    From?: Color;
    To?:   Color;
}

export class SolidColorBrushAnimation extends AnimationTimeline
{
    /** Starting colour. When undefined, the animation captures the
     *  current Background's Color (or Color.Transparent if the slot is
     *  empty / not a SolidColorBrush). */
    public From: Color | undefined;

    /** Final colour the brush settles to at storyboard-elapsed =
     *  BeginTime + Duration. */
    public To:   Color = Color.Transparent;

    public constructor(props?: SolidColorBrushAnimationProps)
    {
        super();
        if (props !== undefined) Object.assign(this, props);
    }

    public override Evaluate(t: number, baseValue: unknown): SolidColorBrush
    {
        const from = this.From ?? extractColor(baseValue);
        if (this.Duration <= 0) return new SolidColorBrush(this.To);
        const p = this.progress(t);
        if (p === 0) return new SolidColorBrush(from);
        if (p === 1) return new SolidColorBrush(this.To);
        return new SolidColorBrush(interpolateColor(from, this.To, this.Easing(p)));
    }
}

// Pull a Color out of whatever sat in the target DP at Begin() time.
// SolidColorBrush directly exposes a Color DP; other brushes (gradients,
// images) have no scalar "current colour" — fall back to Transparent so
// the animation starts from a sensible neutral.
function extractColor(value: unknown): Color
{
    if (value instanceof SolidColorBrush) return value.Color;
    return Color.Transparent;
}
