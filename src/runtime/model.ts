import { Binding } from './binding/binding.js';
import { EffectiveValueDescriptor, PropertyValueSource } from './binding/effective-value.js';
import type { InternalPropertyChangeCallback, PropertyChangeCallback } from './binding/effective-value.js';
import { PropertyDescriptor } from './property-descriptor.js';
import type { CoerceValue, PropertyMetadata, ValidateValue } from './property-descriptor.js';
import type { MetaData } from './metadata.js';

// Branded handle returned by Model.RegisterProperty (and the read-only /
// attached variants). Serves two purposes:
//
//   * Typed identity — `PropertyKey<T>` carries a phantom `T` so the
//     typed overloads of `get_property_value` / `set_property_value`
//     can read and write the property with no `as` cast at the call
//     site. The descriptor field is the runtime identity; `T` is purely
//     a compile-time contract authored by whoever declared the DP.
//
//   * Write capability — for read-only properties, possession of the
//     key is what grants write access via `set_property_value_with_key`
//     / `ClearValueWithKey`. Read/write properties also get a key from
//     RegisterProperty; the capability bit is moot for them (anyone can
//     write a read/write DP), so the key is just typed identity.
//
// `_phantom` is never assigned — it exists only to make the generic
// parameter load-bearing at the type level so `PropertyKey<number>` and
// `PropertyKey<string>` are not assignable to each other.
export class PropertyKey<T = unknown>
{
    declare private readonly _phantom: T;
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

