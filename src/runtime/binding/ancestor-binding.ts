import { Binding, BindingMode } from './binding.js';
import { MetaData } from '../metadata.js';
import { Model } from '../model.js';
import type { PropertyChangeCallback } from './effective-value.js';
import type { Visual } from '../visual.js';

// Internal watcher Model — same shape as DataContextWatcher /
// TemplatedParentWatcher. Holds the resolved ancestor-property value
// in a single `Value` slot the outer Binding reads from.
class AncestorWatcher extends Model
{
    public static readonly ValueKey = Model.RegisterProperty<unknown>(
        AncestorWatcher, 'Value', undefined, MetaData.None);

    public get Value(): unknown { return this.get_property_value(AncestorWatcher.ValueKey); }
    public set Value(v: unknown) { this.set_property_value(AncestorWatcher.ValueKey, v); }
}

// Binding that walks the start Visual's visualParent chain to find the
// `level`-th ancestor that is an instance of `ancestorType`, then
// subscribes to one of its properties.
//
// Reactivity scope: the path mutation on the resolved ancestor pushes
// through. Re-parenting the start Visual (or any intermediate ancestor)
// does NOT trigger an ancestor re-resolve — the resolution is captured
// at construction time. This matches the common WPF use case where
// FindAncestor is used inside a ControlTemplate body where the
// templated-element hierarchy is set once at materialization. Callers
// that need re-parenting reactivity should dispose and recreate the
// binding on the relevant Loaded edge.
class AncestorBindingImpl extends Binding
{
    private readonly watcher:  AncestorWatcher;
    private readonly ancestor: Visual | undefined;
    private readonly property: string;
    private readonly callback: PropertyChangeCallback | undefined;

    constructor(start: Visual, ancestorType: Function, property: string, level: number)
    {
        const watcher = new AncestorWatcher();
        super(watcher, 'Value', BindingMode.OneWay);
        this.watcher  = watcher;
        this.property = property;

        // Walk parents.
        let current: Visual | undefined = start.GetVisualParent();
        let remaining = level;
        let found: Visual | undefined;
        while (current !== undefined)
        {
            if (current instanceof ancestorType)
            {
                remaining--;
                if (remaining <= 0)
                {
                    found = current;
                    break;
                }
            }
            current = current.GetVisualParent();
        }
        this.ancestor = found;

        if (found === undefined)
        {
            // No matching ancestor — watcher stays at undefined. Consumer
            // can rely on the outer Binding's fallbackValue.
            this.callback = undefined;
            return;
        }

        // Subscribe to the property on the resolved ancestor and seed
        // the watcher with the current value.
        this.callback = () =>
        {
            this.watcher.Value = found._get_property_value_by_name(property);
        };
        found._add_property_changed_listener_by_name(property, this.callback);
        this.watcher.Value = found._get_property_value_by_name(property);
    }

    public override dispose(): void
    {
        super.dispose();
        if (this.ancestor !== undefined && this.callback !== undefined)
        {
            this.ancestor._remove_property_changed_listener_by_name(this.property, this.callback);
        }
    }
}

// Public factory — mirrors WPF's `{Binding RelativeSource={RelativeSource
// FindAncestor, AncestorType=…, AncestorLevel=N}, Path=Property}`.
//
//   AncestorBinding(start, ListBox, 'SelectedItem')        // nearest ListBox
//   AncestorBinding(start, ItemsControl, 'ItemsSource', 2) // 2nd-nearest
//
// `level` defaults to 1 (nearest matching ancestor). Returns a Binding
// whose resolved value tracks the chosen property on the found
// ancestor. When no matching ancestor exists, the binding resolves to
// `undefined` and stays that way — `fallbackValue` on the outer
// Binding can fill in.
export function AncestorBinding(
    start:        Visual,
    ancestorType: Function,
    property:     string,
    level:        number = 1,
): Binding
{
    return new AncestorBindingImpl(start, ancestorType, property, level);
}
