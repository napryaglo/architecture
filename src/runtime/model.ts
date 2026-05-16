import { EffectiveValueDescriptor, PropertyValueSource } from './effective-value.js';
import type { InternalPropertyChangeCallback, PropertyChangeCallback } from './effective-value.js';
import { PropertyDescriptor } from './property-descriptor.js';
import type { CoerceValue, PropertyMetadata } from './property-descriptor.js';
import type { MetaData } from './metadata.js';

// Capability token returned by Model.RegisterReadOnlyProperty. The
// owner keeps it private; external code can read the property but only
// the holder of the key can write to it. Pass to set_property_value_with_key
// / ClearValueWithKey to bypass the read-only gate.
export class PropertyKey
{
    constructor(public readonly descriptor: PropertyDescriptor) {}
}

// Root of the property/binding system. A Model owns per-instance value
// state (`property_values`) and a virtual OnPropertyChanged hook that
// fires for every effective-value change. The base hook is a no-op;
// Visual (in visual.ts) overrides it to route layout/render invalidation
// and property value inheritance through the visual tree.
//
// Property storage uses composite keys `${descriptor.RootOwner.name}.${name}`
// uniformly. This lets any property registered on any class be set on
// any Model instance (WPF-style cross-class / "attached" usage). The
// accessors expose two surfaces:
//   * implicit owner — `set_property_value('width', 100)` walks the
//     target's class hierarchy to find the property, then composes the
//     key from descriptor.RootOwner.
//   * explicit owner — `set_property_value(TextBlock, 'fontSize', 14)`
//     bypasses the hierarchy walk; uses the supplied owner directly.
export class Model
{
    // Per-class descriptor bags keyed by class constructor. WeakMap means
    // a class becoming unreachable lets its bag be GC'd; lookup walks the
    // prototype chain to support inherited and overridden metadata.
    private static property_bags: WeakMap<Function, Map<string, PropertyDescriptor>> = new WeakMap();

    // Name → class registry used by the PropertyPath parser to resolve
    // owner-class names in attached-property syntax like '(Grid.Row)'.
    // Populated whenever a class is used in RegisterProperty /
    // OverrideMetadata. WeakRef so classes that go out of use can still
    // be GC'd; stale entries are pruned lazily on first lookup.
    private static class_registry: Map<string, WeakRef<Function>> = new Map();

    // Per-instance value store keyed by composite `${RootOwner.name}.${name}`.
    // Protected so Visual's inheritance helpers can walk parent state.
    protected property_values: Map<string, EffectiveValueDescriptor> = new Map();

    constructor()
    {

    }

    // ------------------------------------------------------------------
    // Static registry and lookup
    // ------------------------------------------------------------------

    protected static get_property_bag(klass: Function): Map<string, PropertyDescriptor>
    {
        let bag = Model.property_bags.get(klass);
        if (bag === undefined)
        {
            bag = new Map<string, PropertyDescriptor>();
            Model.property_bags.set(klass, bag);
        }
        return bag;
    }

    // Non-creating peek used by Visual.collect_inheritable_descriptors —
    // iterating the prototype chain shouldn't allocate empty bags for
    // ancestors that never registered anything.
    protected static peek_property_bag(klass: Function): Map<string, PropertyDescriptor> | undefined
    {
        return Model.property_bags.get(klass);
    }

    // Composes the per-instance storage key for a given (owner, name).
    public static compose_key(owner: Function, property: string): string
    {
        return `${owner.name}.${property}`;
    }

    // Walks the given class's prototype chain looking for the first
    // ancestor that registered `property`. Returns undefined if no
    // ancestor has it.
    //
    // Used in two modes: implicit owner (klass = this.constructor — walks
    // the target's hierarchy), and explicit owner (klass = the caller-
    // supplied owner — walks the owner's hierarchy so a subclass
    // override of metadata wins). Same body for both; the call site
    // chooses which class to walk.
    protected static find_descriptor(klass: Function, property: string): PropertyDescriptor | undefined
    {
        let current: Function | null = klass;
        while (current !== null && current !== Function.prototype)
        {
            const desc = Model.property_bags.get(current)?.get(property);
            if (desc !== undefined) return desc;
            current = Object.getPrototypeOf(current);
        }
        return undefined;
    }

    // Resolves a class-name string (e.g. 'Grid') to the registered class
    // object. Used by the PropertyPath parser for attached-property
    // syntax. Returns undefined if no such class has been registered, or
    // if the class has been garbage-collected.
    public static find_class(name: string): Function | undefined
    {
        const ref = Model.class_registry.get(name);
        if (ref === undefined) return undefined;
        const cls = ref.deref();
        if (cls === undefined)
        {
            Model.class_registry.delete(name);
            return undefined;
        }
        return cls;
    }

    private static remember_class(klass: Function): void
    {
        Model.class_registry.set(klass.name, new WeakRef(klass));
    }

