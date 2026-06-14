import { Binding, BindingMode } from './binding.js';
import { MetaData } from '../metadata.js';
import { Model } from '../model.js';
import type { PropertyChangeCallback } from './effective-value.js';
import type { Visual } from '../visual.js';

// Internal Model that holds the converter's combined output. Same shape
// as TemplatedParentWatcher in template-binding.ts — a single Value slot
// the Binding change-notification machinery rides on.
class MultiTemplatedParentWatcher extends Model
{
    public static readonly ValueKey = Model.RegisterProperty<unknown>(
        MultiTemplatedParentWatcher, 'Value', undefined, MetaData.None);

    public get Value(): unknown { return this.get_property_value(MultiTemplatedParentWatcher.ValueKey); }
    public set Value(v: unknown) { this.set_property_value(MultiTemplatedParentWatcher.ValueKey, v); }
}

// Combines N properties on the templated parent through a converter
// function. WPF parity for `<MultiBinding>` inside a ControlTemplate
// (where each child Binding's RelativeSource is TemplatedParent). Each
// source property change re-runs the converter; the result is pushed
// through to the target DP via the Binding's standard one-way pipeline.
//
// v0 scope:
//   * One-way only (mirrors TemplateBinding's v0 scope). A MultiBinding
//     with a `convertBack` makes sense only for cases where the converter
//     is bijective — those are rare in template chrome.
//   * Single-property paths only (`'IsMouseOver'`, not `'Content.Name'`).
//     Same TemplateBinding limitation. Dotted paths in a converter input
//     are usually a sign that a regular Binding inside a DataTemplate
//     is the better fit.
//
// Usage from a ControlTemplate factory body:
//   const border = new Border();
//   border.set_property_value(Border.BorderBrushKey,
//       MultiTemplateBinding(
//           templatedParent,
//           ['IsMouseOver', 'IsPressed'],
//           (hover: boolean, pressed: boolean) =>
//               pressed ? PressBrush : hover ? HoverBrush : RestBrush,
//       ));
class MultiTemplateBindingImpl extends Binding
{
    private readonly watcher:         MultiTemplatedParentWatcher;
    private readonly templatedParent: Visual;
    private readonly properties:      readonly string[];
    private readonly combine:         (...values: unknown[]) => unknown;
    private readonly callback:        PropertyChangeCallback;

    constructor(
        templatedParent: Visual,
        properties:      readonly string[],
        converter:       (...values: unknown[]) => unknown,
    )
    {
        const watcher = new MultiTemplatedParentWatcher();
        super(watcher, 'Value', BindingMode.OneWay);
        this.watcher         = watcher;
        this.templatedParent = templatedParent;
        this.properties      = properties;
        this.combine         = converter;

        // Single shared callback for every watched property — the
        // converter re-reads all N values on each fire, so we don't
        // need per-property routing. Saves N closures per binding.
        this.callback = () => this.recompute();
        for (const p of properties)
        {
            templatedParent._add_property_changed_listener_by_name(p, this.callback);
        }
        // Initial value — same eager-fill pattern TemplateBinding uses
        // so consumers see the converted result before the first source
        // change.
        this.recompute();
    }

    private recompute(): void
    {
        const values = this.properties.map(p =>
            this.templatedParent._get_property_value_by_name(p));
        this.watcher.Value = this.combine(...values);
    }

    public override dispose(): void
    {
        super.dispose();
        for (const p of this.properties)
        {
            this.templatedParent._remove_property_changed_listener_by_name(p, this.callback);
        }
    }
}

// Public factory — mirrors the TemplateBinding / DynamicResource shape
// so the call sites are consistent across the three template-side
// bindings.
export function MultiTemplateBinding(
    templatedParent: Visual,
    properties:      readonly string[],
    converter:       (...values: unknown[]) => unknown,
): Binding
{
    return new MultiTemplateBindingImpl(templatedParent, properties, converter);
}