    // Public peek used by bindings to check whether a property is
    // registered on a class without throwing. Same body as
    // find_descriptor; exposed so the binding layer (DataContextBinding,
    // future MultiBinding) can implement WPF-style "silent no-op on
    // missing path" without reaching into protected internals.
    public static HasProperty(klass: Function, property: string): boolean
    {
        return Model.find_descriptor(klass, property) !== undefined;
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

    // Public DP enumeration — walks `klass`'s prototype chain and
    // gathers every PropertyDescriptor registered on it or any ancestor.
    // Used by tooling (LSP completion / hover) that needs the full DP
    // surface of a class identified by name from source. When a
    // descendant overrides a property (rare — typically only changing
    // metadata), the descendant's descriptor wins.
    //
    // Output order: descendant-first within each class's bag (insertion
    // order), then walks up the prototype chain so child classes'
    // properties come before parents'. Duplicates by name are
    // de-duplicated keeping the most-derived descriptor.
    public static EnumerateProperties(klass: Function): PropertyDescriptor[]
    {
        const seen = new Set<string>();
        const out: PropertyDescriptor[] = [];
        let current: Function | null = klass;
        while (current !== null && current !== Function.prototype)
        {
            const bag = Model.property_bags.get(current);
            if (bag !== undefined)
            {
                for (const [name, desc] of bag)
                {
                    if (seen.has(name)) continue;
                    seen.add(name);
                    out.push(desc);
                }
            }
            current = Object.getPrototypeOf(current);
        }
        return out;
    }

    private static remember_class(klass: Function): void
    {
        Model.class_registry.set(klass.name, new WeakRef(klass));
    }

    // Registers a read/write dependency property and returns a typed
    // `PropertyKey<T>`. Callers that just want the registration side
    // effect can ignore the return value. Callers that want typed access
    // (no `as T` casts at the accessor sites) store the key on the class
    // and pass it to the typed `get_property_value` / `set_property_value`
    // overloads. The string `property` is still the binding-path name
    // (`Binding(t, 'Width')` resolves by string), so existing string-
    // keyed access continues to work.
    //
    // Idempotent: re-registering the same (owner, property) leaves the
    // existing descriptor in place and returns a key pointing at it, so
    // a module re-imported under HMR doesn't clobber state.
    public static RegisterProperty<T = unknown>(
        owner: Function,
        property: string,
        default_value: T,
        meta_data: MetaData,
        coerce_value?: CoerceValue,
        validate_value?: ValidateValue,
    ): PropertyKey<T>
    {
        if (property.includes('.'))
        {
            throw new Error(`Property name '${property}' may not contain '.' (reserved for composite keys).`);
        }
        if (validate_value !== undefined && !validate_value(default_value))
        {
            throw new Error(
                `Default value for property '${owner.name}.${property}' fails its validate_value callback.`,
            );
        }
        Model.remember_class(owner);
        const bag = Model.get_property_bag(owner);
        let descriptor = bag.get(property);
        if (descriptor === undefined)
        {
            const opts: PropertyMetadata = { default_value, meta_data };
            if (coerce_value !== undefined)
            {
                opts.coerce_value = coerce_value;
            }
            if (validate_value !== undefined)
            {
                opts.validate_value = validate_value;
            }
            descriptor = new PropertyDescriptor(owner, property, opts);
            bag.set(property, descriptor);
        }
        return new PropertyKey<T>(descriptor);
    }

    // Pure synonym alias for clarity at declaration sites. There is no
    // runtime distinction between "regular" and "attached" properties —
    // any registered property can be set on any Model via the explicit-
    // owner overload of set_property_value.
    public static RegisterAttachedProperty<T = unknown>(
        owner: Function,
        property: string,
        default_value: T,
        meta_data: MetaData,
        coerce_value?: CoerceValue,
        validate_value?: ValidateValue,
    ): PropertyKey<T>
    {
        return Model.RegisterProperty<T>(
            owner, property, default_value, meta_data, coerce_value, validate_value,
        );
    }

    // Registers a read-only property and returns a PropertyKey that
    // grants write privileges. External code can read the property
    // (and bind to it) but only the holder of the key can write or
    // clear it. Throws if the property is already registered on owner.
    public static RegisterReadOnlyProperty<T = unknown>(
        owner: Function,
        property: string,
        default_value: T,
        meta_data: MetaData,
        coerce_value?: CoerceValue,
        validate_value?: ValidateValue,
    ): PropertyKey<T>
    {
        if (property.includes('.'))
        {
            throw new Error(`Property name '${property}' may not contain '.' (reserved for composite keys).`);
        }
        if (validate_value !== undefined && !validate_value(default_value))
        {
            throw new Error(
                `Default value for property '${owner.name}.${property}' fails its validate_value callback.`,
            );
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
        if (validate_value !== undefined)
        {
            opts.validate_value = validate_value;
        }
        const descriptor = new PropertyDescriptor(owner, property, opts, undefined, /* readOnly */ true);
        bag.set(property, descriptor);
        return new PropertyKey<T>(descriptor);
    }

    // Overrides metadata (default value / coerce / meta flags) on `klass`
    // for the property identified by `key`. The PropertyKey is the typed
    // handle returned by `RegisterProperty` / `RegisterReadOnlyProperty`;
    // it carries the original descriptor so the override chains cleanly
    // and the value type `T` is threaded through `opts.default_value`.
    // No string-named overload — type references are first-class through
    // the key, matching the rest of the typed accessor surface.
    public static OverrideMetadata<T>(
        klass: Function,
        key: PropertyKey<T>,
        opts: PropertyMetadata,
    ): void
    {
        Model.remember_class(klass);
        const property = key.descriptor.Name;
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
    // Public accessors
    //
    // The canonical consumer surface is the typed-key form on every
    // accessor — `model.get_property_value(Border.BackgroundKey)`,
    // `model.set_property_value(Border.BackgroundKey, brush)`, etc.
    // The phantom `T` on `PropertyKey<T>` makes a typo at the call site
    // a compile error and threads the value type through the accessor
    // signature so no `as T` cast is needed.
    //
    // The string-keyed surface (`_get_property_value_by_name` and its
    // siblings) is intentionally framework-internal — leading underscore
    // signals "not the recommended consumer pattern." The binding
    // pipeline, Style.Setter / Trigger, the animation timelines, and
    // the µ-mural compiler emit code that targets properties by name
    // because binding paths and markup property assignments come from
    // text at parse time. Consumers should not reach for these directly
    // when a `PropertyKey<T>` is available — that's what the migration
    // to typed keys was for.
    // ------------------------------------------------------------------

    // Typed-key public API ---------------------------------------------

    public AddPropertyChangedListener(key: PropertyKey<unknown>, callback: PropertyChangeCallback): void
    {
        this.ensure_effective_value_for(key.descriptor).AddChangeListener(callback);
    }

    public RemovePropertyChangedListener(key: PropertyKey<unknown>, callback: PropertyChangeCallback): void
    {
        const composed = Model.compose_key(key.descriptor.RootOwner, key.descriptor.Name);
        this.property_values.get(composed)?.RemoveChangeListener(callback);
    }

    public ClearValue<T>(key: PropertyKey<T>): void
    {
        this.require_writable(key.descriptor);
        this.clear_via_descriptor(key.descriptor);
    }

    // Privileged ClearValue for read-only properties — the key carries
    // the descriptor so no lookup is needed and no read-only gate applies.
    public ClearValueWithKey(key: PropertyKey<unknown>): void
    {
        this.clear_via_descriptor(key.descriptor);
    }

    public GetValueSource<T>(key: PropertyKey<T>): PropertyValueSource
    {
        const composed = Model.compose_key(key.descriptor.RootOwner, key.descriptor.Name);
        return this.property_values.get(composed)?.Source ?? PropertyValueSource.Default;
    }

    // Pin a value on the Animated slot. Animation overrides Binding /
    // Local / Trigger / Style / Inherited / Default (highest priority
    // among base-value sources). Storyboard.AdvanceTo calls this every
    // clock tick; consumers normally drive it via Visual.BeginAnimation
    // rather than directly. Calling SetAnimatedValue from outside the
    // animation engine works but the slot is then nobody's job to
    // release — pair every direct call with a matching ClearAnimatedValue.
    public SetAnimatedValue<T>(key: PropertyKey<T>, value: T): void
    {
        const composed = Model.compose_key(key.descriptor.RootOwner, key.descriptor.Name);
        let evd = this.property_values.get(composed);
        if (evd === undefined)
        {
            evd = this.new_effective_value(key.descriptor);
            this.property_values.set(composed, evd);
        }
        evd.SetAnimatedValue(value);
    }

    public ClearAnimatedValue<T>(key: PropertyKey<T>): void
    {
        const composed = Model.compose_key(key.descriptor.RootOwner, key.descriptor.Name);
        this.property_values.get(composed)?.ClearAnimatedValue();
    }

    public get_property_value<T>(key: PropertyKey<T>): T
    {
        const composed = Model.compose_key(key.descriptor.RootOwner, key.descriptor.Name);
        const evd = this.property_values.get(composed);
        if (evd !== undefined) return evd.value;
        // Default-value fallback walks this instance's class chain so
        // Model.OverrideMetadata on a subclass is honored. The key's
        // own descriptor is the root-owner registration â€” fine as the
        // last-resort fallback when no subclass override exists.
        const descriptor = Model.find_descriptor(this.constructor, key.descriptor.Name)
                        ?? key.descriptor;
        return this.resolve_default(descriptor);
    }

    public set_property_value<T>(key: PropertyKey<T>, value: T): void
    {
        // Read-only gate still applies — a read-only DP's key was
        // returned to the registering class only; passing it back here
        // without going through set_property_value_with_key is treated
        // like any other attempt at writing a read-only DP.
        this.require_writable(key.descriptor);
        this.set_via_descriptor(key.descriptor, value);
    }

    // Privileged set for read-only properties — the key carries the
    // descriptor so no public lookup is needed and the read-only gate
    // doesn't apply. Also works for read/write properties (the key is
    // a more direct write path; bypasses the implicit-owner resolution).
    public set_property_value_with_key<T>(key: PropertyKey<T>, value: T): void
    {
        this.set_via_descriptor(key.descriptor, value);
    }

    // Framework-internal string-keyed surface ---------------------------
    //
    // Every method below is what the binding pipeline / Setter / Trigger
    // / animation / compiler-emitted code reaches for because they
    // identify properties by string at runtime. Leading underscore +
    // `_by_name` suffix signals "use the typed-key variant for direct
    // accessor code; this exists for the binding system." Same semantics
    // as the pre-rename string overloads — only the name changed.

    public _add_property_changed_listener_by_name(property: string, callback: PropertyChangeCallback): void;
    public _add_property_changed_listener_by_name(owner: Function, property: string, callback: PropertyChangeCallback): void;
    public _add_property_changed_listener_by_name(arg1: any, arg2: any, arg3?: any): void
    {
        const descriptor = (typeof arg1 === 'string')
            ? this.resolve_descriptor_implicit(arg1)
            : this.resolve_descriptor_explicit(arg1, arg2);
        const callback = (typeof arg1 === 'string') ? arg2 : arg3;
        this.ensure_effective_value_for(descriptor).AddChangeListener(callback);
    }

    public _remove_property_changed_listener_by_name(property: string, callback: PropertyChangeCallback): void;
    public _remove_property_changed_listener_by_name(owner: Function, property: string, callback: PropertyChangeCallback): void;
    public _remove_property_changed_listener_by_name(arg1: any, arg2: any, arg3?: any): void
    {
        const descriptor = (typeof arg1 === 'string')
            ? Model.find_descriptor(this.constructor, arg1)
            : Model.find_descriptor(arg1, arg2);
        if (descriptor === undefined) return;
        const composed = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        const callback = (typeof arg1 === 'string') ? arg2 : arg3;
        this.property_values.get(composed)?.RemoveChangeListener(callback);
    }

    public _clear_value_by_name(property: string): void;
    public _clear_value_by_name(owner: Function, property: string): void;
    public _clear_value_by_name(arg1: any, arg2?: any): void
    {
        const descriptor = (typeof arg1 === 'string')
            ? this.resolve_descriptor_implicit(arg1)
            : this.resolve_descriptor_explicit(arg1, arg2);
        this.require_writable(descriptor);
        this.clear_via_descriptor(descriptor);
    }

    public _get_value_source_by_name(property: string): PropertyValueSource;
    public _get_value_source_by_name(owner: Function, property: string): PropertyValueSource;
    public _get_value_source_by_name(arg1: any, arg2?: any): PropertyValueSource
    {
        const descriptor = (typeof arg1 === 'string')
            ? this.resolve_descriptor_implicit(arg1)
            : this.resolve_descriptor_explicit(arg1, arg2);
        const composed = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        return this.property_values.get(composed)?.Source ?? PropertyValueSource.Default;
    }

    public _set_animated_value_by_name(property: string, value: any): void;
    public _set_animated_value_by_name(owner: Function, property: string, value: any): void;
    public _set_animated_value_by_name(arg1: any, arg2: any, arg3?: any): void
    {
        const descriptor = (typeof arg1 === 'string')
            ? this.resolve_descriptor_implicit(arg1)
            : this.resolve_descriptor_explicit(arg1, arg2);
        const value = (typeof arg1 === 'string') ? arg2 : arg3;
        const composed = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        let evd = this.property_values.get(composed);
        if (evd === undefined)
        {
            evd = this.new_effective_value(descriptor);
            this.property_values.set(composed, evd);
        }
        evd.SetAnimatedValue(value);
    }

    public _clear_animated_value_by_name(property: string): void;
    public _clear_animated_value_by_name(owner: Function, property: string): void;
    public _clear_animated_value_by_name(arg1: any, arg2?: any): void
    {
        const descriptor = (typeof arg1 === 'string')
            ? this.resolve_descriptor_implicit(arg1)
            : this.resolve_descriptor_explicit(arg1, arg2);
        const composed = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        this.property_values.get(composed)?.ClearAnimatedValue();
    }

    public _get_property_value_by_name(property: string): any;
    public _get_property_value_by_name(owner: Function, property: string): any;
    public _get_property_value_by_name(arg1: any, arg2?: any): any
    {
        const descriptor = (typeof arg1 === 'string')
            ? this.resolve_descriptor_implicit(arg1)
            : this.resolve_descriptor_explicit(arg1, arg2);
        const composed = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        const evd = this.property_values.get(composed);
        if (evd !== undefined) return evd.value;
        return this.resolve_default(descriptor);
    }

    public _set_property_value_by_name(property: string, value: any): void;
    public _set_property_value_by_name(owner: Function, property: string, value: any): void;
    public _set_property_value_by_name(arg1: any, arg2: any, arg3?: any): void
    {
        const descriptor = (typeof arg1 === 'string')
            ? this.resolve_descriptor_implicit(arg1)
            : this.resolve_descriptor_explicit(arg1, arg2);
        this.require_writable(descriptor);
        const value = (typeof arg1 === 'string') ? arg2 : arg3;
        this.set_via_descriptor(descriptor, value);
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

    // Returns the descriptor's default value after passing it through
    // the registered CoerceValue callback (if any). Used by the
    // property-get paths that don't yet have an EVD â€” the unset value
    // is conceptually the default, and coerce gets to clamp/normalize
    // it the same way it would clamp any explicit write.
    private resolve_default(descriptor: PropertyDescriptor): any
    {
        const def = descriptor.DefaultValue;
        const coerce = descriptor.CoerceValue;
        return coerce !== undefined ? coerce(this, def) : def;
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
        // Validate-value gate runs first (before any storage / coerce /
        // listener-firing) so an invalid write is a clean rejection
        // with no side effects. Bindings are exempt — the value is a
        // Binding instance, not a "value" in the property's domain.
        const validate = descriptor.ValidateValue;
        if (validate !== undefined && !(value instanceof Binding) && !validate(value))
        {
            throw new Error(
                `Value ${JSON.stringify(value)} rejected by validate_value for '${descriptor.RootOwner.name}.${descriptor.Name}'.`,
            );
        }

        const key = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        let effective_value = this.property_values.get(key);

        if (effective_value === undefined)
        {
            effective_value = this.new_effective_value(descriptor);
            this.property_values.set(key, effective_value);
        }

        // Pre-write virtual hook. Fires before the base-value tier is
        // updated, regardless of whether a higher-priority tier
        // (Animated, Trigger) currently masks the effective value.
        // OnPropertyChanged only fires when the EFFECTIVE value
        // changes, which means a Local write that's masked by an
        // active animation never reaches OnPropertyChanged — but the
        // implicit-transition engine on Visual still needs to see it
        // so a re-write mid-animation can re-target. Override this
        // hook (not OnPropertyChanged) for "fires on every raw write"
        // semantics.
        this.OnBeforeBaseValueWrite(descriptor, value);

        // Raw value is stored; coerce runs on every read via EVD.value.
        // WPF semantics: coerce never sees its previous output as input,
        // so a clamp like `min(x, ceiling)` works idempotently even when
        // `ceiling` later widens.
        effective_value.value = value;
    }

    // Virtual hook fired BEFORE a base-value tier write (Local /
    // Binding / Style — i.e., set_via_descriptor and friends). Unlike
    // OnPropertyChanged, this fires every time set_property_value is
    // invoked, regardless of whether the write's effective value
    // matters. No-op at the Model layer; Visual overrides this to
    // drive the implicit-transition engine (which needs to see the
    // raw write even when a running animation is masking the
    // effective value).
    protected OnBeforeBaseValueWrite(_descriptor: PropertyDescriptor, _value: any): void { }

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
