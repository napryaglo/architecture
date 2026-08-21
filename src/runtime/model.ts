import { Binding } from './binding/binding.js';
import { EffectiveValueDescriptor, PropertyValueSource } from './binding/effective-value.js';
import type { InternalPropertyChangeCallback, PropertyChangeCallback } from './binding/effective-value.js';
import { Observable, PropertyKey } from './observable.js';
import { PropertyDescriptor } from './property-descriptor.js';
import type { CoerceValue, PropertyMetadata, ValidateTarget, ValidateValue } from './property-descriptor.js';
import type { MetaData } from './metadata.js';

// Re-exported for the many consumers that import `PropertyKey` from
// `./model.js`. Its definition moved to `observable.ts` (alongside the
// static registry that mints it) to keep `Observable` self-contained and
// avoid a `model.ts ↔ observable.ts` import cycle; this re-export keeps
// every existing `import { PropertyKey } from './model.js'` working.
export { PropertyKey } from './observable.js';

// The dependency-property model. `MuralBase` extends `Observable` (which
// owns the per-class descriptor registry and a light instance store) and
// OVERRIDES the instance accessors with a full effective-value
// implementation: per-instance `property_values` (EffectiveValueDescriptor
// slots) and a virtual OnPropertyChanged hook that fires for every
// effective-value change. The base hook is a no-op; Visual (in visual.ts)
// overrides it to route layout/render invalidation and property value
// inheritance through the visual tree.
//
// The static registry (`RegisterProperty`, `find_descriptor`,
// `compose_key`, `find_class`, …) is inherited from `Observable`
// unchanged — `MuralBase.RegisterProperty(...)` resolves the inherited
// static, so existing call sites are unaffected. `MuralBase` keeps the
// DP-only statics: `RegisterAttachedProperty`, `OverrideMetadata`, and
// the inheritable-descriptor registry (which it wires in by overriding
// `Observable.register_inheritable`).
//
// Property storage uses composite keys `${descriptor.RootOwner.name}.${name}`
// uniformly. This lets any property registered on any class be set on
// any MuralBase instance (WPF-style cross-class / "attached" usage). The
// accessors expose two surfaces:
//   * implicit owner — `set_property_value('width', 100)` walks the
//     target's class hierarchy to find the property, then composes the
//     key from descriptor.RootOwner.
//   * explicit owner — `set_property_value(TextBlock, 'fontSize', 14)`
//     bypasses the hierarchy walk; uses the supplied owner directly.
export class MuralBase extends Observable
{
    // Global registry of every PropertyDescriptor whose registered
    // metadata includes `MetaData.Inherits` (§ 15.2). Populated at
    // RegisterProperty time; consumed by `Visual.collect_inheritable_descriptors`
    // to discover cross-class inheritable attached properties whose
    // owning class isn't in the target Visual's prototype chain. Without
    // this registry, an inheritable attached property registered on, say,
    // `Border` would never be visible to descendants whose class chain
    // doesn't pass through Border, since the per-class bag walk would
    // skip Border's bag entirely.
    //
    // Set vs. Map: descriptors are unique per (owner, property) pair —
    // identity-based lookup is fine. WeakSet would let us drop entries
    // for descriptors whose owning class is GC'd, but PropertyDescriptor
    // holds a strong reference to its owner already, so a regular Set
    // keeps the lookup cheap without leaking. The set is module-static
    // — there is no per-Application registry of inheritable properties.
    private static inheritable_descriptors: Set<PropertyDescriptor> = new Set();

    // Monotonic counter bumped every time a NEW inheritable descriptor
    // joins the registry (RegisterProperty / RegisterReadOnlyProperty with
    // MetaData.Inherits). Consumers that memoize a derived view of the
    // inheritable-property universe — `Visual._collect_inheritable_descriptors`
    // caches its per-class result — key their cache on this generation so a
    // late inheritable registration invalidates every stale entry. In
    // practice all registration happens at module-load time, before any
    // tree exists, so the generation settles once and caches never miss;
    // the counter exists only to keep the memo correct if that ever changes.
    private static inheritable_generation: number = 0;

