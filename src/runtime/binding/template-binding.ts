import { Binding, BindingMode } from './binding.js';
import { MetaData } from '../metadata.js';
import { Model } from '../model.js';
import type { PropertyKey } from '../model.js';
import { resolveKey } from '../model-internals.js';
import type { PropertyChangeCallback } from './effective-value.js';
import type { Visual } from '../../visual-engine/visual.js';

// Internal Model that mirrors the templated parent's watched property.
// Same shape as DataContextWatcher / ResourceWatcher — a single Value
// slot that Binding's change-notification machinery rides on.
class TemplatedParentWatcher extends Model
{
    public static readonly ValueKey = Model.RegisterProperty<unknown>(
        TemplatedParentWatcher, 'Value', undefined, MetaData.None);

    public get Value(): unknown { return this.get_property_value(TemplatedParentWatcher.ValueKey); }
    public set Value(v: unknown) { this.set_property_value(TemplatedParentWatcher.ValueKey, v); }
}

// Binding that reads a single property off the templated parent of a
// ControlTemplate factory. Used to express the `$$Fill`-style
// markup-extension form: `_b.Fill = TemplateBinding(_templatedParent, 'Fill')`.
//
// Templated parent's property changes propagate to the binding via a
// property-changed listener installed at construction. Disposed when
// the binding is torn down (EVD does that automatically when a
// replacement binding lands or the property is cleared).
//
// v0 scope: single property name only. Dotted paths (`$$Content.Name`)
// are not supported — control templates rarely need them, and the
// dotted form is more naturally a chained Binding inside a DataTemplate.
class TemplateBindingImpl extends Binding
{
    private readonly watcher:         TemplatedParentWatcher;
    private readonly templatedParent: Visual;
    private readonly callback:        PropertyChangeCallback;
    // Resolved once at construction; both AddPropertyChangedListener
    // (the lifetime-of-binding subscription) and the dispose-time
    // RemovePropertyChangedListener use the same key.
    private readonly key:             PropertyKey<unknown>;

    constructor(templatedParent: Visual, property: string)
    {
        const watcher = new TemplatedParentWatcher();
        super(watcher, 'Value', BindingMode.OneWay);
        this.watcher         = watcher;
        this.templatedParent = templatedParent;
        this.key             = resolveKey(templatedParent, undefined, property);

        this.callback = () =>
        {
            this.watcher.Value = templatedParent.get_property_value(this.key);
        };
        templatedParent.AddPropertyChangedListener(this.key, this.callback);
        this.watcher.Value = templatedParent.get_property_value(this.key);
    }

    public override dispose(): void
    {
        super.dispose();
        this.templatedParent.RemovePropertyChangedListener(this.key, this.callback);
    }
}

// Public factory — matches the DynamicResource / DataContextBinding
// shape so the compiler emits all three uniformly.
//
// Usage from a ControlTemplate factory body:
//   const border = new Border();
//   border.set_property_value(Border.FillKey,
//       TemplateBinding(templatedParent, 'Fill'));
export function TemplateBinding(templatedParent: Visual, property: string): Binding
{
    return new TemplateBindingImpl(templatedParent, property);
}
