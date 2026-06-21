import { MetaData, Model, Element } from '../../runtime/index.js';
import { Control } from '../control.js';
import { Orientation } from '../../basic/panels/stack-panel.js';

// M3 Divider — 1dp rule that separates sibling content along either
// the horizontal or vertical axis.
//
// Promoted from the historical `Border[BorderThickness=(0,0,0,1),
// Background=@OutlineVariant]` pattern (called out in
// docs/m3-modernization-plan.md A.4) so consumers get a proper
// control + a named token surface for the inset / colour. Reading
// down from Control rather than Border because the Divider doesn't
// host slotted Content; it paints a flat rule and that's it.
//
// Orientation = Horizontal (default) draws a 1dp tall rule that
// stretches across the parent's width; Vertical draws a 1dp wide
// rule that stretches across the parent's height.
export class Divider extends Control
{
    public static readonly OrientationKey = Model.RegisterProperty<Orientation>(
        Divider, 'Orientation', Orientation.Horizontal,
        MetaData.Measure | MetaData.Render);

    public get Orientation(): Orientation { return this.get_property_value(Divider.OrientationKey); }
    public set Orientation(v: Orientation) { this.set_property_value(Divider.OrientationKey, v); }

    static {
        Model.OverrideMetadata(
            Divider, Element.DefaultStyleKeyKey,
            { default_value: Divider });
    }
}