    // Overrides `Observable.register_inheritable` — the seam the inherited
    // RegisterProperty / RegisterReadOnlyProperty bodies funnel every
    // inheritable registration through. Because those static register
    // methods call `this.register_inheritable(...)` and DP registration
    // runs through `MuralBase.RegisterProperty` (this class), `this`
    // resolves to `MuralBase` and this override tracks the descriptor.
    // Only a genuinely new descriptor bumps the generation — re-adding an
    // existing one (Set no-op) leaves memo caches valid.
    protected static override register_inheritable(descriptor: PropertyDescriptor): void
    {
        const before = MuralBase.inheritable_descriptors.size;
        MuralBase.inheritable_descriptors.add(descriptor);
        if (MuralBase.inheritable_descriptors.size !== before) MuralBase.inheritable_generation++;
    }

    /** @internal — Visual.collect_inheritable_descriptors reads this
     *  to union the global cross-class inheritable property set with
     *  the target's class-chain walk. Consumers outside `Visual` should
     *  not depend on the registry shape. */
    public static _getInheritableDescriptors(): ReadonlySet<PropertyDescriptor>
    {
        return MuralBase.inheritable_descriptors;
    }

    /** @internal — memoization key for `_collect_inheritable_descriptors`.
     *  Changes iff the set of inheritable descriptors changed, so a cached
     *  per-class descriptor list is valid exactly while this is unchanged. */
    public static _inheritableGeneration(): number
    {
        return MuralBase.inheritable_generation;
    }

    // Per-instance value store keyed by composite `${RootOwner.name}.${name}`.
    // Protected so Visual's inheritance helpers can walk parent state.
    protected property_values: Map<string, EffectiveValueDescriptor> = new Map();

    constructor()
    {
        super();
    }

    // ------------------------------------------------------------------
    // Static registry and lookup
    //
    // The core registry — `property_bags` / `class_registry`,
    // `get_property_bag`, `peek_property_bag`, `compose_key`,
    // `find_descriptor`, `HasProperty`, `find_class`, `EnumerateProperties`,
    // `remember_class`, `RegisterProperty`, `RegisterReadOnlyProperty` —
    // moved to `Observable` and is inherited unchanged. `MuralBase` keeps
    // the DP-only statics below: `RegisterAttachedProperty`,
    // `OverrideMetadata`, and the inheritable-descriptor registry
    // (wired in via the `register_inheritable` override above).
    // ------------------------------------------------------------------

    // Sugar synonym for RegisterProperty at attached-property declaration
    // sites. Same runtime — any registered property can be set on any
    // MuralBase via the explicit-owner overload of set_property_value — but
    // exposes one extra parameter (`validate_target`) that's primarily
    // useful for attached properties.
    //
    // `validate_target` (§ 15.1): when set, every write to this property
    // on ANY target MuralBase passes through the predicate first. Returning
    // `false` throws with a "property only valid on …" message. Used to
    // constrain attached properties to specific target families — e.g.
    // `Grid.Row` only makes sense on Visuals laid out by a Grid parent,
    // so its registration can declare `validateTargetTypes(Visual)`.
    // Helper exported from runtime/property-descriptor.js.
    public static RegisterAttachedProperty<T = unknown>(
        owner: Function,
        property: string,
        default_value: T,
        meta_data: MetaData,
        coerce_value?: CoerceValue,
        validate_value?: ValidateValue,
        validate_target?: ValidateTarget,
    ): PropertyKey<T>
    {
        return MuralBase.RegisterProperty<T>(
            owner, property, default_value, meta_data,
            coerce_value, validate_value, validate_target,
        );
    }

    // (RegisterReadOnlyProperty moved to `Observable` and is inherited.)

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
        MuralBase.remember_class(klass);
        const property = key.descriptor.Name;
        const bag = MuralBase.get_property_bag(klass);
        const parent_descriptor = bag.get(property)
            ?? MuralBase.find_descriptor(Object.getPrototypeOf(klass) as Function, property);
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
    // accessor — `model.get_property_value(Border.FillKey)`,
    // `model.set_property_value(Border.FillKey, brush)`, etc.
    // The phantom `T` on `PropertyKey<T>` makes a typo at the call site
    // a compile error and threads the value type through the accessor
    // signature so no `as T` cast is needed.
    //
    // There is no by-name accessor on `MuralBase`. The µ-mural compiler
    // resolves every markup property write to a typed key at compile
    // time (`compileAttribute` in `src/compiler/compiler.ts` queries
    // `MuralBase.find_class` + `findDescriptor` and emits `Owner.PropKey`).
    // Framework-internal hot paths (binding, Style.Setter / Trigger,
    // animation, trigger evaluators) resolve names through
    // [./model-internals.ts](./model-internals.ts)'s `resolveKey`
    // helper at install time and cache the resulting `PropertyKey`.
    // ------------------------------------------------------------------

