import { PropertyDescriptor } from './property-descriptor.js';
import type { CoerceValue, PropertyMetadata, ValidateTarget, ValidateValue } from './property-descriptor.js';
import type { PropertyChangeCallback } from './binding/effective-value.js';
import { inherits, type MetaData } from './metadata.js';

// Branded handle returned by Observable.RegisterProperty (and the read-only /
// attached variants defined on MuralBase). Serves two purposes:
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

// Root of the property system. `Observable` owns the per-class descriptor
// registry (shared with every subclass, so `MuralBase.RegisterProperty`
// resolves the inherited static) and a LIGHT per-instance value store:
// two lazily-allocated maps and the typed-key accessor surface. It has
// no dependency-property / effective-value machinery — a bare `Observable`
// stores raw values and fires listeners on effective (post-coerce) change.
//
// `MuralBase` (in model.ts) extends `Observable` and OVERRIDES the
// instance accessors with its full EffectiveValueDescriptor implementation
// (base-value tiers, bindings, animation, triggers, inheritance). The
// static registry is inherited unchanged, so DP registration and lookup
// behave identically whether reached through `Observable` or `MuralBase`.
//
// Property storage uses composite keys `${descriptor.RootOwner.name}.${name}`
// uniformly (see PropertyDescriptor.ComposedKey). This lets any property
// registered on any class be set on any instance (WPF-style cross-class /
// "attached" usage).
export class Observable
{
    // ------------------------------------------------------------------
    // Static registry and lookup (shared by MuralBase via inheritance)
    // ------------------------------------------------------------------

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

    protected static get_property_bag(klass: Function): Map<string, PropertyDescriptor>
    {
        let bag = Observable.property_bags.get(klass);
        if (bag === undefined)
        {
            bag = new Map<string, PropertyDescriptor>();
            Observable.property_bags.set(klass, bag);
        }
        return bag;
    }

    // Non-creating peek used by Visual.collect_inheritable_descriptors —
    // iterating the prototype chain shouldn't allocate empty bags for
    // ancestors that never registered anything.
    protected static peek_property_bag(klass: Function): Map<string, PropertyDescriptor> | undefined
    {
        return Observable.property_bags.get(klass);
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
            const desc = Observable.property_bags.get(current)?.get(property);
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
        return Observable.find_descriptor(klass, property) !== undefined;
    }

