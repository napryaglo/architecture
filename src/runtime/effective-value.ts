import { Binding, BindingMode } from './binding.js';
import type { Model } from './model.js';
import type { PropertyDescriptor } from './property-descriptor.js';

// Invoked after a property's effective value changes, with the model
// whose property changed and the old/new effective values. Users get the
// property *name* (simple, not composite) for ergonomic context.
export type PropertyChangeCallback = (
    model: Model,
    property: string,
    old_value: any,
    new_value: any,
) => void;

// Internal callback used by Model to route invalidation / inheritance.
// Carries the PropertyDescriptor directly so Model.OnPropertyChanged
// doesn't need to re-look it up — important for cross-class properties
// where the descriptor doesn't live on the target's class hierarchy.
export type InternalPropertyChangeCallback = (
    model: Model,
    descriptor: PropertyDescriptor,
    old_value: any,
    new_value: any,
) => void;

// Where the effective value came from. Mirrors WPF's BaseValueSource.
// Read via Model.GetValueSource(property).
export enum PropertyValueSource
{
    AnimatedValue,
    LocalValue,
    Binding,
    CoercedValue,
    InheritedValue,
    Default
}

// Per-instance state for one registered property. Holds the four value
// slots (animated / binding / local / coerced), the current source, and
// the per-instance change listeners. Created lazily by Model on first set
// or first listener attach.
export class EffectiveValueDescriptor
{
    private local_value: any;
    private binding_value: Binding | undefined;
    private animated_value: any;
    private coerced_value: any;
    private inherited_value: any;

    private property_descriptor: PropertyDescriptor;
    private changeListeners: Array<PropertyChangeCallback> = [];
    // Reserved for the owning Model to route every effective-value change
    // through its virtual OnPropertyChanged hook. Stored separately from
    // changeListeners so user-facing listener counts stay clean. Carries
    // the descriptor (not just a name) so cross-class property changes
    // can be dispatched without re-lookup.
    private internal_callback: InternalPropertyChangeCallback | undefined;

    private owner: Model;
    private source: PropertyValueSource = PropertyValueSource.Default;

    constructor(propertyDescriptor: PropertyDescriptor, owner: Model)
    {
        this.property_descriptor = propertyDescriptor;
        this.owner = owner;
    }

    OnPropertyChange(old_value: any, new_value: any): void
    {
        // Internal callback first (matches WPF: metadata callbacks run
        // before user PropertyChanged subscribers), then user listeners.
        // The internal callback gets the descriptor directly so cross-class
        // properties can be routed without re-lookup; user listeners get
        // the simple property name for ergonomic context.
        this.internal_callback?.(this.owner, this.property_descriptor, old_value, new_value);
        this.changeListeners.forEach(
            listener => { listener(this.owner, this.property_descriptor.Name, old_value, new_value); },
        );
    }

    SetInternalCallback(cb: InternalPropertyChangeCallback): void
    {
        this.internal_callback = cb;
    }

    AddChangeListener(callback: PropertyChangeCallback): void
    {
        this.changeListeners.push(callback);
    }

    RemoveChangeListener(callback: PropertyChangeCallback): void
    {
        const index = this.changeListeners.indexOf(callback);
        if (index >= 0)
        {
            this.changeListeners.splice(index, 1);
        }
    }

    get Source(): PropertyValueSource
    {
        return this.source;
    }

    // Resets every base-value slot, disposes any active binding, drops the
    // source back to Default, and fires a change notification if the
    // effective value differed. Listeners on this EVD are preserved.
    // Note: doesn't touch the inherited cache — that's owned by the
    // inheritance machinery on Model and refreshed via SetInheritedValue.
    ClearValue(): void
    {
        const old_effective_value = this.value;

        if (this.binding_value !== undefined)
        {
            this.binding_value.dispose();
            this.binding_value = undefined;
        }
        this.local_value = undefined;
        this.animated_value = undefined;
        this.coerced_value = undefined;
        this.source = PropertyValueSource.Default;

        const new_effective_value = this.value;
        if (old_effective_value !== new_effective_value)
        {
            this.OnPropertyChange(old_effective_value, new_effective_value);
        }
    }