    public static RegisterProperty(
        owner: Function,
        property: string,
        default_value: any,
        meta_data: MetaData,
        coerce_value?: CoerceValue,
    ): void
    {
        if (property.includes('.'))
        {
            throw new Error(`Property name '${property}' may not contain '.' (reserved for composite keys).`);
        }
        Model.remember_class(owner);
        const bag = Model.get_property_bag(owner);
        if (!bag.has(property))
        {
            const opts: PropertyMetadata = { default_value, meta_data };
            if (coerce_value !== undefined)
            {
                opts.coerce_value = coerce_value;
            }
            bag.set(property, new PropertyDescriptor(owner, property, opts));
        }
    }

    // Pure synonym alias for clarity at declaration sites. There is no
    // runtime distinction between "regular" and "attached" properties —
    // any registered property can be set on any Model via the explicit-
    // owner overload of set_property_value.
    public static RegisterAttachedProperty(
        owner: Function,
        property: string,
        default_value: any,
        meta_data: MetaData,
        coerce_value?: CoerceValue,
    ): void
    {
        Model.RegisterProperty(owner, property, default_value, meta_data, coerce_value);
    }

    // Registers a read-only property and returns a PropertyKey that
    // grants write privileges. External code can read the property
    // (and bind to it) but only the holder of the key can write or
    // clear it. Throws if the property is already registered on owner.
    public static RegisterReadOnlyProperty(
        owner: Function,
        property: string,
        default_value: any,
        meta_data: MetaData,
        coerce_value?: CoerceValue,
    ): PropertyKey
    {
        if (property.includes('.'))
        {
            throw new Error(`Property name '${property}' may not contain '.' (reserved for composite keys).`);
        }
        Model.remember_class(owner);
        const bag = Model.get_property_bag(owner);
        if (bag.has(property))
        {
            throw new Error(`Property '${property}' is already registered on '${owner.name}'.`);
        }
        const opts: PropertyMetadata = { default_value, meta_data };
        if (coerce_value !== undefined)
        {
            opts.coerce_value = coerce_value;
        }
        const descriptor = new PropertyDescriptor(owner, property, opts, undefined, /* readOnly */ true);
        bag.set(property, descriptor);
        return new PropertyKey(descriptor);
    }

    public static OverrideMetadata(
        klass: Function,
        property: string,
        opts: PropertyMetadata,
    ): void
    {
        Model.remember_class(klass);
        const bag = Model.get_property_bag(klass);
        const parent_descriptor = bag.get(property)
            ?? Model.find_descriptor(Object.getPrototypeOf(klass) as Function, property);
        if (parent_descriptor === undefined)
        {
            throw new Error(
                `Cannot override metadata for property '${property}' — not registered on any ancestor of '${klass.name}'.`,
            );
        }
        bag.set(property, new PropertyDescriptor(klass, property, opts, parent_descriptor));
    }

    // ------------------------------------------------------------------
    // Public accessors — each has an implicit-owner and explicit-owner overload
    // ------------------------------------------------------------------

    public AddPropertyChangedListener(property: string, callback: PropertyChangeCallback): void;
    public AddPropertyChangedListener(owner: Function, property: string, callback: PropertyChangeCallback): void;
    public AddPropertyChangedListener(arg1: any, arg2: any, arg3?: any): void
    {
        const descriptor = (typeof arg1 === 'string')
            ? this.resolve_descriptor_implicit(arg1)
            : this.resolve_descriptor_explicit(arg1, arg2);
        const callback = (typeof arg1 === 'string') ? arg2 : arg3;
        this.ensure_effective_value_for(descriptor).AddChangeListener(callback);
    }

    public RemovePropertyChangedListener(property: string, callback: PropertyChangeCallback): void;
    public RemovePropertyChangedListener(owner: Function, property: string, callback: PropertyChangeCallback): void;
    public RemovePropertyChangedListener(arg1: any, arg2: any, arg3?: any): void
    {
        // Resolve the descriptor only to compute the key; if the property
        // isn't registered we have nothing to remove anyway.
        const descriptor = (typeof arg1 === 'string')
            ? Model.find_descriptor(this.constructor, arg1)
            : Model.find_descriptor(arg1, arg2);
        if (descriptor === undefined) return;
        const key = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        const callback = (typeof arg1 === 'string') ? arg2 : arg3;
        this.property_values.get(key)?.RemoveChangeListener(callback);
    }

    public ClearValue(property: string): void;
    public ClearValue(owner: Function, property: string): void;
    public ClearValue(arg1: any, arg2?: any): void
    {
        const descriptor = (typeof arg1 === 'string')
            ? this.resolve_descriptor_implicit(arg1)
            : this.resolve_descriptor_explicit(arg1, arg2);
        this.require_writable(descriptor);
        this.clear_via_descriptor(descriptor);
    }

    // Privileged ClearValue for read-only properties — the key carries
    // the descriptor so no lookup is needed and no read-only gate applies.
    public ClearValueWithKey(key: PropertyKey): void
    {
        this.clear_via_descriptor(key.descriptor);
    }