    // Resolves a class-name string (e.g. 'Grid') to the registered class
    // object. Used by the PropertyPath parser for attached-property
    // syntax. Returns undefined if no such class has been registered, or
    // if the class has been garbage-collected.
    public static find_class(name: string): Function | undefined
    {
        const ref = Observable.class_registry.get(name);
        if (ref === undefined) return undefined;
        const cls = ref.deref();
        if (cls === undefined)
        {
            Observable.class_registry.delete(name);
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
            const bag = Observable.property_bags.get(current);
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

    protected static remember_class(klass: Function): void
    {
        Observable.class_registry.set(klass.name, new WeakRef(klass));
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
    //
    // Note: the inheritable-descriptor registry (the global set consumed
    // by Visual for cross-class inheritance) lives on `MuralBase`, which
    // overrides this method to also register inheritable descriptors.
    // A bare `Observable` has no inheritance machinery, so it only needs
    // the per-class bag + class-name registration here.
    public static RegisterProperty<T = unknown>(
        owner: Function,
        property: string,
        default_value: T,
        meta_data: MetaData,
        coerce_value?: CoerceValue,
        validate_value?: ValidateValue,
        validate_target?: ValidateTarget,
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
        Observable.remember_class(owner);
        const bag = Observable.get_property_bag(owner);
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
            if (validate_target !== undefined)
            {
                opts.validate_target = validate_target;
            }
            descriptor = new PropertyDescriptor(owner, property, opts);
            bag.set(property, descriptor);
            // Inheritable descriptors join the global registry so
            // Visual.collect_inheritable_descriptors can discover them
            // even when the property's owning class isn't in the
            // descendant's prototype chain. The registry lives on
            // MuralBase; on a bare Observable this is a no-op hook.
            if (inherits(meta_data))
            {
                this.register_inheritable(descriptor);
            }
        }
        return new PropertyKey<T>(descriptor);
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
        Observable.remember_class(owner);
        const bag = Observable.get_property_bag(owner);
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
        // Inheritable read-only DPs also join the global registry — same
        // shape as RegisterProperty above; the hook lives on MuralBase.
        if (inherits(meta_data))
        {
            this.register_inheritable(descriptor);
        }
        return new PropertyKey<T>(descriptor);
    }

    // Inheritable-descriptor registration hook. A bare `Observable` has
    // no inheritance machinery so this is a no-op; `MuralBase` overrides
    // it to add the descriptor to the global inheritable registry (and
    // bump the generation counter). Kept as a static so the shared
    // RegisterProperty / RegisterReadOnlyProperty bodies can funnel every
    // inheritable registration through one seam. `this` inside the
    // register methods resolves to the concrete static (Observable or
    // MuralBase) so the override is honored.
    protected static register_inheritable(_descriptor: PropertyDescriptor): void
    {
        // Bare Observable: nothing to track. MuralBase overrides.
    }

    // ------------------------------------------------------------------
    // Light per-instance value store
    //
    // Two lazily-allocated maps keyed by `descriptor.ComposedKey`. A
    // never-written, never-listened instance allocates neither map. This
    // is the minimal storage tier; MuralBase overrides every accessor
    // below with its EffectiveValueDescriptor implementation.
    // ------------------------------------------------------------------

    private _values?: Map<string, unknown>;
    private _listeners?: Map<string, PropertyChangeCallback[]>;

    public get_property_value<T>(key: PropertyKey<T>): T
    {
        const d = key.descriptor;
        const stored = this._values?.get(d.ComposedKey);
        const raw = stored !== undefined ? stored : d.DefaultValue;
        return (d.CoerceValue ? d.CoerceValue(this as unknown as never, raw) : raw) as T;
    }

    public set_property_value<T>(key: PropertyKey<T>, value: T): void
    {
        const d = key.descriptor;
        if (d.ValidateValue && !d.ValidateValue(value))
        {
            throw new Error(
                `Value rejected by validate_value for '${d.RootOwner.name}.${d.Name}'.`,
            );
        }
        const oldEff = this.get_property_value(key);
        (this._values ??= new Map()).set(d.ComposedKey, value);
        const newEff = this.get_property_value(key);
        if (oldEff !== newEff)
        {
            this.OnPropertyChanged(d, oldEff, newEff);
            const cbs = this._listeners?.get(d.ComposedKey);
            if (cbs) for (const cb of [...cbs]) cb(this as unknown as never, d.Name, oldEff, newEff);
        }
    }

    public AddPropertyChangedListener(key: PropertyKey<unknown>, callback: PropertyChangeCallback): void
    {
        const composed = key.descriptor.ComposedKey;
        const listeners = (this._listeners ??= new Map());
        let arr = listeners.get(composed);
        if (arr === undefined)
        {
            arr = [];
            listeners.set(composed, arr);
        }
        arr.push(callback);
    }

    public RemovePropertyChangedListener(key: PropertyKey<unknown>, callback: PropertyChangeCallback): void
    {
        const arr = this._listeners?.get(key.descriptor.ComposedKey);
        if (arr === undefined) return;
        const i = arr.indexOf(callback);
        if (i >= 0) arr.splice(i, 1);
    }

    // Virtual hook fired after every effective-value change on this
    // instance. No-op at the Observable layer; MuralBase overrides it to
    // route invalidation / inheritance through the EVD system.
    protected OnPropertyChanged(_descriptor: PropertyDescriptor, _old_value: unknown, _new_value: unknown): void
    {
        // Pure storage layer — nothing to do.
    }
}