    // Caches the inherited value resolved from an ancestor. No-op when
    // an explicit higher-priority source already owns this slot — local
    // overrides always shadow inheritance. Fires change notification
    // when the effective value actually changes.
    SetInheritedValue(value: any): void
    {
        if (this.source === PropertyValueSource.LocalValue
            || this.source === PropertyValueSource.Binding
            || this.source === PropertyValueSource.AnimatedValue
            || this.source === PropertyValueSource.CoercedValue)
        {
            return;
        }
        const old_effective_value = this.value;
        this.inherited_value = value;
        this.source = PropertyValueSource.InheritedValue;
        const new_effective_value = this.value;
        if (old_effective_value !== new_effective_value)
        {
            this.OnPropertyChange(old_effective_value, new_effective_value);
        }
    }

    // Drops the inherited cache and reverts to Default. Used when the
    // ancestor chain no longer provides a value (e.g. after Detach or
    // when an ancestor's value was cleared).
    ClearInherited(): void
    {
        if (this.source !== PropertyValueSource.InheritedValue) return;
        const old_effective_value = this.value;
        this.inherited_value = undefined;
        this.source = PropertyValueSource.Default;
        const new_effective_value = this.value;
        if (old_effective_value !== new_effective_value)
        {
            this.OnPropertyChange(old_effective_value, new_effective_value);
        }
    }

    // Base-value entry point.
    //
    // If a Binding is being installed, the previous binding (if any) is
    // disposed and the new one takes the Binding source slot.
    //
    // For non-Binding writes: if the existing source is a TwoWay /
    // OneWayToSource binding, the write flows through that binding to
    // the source rather than replacing it (WPF's PropertyChanged
    // UpdateSourceTrigger behavior). The source's own set_property_value
    // fires the binding's push notification, which routes back through
    // this EVD's OnPropertyChange — so listeners still see one change.
    //
    // For all other cases (no existing binding, or existing binding is
    // OneWay/OneTime, or TwoWay writeback failed because the path isn't
    // writable), the write replaces the current source as a LocalValue
    // and the previous binding (if any) is disposed.
    set value(val: any)
    {
        const old_effective_value = this.value;

        // TwoWay / OneWayToSource writeback: route non-Binding writes
        // through the installed binding instead of replacing it.
        if (!(val instanceof Binding)
            && this.binding_value !== undefined
            && (this.binding_value.mode === BindingMode.TwoWay
             || this.binding_value.mode === BindingMode.OneWayToSource))
        {
            if (this.binding_value.set_value(val))
            {
                // Source update fired the binding's push notification,
                // which has already invoked OnPropertyChange on this EVD.
                return;
            }
            // Writeback failed (path not writable). Fall through to the
            // local-replace path so the user's write isn't silently lost.
        }

        // When replacing a previous binding, dispose it so its path listeners
        // are removed from every chain Model. Without this the old chain
        // would keep holding (now-silent) listener references — a leak.
        if (this.binding_value !== undefined && this.binding_value !== val)
        {
            this.binding_value.dispose();
            this.binding_value = undefined;
        }

        if (val instanceof Binding)
        {
            this.source = PropertyValueSource.Binding;
            this.binding_value = val;
            // Push-style propagation: when the path's resolved value
            // changes, transform both old and new through the binding's
            // pipeline (converter / stringFormat / fallback) so consumer
            // listeners see post-pipeline values. Dedupe if the
            // transformed values are equal — pre-pipeline change might
            // produce no post-pipeline change (e.g., format strings or
            // fallbacks can collapse two raw values to one displayed one).
            val.setOnValueChanged((old_resolved, new_resolved) =>
            {
                const old_final = val.apply_transform(old_resolved);
                const new_final = val.apply_transform(new_resolved);
                if (old_final !== new_final)
                {
                    this.OnPropertyChange(old_final, new_final);
                }
            });
            this.OnPropertyChange(old_effective_value, val.get_value());
        }
        else
        {
            this.source = PropertyValueSource.LocalValue;
            this.local_value = val;
            this.OnPropertyChange(old_effective_value, this.local_value);
        }
    }

    // The effective value: the highest-priority entry that is currently
    // set, mirroring WPF's EffectiveValueEntry resolution
    // (CoercedValue > AnimatedValue > Binding > LocalValue).
    get value(): any
    {
        switch (this.source)
        {
            case PropertyValueSource.CoercedValue:
                return this.coerced_value;
            case PropertyValueSource.AnimatedValue:
                return this.animated_value;
            case PropertyValueSource.Binding:
                return this.binding_value!.get_value();
            case PropertyValueSource.LocalValue:
                return this.local_value;
            case PropertyValueSource.InheritedValue:
                return this.inherited_value;
            default:
                return this.property_descriptor.DefaultValue;
        }
    }
}