    private clear_via_descriptor(descriptor: PropertyDescriptor): void
    {
        const key = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        const evd = this.property_values.get(key);
        if (evd !== undefined)
        {
            evd.ClearValue();
        }
        // Registered but never set — already at default. No-op.
    }

    public GetValueSource(property: string): PropertyValueSource;
    public GetValueSource(owner: Function, property: string): PropertyValueSource;
    public GetValueSource(arg1: any, arg2?: any): PropertyValueSource
    {
        const descriptor = (typeof arg1 === 'string')
            ? this.resolve_descriptor_implicit(arg1)
            : this.resolve_descriptor_explicit(arg1, arg2);
        const key = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        return this.property_values.get(key)?.Source ?? PropertyValueSource.Default;
    }

    public get_property_value(property: string): any;
    public get_property_value(owner: Function, property: string): any;
    public get_property_value(arg1: any, arg2?: any): any
    {
        const descriptor = (typeof arg1 === 'string')
            ? this.resolve_descriptor_implicit(arg1)
            : this.resolve_descriptor_explicit(arg1, arg2);
        const key = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        const evd = this.property_values.get(key);
        if (evd !== undefined) return evd.value;
        return descriptor.DefaultValue;
    }

    public set_property_value(property: string, value: any): void;
    public set_property_value(owner: Function, property: string, value: any): void;
    public set_property_value(arg1: any, arg2: any, arg3?: any): void
    {
        const descriptor = (typeof arg1 === 'string')
            ? this.resolve_descriptor_implicit(arg1)
            : this.resolve_descriptor_explicit(arg1, arg2);
        this.require_writable(descriptor);
        const value = (typeof arg1 === 'string') ? arg2 : arg3;
        this.set_via_descriptor(descriptor, value);
    }

    // Privileged set for read-only properties — the key carries the
    // descriptor so no public lookup is needed and the read-only gate
    // doesn't apply. Also works for read/write properties (the key is
    // a more direct write path; bypasses the implicit-owner resolution).
    public set_property_value_with_key(key: PropertyKey, value: any): void
    {
        this.set_via_descriptor(key.descriptor, value);
    }

    // ------------------------------------------------------------------
    // Shared cores
    // ------------------------------------------------------------------

    private require_writable(descriptor: PropertyDescriptor): void
    {
        if (descriptor.IsReadOnly)
        {
            throw new Error(
                `Property '${descriptor.Name}' is read-only — write via the PropertyKey returned from Model.RegisterReadOnlyProperty.`,
            );
        }
    }

    private resolve_descriptor_implicit(property: string): PropertyDescriptor
    {
        const descriptor = Model.find_descriptor(this.constructor, property);
        if (descriptor === undefined)
        {
            throw new Error(`Property '${property}' not found in model '${this.constructor.name}'`);
        }
        return descriptor;
    }

    private resolve_descriptor_explicit(owner: Function, property: string): PropertyDescriptor
    {
        const descriptor = Model.find_descriptor(owner, property);
        if (descriptor === undefined)
        {
            throw new Error(`Property '${property}' not found on owner '${owner.name}'`);
        }
        return descriptor;
    }

    private set_via_descriptor(descriptor: PropertyDescriptor, value: any): void
    {
        const key = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        let effective_value = this.property_values.get(key);

        if (effective_value === undefined)
        {
            const coerce_value = descriptor.CoerceValue;
            if (coerce_value !== undefined)
            {
                value = coerce_value(this, value);
            }
            effective_value = this.new_effective_value(descriptor);
            this.property_values.set(key, effective_value);
        }

        effective_value.value = value;
    }

    // Returns the EVD for the given descriptor, creating it lazily at
    // Default source if no value has been set yet. Used by listener
    // attach paths and by Visual's inheritance refresh.
    protected ensure_effective_value_for(descriptor: PropertyDescriptor): EffectiveValueDescriptor
    {
        const key = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        let evd = this.property_values.get(key);
        if (evd === undefined)
        {
            evd = this.new_effective_value(descriptor);
            this.property_values.set(key, evd);
        }
        return evd;
    }

    private new_effective_value(descriptor: PropertyDescriptor): EffectiveValueDescriptor
    {
        const evd = new EffectiveValueDescriptor(descriptor, this);
        const cb: InternalPropertyChangeCallback = (_owner, desc, old_value, new_value) =>
        {
            this.OnPropertyChanged(desc, old_value, new_value);
        };
        evd.SetInternalCallback(cb);
        return evd;
    }

    // Virtual hook fired after every effective-value change on this model
    // (direct set, binding push, ClearValue, etc.). No-op at the Model
    // layer; Visual overrides this to route invalidation and inheritance.
    protected OnPropertyChanged(_descriptor: PropertyDescriptor, _old_value: any, _new_value: any): void
    {
        // Pure storage layer — nothing to do. Visual override handles
        // Mark*Dirty dispatch and inheritance propagation.
    }
}