    // Typed-key public API ---------------------------------------------

    public override AddPropertyChangedListener(key: PropertyKey<unknown>, callback: PropertyChangeCallback): void
    {
        this.ensure_effective_value_for(key.descriptor).AddChangeListener(callback);
    }

    public override RemovePropertyChangedListener(key: PropertyKey<unknown>, callback: PropertyChangeCallback): void
    {
        const composed = key.descriptor.ComposedKey;
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

    // Drops the entire EffectiveValueDescriptor slot for `key` — value,
    // binding, animated slot, change listeners, internal callback. Future
    // reads fall back to the registered default; a future write creates
    // a fresh EVD slot.
    //
    // Use case: per-target memory reclamation when a property has been
    // set (or had listeners attached) on this instance but won't be
    // again — virtualized list containers shedding their per-item
    // bookkeeping at recycle time, for example. ClearValue alone
    // preserves the EVD slot (Map entry, listeners array, base-source
    // slots) so the property stays observable; RemoveValue throws the
    // whole slot away.
    //
    // Returns true when an EVD slot was actually deleted, false when
    // the property was never observed on this instance (already at
    // default with no slot to free). Calling on a never-touched
    // property is a cheap no-op.
    //
    // Safety: any active binding is disposed BEFORE the slot is dropped
    // so the binding doesn't keep firing into a freed EVD. Change
    // listeners are silently discarded — they were registered against
    // an EVD identity that no longer exists, and a fresh EVD created by
    // a future write has its own listener list. Callers that need to
    // preserve listeners should call ClearValue instead.
    public RemoveValue<T>(key: PropertyKey<T>): boolean
    {
        this.require_writable(key.descriptor);
        return this.remove_via_descriptor(key.descriptor);
    }

    // Privileged RemoveValue for read-only properties — same shape as
    // ClearValueWithKey vs. ClearValue.
    public RemoveValueWithKey(key: PropertyKey<unknown>): boolean
    {
        return this.remove_via_descriptor(key.descriptor);
    }

    public GetValueSource<T>(key: PropertyKey<T>): PropertyValueSource
    {
        const composed = key.descriptor.ComposedKey;
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
        const composed = key.descriptor.ComposedKey;
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
        const composed = key.descriptor.ComposedKey;
        this.property_values.get(composed)?.ClearAnimatedValue();
    }

    public override get_property_value<T>(key: PropertyKey<T>): T
    {
        const composed = key.descriptor.ComposedKey;
        const evd = this.property_values.get(composed);
        if (evd !== undefined) return evd.value;
        // Default-value fallback walks this instance's class chain so
        // MuralBase.OverrideMetadata on a subclass is honored. The key's
        // own descriptor is the root-owner registration â€” fine as the
        // last-resort fallback when no subclass override exists.
        const descriptor = MuralBase.find_descriptor(this.constructor, key.descriptor.Name)
                        ?? key.descriptor;
        return this.resolve_default(descriptor);
    }

    public override set_property_value<T>(key: PropertyKey<T>, value: T): void
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

    private clear_via_descriptor(descriptor: PropertyDescriptor): void
    {
        const key = descriptor.ComposedKey;
        const evd = this.property_values.get(key);
        if (evd !== undefined)
        {
            evd.ClearValue();
        }
        // Registered but never set — already at default. No-op.
    }

    private remove_via_descriptor(descriptor: PropertyDescriptor): boolean
    {
        const key = descriptor.ComposedKey;
        const evd = this.property_values.get(key);
        if (evd === undefined) return false;
        // Dispose any active binding FIRST. ClearValue would have done
        // this for us, but it also leaves the slot in place + fires
        // listener notifications for the synthetic default-value
        // restoration — wasted work when we're about to delete the
        // whole EVD. Reach through the same path effective-value uses
        // internally so binding lifecycle stays consistent.
        evd.ClearValue();
        this.property_values.delete(key);
        return true;
    }

    // ------------------------------------------------------------------
    // Shared cores
    // ------------------------------------------------------------------

    private require_writable(descriptor: PropertyDescriptor): void
    {
        if (descriptor.IsReadOnly)
        {
            throw new Error(
                `Property '${descriptor.Name}' is read-only — write via the PropertyKey returned from MuralBase.RegisterReadOnlyProperty.`,
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

    private set_via_descriptor(descriptor: PropertyDescriptor, value: any): void
    {
        // Validate-target gate (§ 15.1). Runs FIRST so a misuse of an
        // attached property surfaces before any other side effect. Only
        // attached properties declare a validate_target predicate;
        // regular DPs leave it undefined and skip this check.
        const validateTarget = descriptor.ValidateTarget;
        if (validateTarget !== undefined && !validateTarget(this))
        {
            throw new Error(
                `Property '${descriptor.RootOwner.name}.${descriptor.Name}' is not valid on `
                + `target of type '${this.constructor.name}' — its registered validate_target `
                + `predicate rejected the assignment.`,
            );
        }

        // Validate-value gate runs second (before storage / coerce /
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

        const key = descriptor.ComposedKey;
        let effective_value = this.property_values.get(key);

        if (effective_value === undefined)
        {
            effective_value = this.new_effective_value(descriptor);
            this.property_values.set(key, effective_value);
        }

        // Pre-write event fan-out (§ 1.14). Fires before the
        // base-value tier is updated, regardless of whether a
        // higher-priority tier (Animated, Trigger) currently masks
        // the effective value. `OnPropertyChanged` only fires when
        // the EFFECTIVE value changes, which means a Local write
        // that's masked by an active animation never reaches
        // OnPropertyChanged — but the implicit-transition engine
        // on Visual still needs to see it so a re-write mid-animation
        // can re-target. Subscribers register via
        // `AddBaseValueWriteListener` for "fires on every raw write"
        // semantics; Visual's constructor self-subscribes to drive
        // the implicit-transition engine.
        if (this._baseValueWriteListeners !== undefined)
        {
            for (const fn of this._baseValueWriteListeners) fn(descriptor, value);
        }

        // Raw value is stored; coerce runs on every read via EVD.value.
        // WPF semantics: coerce never sees its previous output as input,
        // so a clamp like `min(x, ceiling)` works idempotently even when
        // `ceiling` later widens.
        effective_value.value = value;
    }

    // § 1.14 — Pre-write listener registry. Replaces the prior
    // `OnBeforeBaseValueWrite` protected virtual: subclasses don't
    // have to override an inherited method they didn't ask for, and
    // the coupling reads as a real event ("MuralBase emits a
    // base-value-write-request, transitions engine subscribes")
    // rather than "Visual override carries EVD tier knowledge."
    private _baseValueWriteListeners: Set<(d: PropertyDescriptor, v: any) => void> | undefined;

    /** Subscribe to the pre-write event. Listener fires every time
     *  `set_via_descriptor` lands a base-tier write (Local / Binding
     *  / Style), regardless of whether a higher-priority tier
     *  (Animated, Trigger, Coerced) currently masks the effective
     *  value. Returns an unsubscribe thunk. */
    public AddBaseValueWriteListener(fn: (descriptor: PropertyDescriptor, value: any) => void): () => void
    {
        (this._baseValueWriteListeners ??= new Set()).add(fn);
        return () => { this._baseValueWriteListeners?.delete(fn); };
    }

    // Returns the EVD for the given descriptor, creating it lazily at
    // Default source if no value has been set yet. Used by listener
    // attach paths and by Visual's inheritance refresh.
    protected ensure_effective_value_for(descriptor: PropertyDescriptor): EffectiveValueDescriptor
    {
        const key = descriptor.ComposedKey;
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
    // (direct set, binding push, ClearValue, etc.). No-op at the MuralBase
    // layer; Visual overrides this to route invalidation and inheritance.
    protected override OnPropertyChanged(_descriptor: PropertyDescriptor, _old_value: any, _new_value: any): void
    {
        // Pure storage layer — nothing to do. Visual override handles
        // Mark*Dirty dispatch and inheritance propagation.
    }
}
