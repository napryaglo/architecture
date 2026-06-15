import { addSchemeTransitionAnimator } from '../theme/theme.js';
import {
    AnimationTimeline,
    DoubleAnimation,
    Easings,
    interpolateCornerRadius,
    interpolateThickness,
    ThicknessAnimation,
} from '../animation/index.js';
import { Thickness } from '../primitives.js';
import { CornerRadius } from '../corner-radius.js';

// Non-Brush SchemeTransition animators (§ 17.3). Each factory matches a
// specific value-type pair and produces a per-type timeline. Registered
// via `addSchemeTransitionAnimator` so they coexist with the primary
// `SolidColorBrush` animator without competing for the single primary
// slot.
//
// Each factory returns `undefined` for mismatched value pairs — the
// composite dispatcher in `getSchemeTransitionAnimator` then tries the
// next factory in registration order. Tokens whose value types have no
// registered factory still snap on swap (the DynamicResource layer
// short-circuits to `watcher.Value = newValue` when every factory
// declines).

// number → number. Animates raw scalars. Covers Spacing0..Spacing8,
// elevation depths, motion durations (animated as their numeric value),
// and any other plain-number token in a theme's catalog.
addSchemeTransitionAnimator((oldValue, newValue, transition): AnimationTimeline | undefined =>
{
    if (typeof oldValue !== 'number') return undefined;
    if (typeof newValue !== 'number') return undefined;
    return new DoubleAnimation({
        From:     oldValue,
        To:       newValue,
        Duration: transition.duration,
        Easing:   transition.easing ?? Easings.Linear,
    });
});

// Thickness → Thickness. Animates per-side padding / margin / border
// thickness tokens. Mural's animation surface already ships
// `ThicknessAnimation` + `interpolateThickness`; this factory just
// wraps them.
addSchemeTransitionAnimator((oldValue, newValue, transition): AnimationTimeline | undefined =>
{
    if (!(oldValue instanceof Thickness)) return undefined;
    if (!(newValue instanceof Thickness)) return undefined;
    void interpolateThickness;     // imported to make the symbol's purpose explicit
    return new ThicknessAnimation({
        From:     oldValue,
        To:       newValue,
        Duration: transition.duration,
        Easing:   transition.easing ?? Easings.Linear,
    });
});

// CornerRadius → CornerRadius. Tweens shape tokens (@ShapeExtraSmall,
// @ShapeSmall, @ShapeMedium, @ShapeFull) when the scheme swap changes
// per-corner radii. Per-side independent interpolation via
// `interpolateCornerRadius` lets asymmetric corners (top-left only,
// SplitButton style) tween cleanly.
class CornerRadiusAnimation extends AnimationTimeline
{
    public From: CornerRadius | undefined;
    public To:   CornerRadius;

    public constructor(props: {
        From?:     CornerRadius;
        To:        CornerRadius;
        Duration:  number;
        Easing?:   typeof Easings.Linear;
    })
    {
        super();
        this.From = props.From;
        this.To   = props.To;
        this.Duration = props.Duration;
        if (props.Easing !== undefined) this.Easing = props.Easing;
    }

    public override Evaluate(t: number, baseValue: unknown): CornerRadius
    {
        const from = this.From ?? (baseValue instanceof CornerRadius
            ? baseValue
            : CornerRadius.Zero);
        if (this.Duration <= 0) return this.To;
        const p = this.progress(t);
        if (p === 0) return from;
        if (p === 1) return this.To;
        return interpolateCornerRadius(from, this.To, this.Easing(p));
    }
}

addSchemeTransitionAnimator((oldValue, newValue, transition): AnimationTimeline | undefined =>
{
    if (!(oldValue instanceof CornerRadius)) return undefined;
    if (!(newValue instanceof CornerRadius)) return undefined;
    return new CornerRadiusAnimation({
        From:     oldValue,
        To:       newValue,
        Duration: transition.duration,
        Easing:   transition.easing ?? Easings.Linear,
    });
});
