import { EffectiveValueDescriptor, PropertyValueSource } from './effective-value.js';
import type { InternalPropertyChangeCallback, PropertyChangeCallback } from './effective-value.js';
import { PropertyDescriptor } from './property-descriptor.js';
import type { CoerceValue, PropertyMetadata } from './property-descriptor.js';
import { affectsArrange, affectsMeasure, affectsRender, inherits } from './metadata.js';
import type { MetaData } from './metadata.js';

// Capability token returned by Model.RegisterReadOnlyProperty. The
// owner keeps it private; external code can read the property but only
// the holder of the key can write to it. Pass to set_property_value_with_key
// / ClearValueWithKey to bypass the read-only gate.
export class PropertyKey
{
    constructor(public readonly descriptor: PropertyDescriptor) {}
}

// Root of the property/binding/tree system. A Model owns per-instance
// value state (`property_values`), an optional parent link, and a virtual
// OnPropertyChanged hook that fires for every effective-value change.
// The hook consults the property's MetaData flags and forwards to
// MarkMeasureDirty / MarkArrangeDirty / MarkRenderDirty so layout-aware
// subclasses (Single, PanelBase, or any user subclass that overrides
// those hooks) can react to changes from any source — direct sets,
// binding pushes, ClearValue, and any future animated/coerced updates.
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
    private property_values: Map<string, EffectiveValueDescriptor> = new Map();

    private _parent: Model | undefined;

    constructor()
    {

    }

    // Read-only link to the containing Model. Protected so subclasses can
    // navigate the tree; external code uses concrete subclasses' own
    // getters (e.g. Single.child, PanelBase.children).
    protected get parent(): Model | undefined
    {
        return this._parent;
    }

    protected SetParent(parent: Model | undefined): void
    {
        this._parent = parent;
    }

    protected Attach(child: Model): void
    {
        if (child === this)
        {
            throw new Error('A Model cannot be its own child.');
        }
        if (child._parent !== undefined)
        {
            throw new Error('Model already has a parent; remove it from its current parent first.');
        }
        child.SetParent(this);
        child.refresh_inheritance_subtree();
    }

    protected Detach(child: Model): void
    {
        if (child._parent !== this)
        {
            throw new Error('Cannot detach a Model that is not a child of this.');
        }
        child.SetParent(undefined);
        child.refresh_inheritance_subtree();
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

    // Composes the per-instance storage key for a given (owner, name).
    public static compose_key(owner: Function, property: string): string
    {
        return `${owner.name}.${property}`;
    }

    // Implicit-owner lookup: walks the target's class hierarchy looking
    // for the first ancestor that registered `property`. Returns
    // undefined if no ancestor has it.
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

    // Explicit-owner lookup: walks the owner's class hierarchy (so a
    // subclass override of metadata wins). Returns undefined if neither
    // the owner nor any ancestor of it registered `property`.
    protected static find_descriptor_on(owner: Function, property: string): PropertyDescriptor | undefined
    {
        return Model.find_descriptor(owner, property);
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
            : Model.find_descriptor_on(arg1, arg2);
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
        const descriptor = Model.find_descriptor_on(owner, property);
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
    // attach paths and by inheritance refresh.
    private ensure_effective_value_for(descriptor: PropertyDescriptor): EffectiveValueDescriptor
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
    // (direct set, binding push, ClearValue, etc.). The default routes
    // through the property's MetaData flags to MarkMeasureDirty /
    // MarkArrangeDirty / MarkRenderDirty, and — when the property is
    // marked Inherits — pushes the change down the tree.
    protected OnPropertyChanged(descriptor: PropertyDescriptor, _old_value: any, _new_value: any): void
    {
        const meta = descriptor.MetaData;
        if (affectsMeasure(meta)) this.MarkMeasureDirty();
        if (affectsArrange(meta)) this.MarkArrangeDirty();
        if (affectsRender(meta))  this.MarkRenderDirty();
        if (inherits(meta))       this.propagate_inheritance_for(descriptor);
    }

    protected MarkMeasureDirty(): void { /* override to push to layout queue */ }
    protected MarkArrangeDirty(): void { /* override to push to layout queue */ }
    protected MarkRenderDirty(): void  { /* override to push to render queue */ }

    // ------------------------------------------------------------------
    // Property value inheritance
    // ------------------------------------------------------------------

    private walk_inherited(key: string): any | undefined
    {
        let p = this._parent;
        while (p !== undefined)
        {
            const evd = p.property_values.get(key);
            if (evd !== undefined && evd.Source !== PropertyValueSource.Default)
            {
                return evd.value;
            }
            p = p._parent;
        }
        return undefined;
    }

    private refresh_inherited(descriptor: PropertyDescriptor): void
    {
        if (!inherits(descriptor.MetaData)) return;

        const key = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        const evd = this.property_values.get(key);
        if (evd !== undefined
            && evd.Source !== PropertyValueSource.Default
            && evd.Source !== PropertyValueSource.InheritedValue)
        {
            return;
        }

        const value = this.walk_inherited(key);
        if (value !== undefined)
        {
            this.ensure_effective_value_for(descriptor).SetInheritedValue(value);
        }
        else if (evd !== undefined && evd.Source === PropertyValueSource.InheritedValue)
        {
            evd.ClearInherited();
        }
    }

    protected refresh_inheritance_subtree(): void
    {
        for (const descriptor of Model.collect_inheritable_descriptors(this.constructor))
        {
            this.refresh_inherited(descriptor);
        }
        this.propagate_inheritance_to_children();
    }

    protected propagate_inheritance_to_children(): void { /* override in Single / PanelBase */ }

    protected propagate_inheritance_for(_descriptor: PropertyDescriptor): void { /* override in Single / PanelBase */ }

    private static collect_inheritable_descriptors(klass: Function): PropertyDescriptor[]
    {
        const seen = new Set<string>();
        const result: PropertyDescriptor[] = [];
        let current: Function | null = klass;
        while (current !== null && current !== Function.prototype)
        {
            const bag = Model.property_bags.get(current);
            if (bag !== undefined)
            {
                for (const [name, desc] of bag)
                {
                    if (!seen.has(name) && inherits(desc.MetaData))
                    {
                        seen.add(name);
                        result.push(desc);
                    }
                }
            }
            current = Object.getPrototypeOf(current);
        }
        return result;
    }
}

// A Model that owns at most one child. SetChild(undefined) clears the
// slot. Replacing a non-undefined child first detaches the previous one.
export class Single extends Model
{
    private _child: Model | undefined;

    public get child(): Model | undefined
    {
        return this._child;
    }

    public SetChild(child: Model | undefined): void
    {
        if (child === this._child) return;

        if (this._child !== undefined)
        {
            this.Detach(this._child);
        }

        this._child = child;

        if (child !== undefined)
        {
            this.Attach(child);
        }
    }

    protected override propagate_inheritance_to_children(): void
    {
        this._child?.['refresh_inheritance_subtree']();
    }

    protected override propagate_inheritance_for(descriptor: PropertyDescriptor): void
    {
        this._child?.['refresh_inherited'](descriptor);
    }
}

// A Model that owns an ordered collection of children.
export class PanelBase extends Model
{
    private _children: Model[] = [];

    public get children(): ReadonlyArray<Model>
    {
        return this._children;
    }

    public AddChild(child: Model): void
    {
        this.Attach(child);
        this._children.push(child);
    }

    public RemoveChild(child: Model): void
    {
        const index = this._children.indexOf(child);
        if (index === -1) return;
        this._children.splice(index, 1);
        this.Detach(child);
    }

    protected override propagate_inheritance_to_children(): void
    {
        for (const c of this._children) c['refresh_inheritance_subtree']();
    }

    protected override propagate_inheritance_for(descriptor: PropertyDescriptor): void
    {
        for (const c of this._children) c['refresh_inherited'](descriptor);
    }
}
