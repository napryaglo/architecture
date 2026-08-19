import { registerSchemeTransitionAnimator } from '../theme/theme.js';
import { registerImplicitTransitionBuilder } from '../animation/implicit-transition-engine.js';
import {
    AnimationTimeline,
    Easings,
    FillBehavior,
    interpolateColor,
    type AnimationTimelineProps,
} from '../animation/index.js';
import { Color } from '../primitives.js';
import { SolidColorBrush } from './brush.js';

// Animation of a Brush-typed DP (Border.Fill, Stroke.Brush, TextBlock.
// Foreground, …) that interpolates the brush's COLOUR while emitting a
// fresh SolidColorBrush each tick. The Brush slot is overwritten by
// reference, which is what Border's MetaData.Render handler observes —
// so the painted surface refreshes on every clock tick.
//
// Why a per-tick allocation? Mutating an existing brush's Color DP
// wouldn't notify the Border holding the reference (the Brush instance
// is identical, so the DP setter short-circuits the change pipeline).
// A whole-brush swap goes through the Fill DP's normal change
// machinery — that's the same pipeline a single Fill = brush write
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
     *  current Fill's Color (or Color.Transparent if the slot is
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

// Scheme-transition integration. Register a factory with the runtime so
// DynamicResource animates resolved-value changes for SolidColorBrush
// tokens whenever ThemeManager.SchemeTransition is set. Non-brush
// pairs (CornerRadius, number, mixed types) return undefined and snap.
//
// Module-load side effect — importing this file (directly or via the
// visual-engine barrel) installs the factory. Runtime tests that want
// their own animator override the factory after import via
// registerSchemeTransitionAnimator(...).
registerSchemeTransitionAnimator((oldValue, newValue, transition) =>
{
    if (!(oldValue instanceof SolidColorBrush)) return undefined;
    if (!(newValue instanceof SolidColorBrush)) return undefined;
    const tl = new SolidColorBrushAnimation({
        From:     oldValue.Color,
        To:       newValue.Color,
        Duration: transition.duration,
        Easing:   transition.easing ?? Easings.Linear,
    });
    return tl;
});

// Implicit-transition integration. Mirrors the SchemeTransition path
// above: the runtime can't import SolidColorBrush (would invert the
// runtime → visual-engine layering), so visual-engine pushes the brush-
// aware builder UP via registration. When a Brush-typed DP carries a
// PropertyTransition, the implicit-transition engine asks the
// registered builders to produce a timeline — this one matches
// SolidColorBrush → SolidColorBrush writes and emits a
// SolidColorBrushAnimation that interpolates the Color across the
// transition's Duration / Easing.
//
// Cross-type writes (SolidColorBrush ↔ LinearGradientBrush ↔
// ImageBrush) decline here — adding support for those would mean a
// separate builder that knows how to fade between the two, or a
// generic opacity-crossfade pattern. Punted until a concrete demo asks
// for it.
registerImplicitTransitionBuilder((oldValue, newValue, transition) =>
{
    if (!(oldValue instanceof SolidColorBrush)) return undefined;
    if (!(newValue instanceof SolidColorBrush)) return undefined;
    const tl = new SolidColorBrushAnimation({
        From:     oldValue.Color,
        To:       newValue.Color,
        Duration: transition.Duration,
        Easing:   transition.Easing,
    });
    tl.FillBehavior = FillBehavior.HoldEnd;
    return tl;
});
