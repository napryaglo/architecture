import { MetaData, Model, Visual } from '../runtime/index.js';
import { Control } from './control.js';

// M3 Tooltip — short text overlay describing an interactive element.
//
// Two M3 variants:
//   * Plain — single-line opaque tooltip, 4dp top inset, no actions.
//   * Rich  — multi-line tooltip with optional title + action button.
//
// mural ships the Plain variant only for now. The Rich variant is a
// multi-row chrome the existing template DSL can layer on top by
// re-templating, but the spec interaction (delayed appear, focus
// retention) would need behaviour code that's not yet in scope.
//
// Tooltip is a standalone control — consumers position it on top of
// an anchor via an AdornerLayer or a Canvas. A future
// TooltipBehavior (attached to any Visual, watches Pointer hover with
// the M3 spec's 500ms delay, mounts the tooltip on the
// PresentationTarget's OverlayLayer) would close the gap; this
// commit ships the surface so other phases can land that wiring on
// top.
export class Tooltip extends Control
{
    public static readonly TextKey = Model.RegisterProperty<string>(
        Tooltip, 'Text', '', MetaData.Render);

    public get Text(): string { return this.get_property_value(Tooltip.TextKey); }
    public set Text(v: string) { this.set_property_value(Tooltip.TextKey, v); }

    static {
        Model.OverrideMetadata(
            Tooltip, Visual.DefaultStyleKeyKey,
            { default_value: Tooltip });
    }
}
