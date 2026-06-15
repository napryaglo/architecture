import { Model } from '../../runtime/model.js';
import { MetaData } from '../../runtime/metadata.js';
import { Easings, type EasingFunction } from './easing.js';

// A declarative spec saying "when DP `Property` on the owning Visual
// changes from X to Y, smoothly animate the visible value from X → Y
// over `Duration` ms with `Easing`, instead of snapping."
//
// Authoring:
//
//     TopAppBar [...] {
//         Transitions {
//             PropertyTransition [Property=Height, Duration=350,
//                                 Easing=Easings.EmphasizedStandard]
//         }
//     }
//
// Or via Style:
//
//     Style [TargetType=TopAppBar] {
//         Transitions {
//             PropertyTransition [Property=Height, Duration=350]
//         }
//     }
//
// Each PropertyTransition is matched per (Visual, property name). On
// each DP write, the implicit-transition engine looks up the matching
// PropertyTransition, cancels any in-flight animation for that DP, and
// starts a fresh DoubleAnimation / ColorAnimation / ThicknessAnimation
// from `oldValue` to `newValue`. CSS-`transition`-style semantics.
//
// The matching is structural — when the Property string matches the
// descriptor's name on the changing visual, the transition fires.
// PropertyTransition itself doesn't carry any runtime state; it's just
// a (DP name, duration, easing) tuple.
//
// Defaults:
//   - Duration = 300ms (matches M3's default "standard" motion).
//   - Easing   = Easings.Standard (M3 standard curve).
//
// Property is required — a PropertyTransition without a Property name
// is inert (no DP will ever match).
export class PropertyTransition extends Model
{
    public static readonly PropertyKey = Model.RegisterProperty<string>(
        PropertyTransition, 'Property', '', MetaData.None);

    public static readonly DurationKey = Model.RegisterProperty<number>(
        PropertyTransition, 'Duration', 300, MetaData.None);

    public static readonly EasingKey = Model.RegisterProperty<EasingFunction>(
        PropertyTransition, 'Easing', Easings.Standard, MetaData.None);

    public get Property(): string  { return this.get_property_value(PropertyTransition.PropertyKey); }
    public set Property(v: string) { this.set_property_value(PropertyTransition.PropertyKey, v); }

    public get Duration(): number  { return this.get_property_value(PropertyTransition.DurationKey); }
    public set Duration(v: number) { this.set_property_value(PropertyTransition.DurationKey, v); }

    public get Easing(): EasingFunction { return this.get_property_value(PropertyTransition.EasingKey); }
    public set Easing(v: EasingFunction) { this.set_property_value(PropertyTransition.EasingKey, v); }
}
