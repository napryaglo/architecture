// HitTestVM — backs the "Hit test" demo. The only view-observable state
// is IsToggled: false paints the heart control orange, true flips it to
// white. The heart-hit behaviour (behaviors/heart-hit-behavior.mts) flips
// this DP on a MouseLeftButtonDown that survives the Border's
// HitTestGeometry — i.e. a click that lands INSIDE the heart outline. A
// DataTemplate `when ($IsToggled)` trigger swaps the Fill in the
// view. No brushes / geometry live here — those are view concerns (MVVM:
// no Color / Brush / Geometry in a VM).
import { MetaData, MuralBase } from '@pragmatic-lab/mural/runtime';
export class HitTestVM extends MuralBase {
    static IsToggledKey = MuralBase.RegisterProperty(HitTestVM, 'IsToggled', false, MetaData.None);
    get IsToggled() { return this.get_property_value(HitTestVM.IsToggledKey); }
    set IsToggled(v) { this.set_property_value(HitTestVM.IsToggledKey, v); }
}
