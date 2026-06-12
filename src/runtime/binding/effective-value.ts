import { Binding, BindingMode } from './binding.js';
import { isAnimationProhibited, isNotDataBindable } from '../metadata.js';
import type { Model } from '../model.js';
import type { PropertyDescriptor } from '../property-descriptor.js';
import { Validation } from './validation.js';

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

// Where the effective value came from. Read via Model.GetValueSource(key).
//
// Priority order (highest to lowest):
//   Coerced > Animated > Trigger > Binding > Local > Style > Inherited > Default
//
// Deviation from WPF: mural promotes Trigger ABOVE Binding and Local.
// In WPF the order is Local > Trigger, but mural's `.mu` templates emit
// per-part defaults via the factory's `_set_property_value_by_name`
// calls (LocalValue tier) and then express state-driven overrides
// (`when ( IsMouseOver ) { PART_Border.Background = … }`) via
// TemplatePropertyTrigger — which writes at TriggerValue. With the WPF
// order those state triggers were invisible (LocalValue blocked them),
// so every templated control's hover / press / IsChecked feedback
// silently broke. Promoting Trigger above Local matches the way
// authors write templates here, at the cost of consumers no longer
// being able to write `widget.Background = brush` over an active
// trigger.
//
// The enum values themselves don't encode priority — the EVD's `value`
// getter and the various Set / Clear methods encode the priority via
// their dispatch.
export enum PropertyValueSource
{
    AnimatedValue,
    LocalValue,
    Binding,
    CoercedValue,
    TriggerValue,
    StyleValue,
    InheritedValue,
    Default
}

// Per-instance state for one registered property. Holds the base-value
// slots (animated / binding / local / trigger / style / inherited), the
// current base source, and the per-instance change listeners. Created
// lazily by Model on first set or first listener attach.
//
// Coercion is NOT a base slot — it's a pure transform applied on every
// `value` read (and on binding push notifications). The descriptor's
// `CoerceValue` callback runs against whichever base slot wins; the
// resulting value is what listeners and `value` consumers see. When
// coerce is registered AND its result differs from the base, `Source`
// reports `CoercedValue`; otherwise it reports the base source.
export class EffectiveValueDescriptor
{
    private local_value: any;
    private has_local_value: boolean = false;
    private binding_value: Binding | undefined;
    private animated_value: any;
    private has_animated_value: boolean = false;
    // Style / Trigger / Inherited slots use parallel flags because
    // `undefined` is a legitimate value (a style setter MAY want to
    // set a property to undefined explicitly, distinct from "no style
    // value cached"; the inherited cache must distinguish "ancestor
    // resolved to undefined" from "no ancestor value at all" for the
    // fall-through chain in ClearStyleValue / ClearTriggerValue /
    // ClearValue).
    //
    // Local + Animated also carry has_* flags. Local distinguishes
    // "user explicitly wrote undefined" from "never set"; Animated lets
    // ClearAnimatedValue know whether there was a slot to drop at all.
    private trigger_value: any;
    private has_trigger_value: boolean = false;
    private style_value: any;
    private has_style_value: boolean = false;
    private inherited_value: any;
    private has_inherited_value: boolean = false;

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

    // Reports the effective source. When a CoerceValue callback is
    // registered AND its result differs from the underlying base value,
    // returns CoercedValue (matches WPF — the diagnostic "this isn't
    // what you set"). Otherwise returns the base source.
    get Source(): PropertyValueSource
    {
        const coerce = this.property_descriptor.CoerceValue;
        if (coerce !== undefined)
        {
            const base = this.compute_base_value();
            if (coerce(this.owner, base) !== base)
            {
                return PropertyValueSource.CoercedValue;
            }
        }
        return this.source;
    }

    // Resets every base-value slot, disposes any active binding, drops the
    // source to the next-lower priority slot still set (style → inherited
    // → default), and fires a change notification if the effective value
    // differed. Listeners on this EVD are preserved. Note: doesn't touch
    // the style or inherited caches — those are managed by the style
    // machinery and the inheritance machinery respectively.
    ClearValue(): void
    {
        const old_effective_value = this.value;

        if (this.binding_value !== undefined)
        {
            this.binding_value.dispose();
            this.binding_value = undefined;
        }
        this.local_value = undefined;
        this.has_local_value = false;
        this.animated_value = undefined;
        this.has_animated_value = false;
        this.source = this.has_trigger_value
            ? PropertyValueSource.TriggerValue
            : this.has_style_value
                ? PropertyValueSource.StyleValue
                : this.has_inherited_value
                    ? PropertyValueSource.InheritedValue
                    : PropertyValueSource.Default;

        const new_effective_value = this.value;
        if (old_effective_value !== new_effective_value)
        {
            this.OnPropertyChange(old_effective_value, new_effective_value);
        }
    }

    // Caches the inherited value resolved from an ancestor. ALWAYS
    // updates the cached slot — even when a higher-priority source is
    // currently active — so a later clear of that higher source falls
    // through to a fresh inherited value rather than a stale one
    // captured before the higher source was installed. The source flip
    // and change-notification only fire when no higher-priority source
    // is masking inheritance.
    SetInheritedValue(value: any): void
    {
        const old_effective_value = this.value;
        this.inherited_value = value;
        this.has_inherited_value = true;

        // Higher-priority source active: cache is updated but stays
        // invisible until that source clears. No source flip, no
        // notification.
        if (this.source !== PropertyValueSource.InheritedValue
            && this.source !== PropertyValueSource.Default)
        {
            return;
        }
        this.source = PropertyValueSource.InheritedValue;
        const new_effective_value = this.value;
        if (old_effective_value !== new_effective_value)
        {
            this.OnPropertyChange(old_effective_value, new_effective_value);
        }
    }

    // Caches a Style-driven value for this property. Style sits below
    // LocalValue / Binding / Animated / Coerced / Trigger in the
    // priority stack — if one of those is active, the style value is
    // stored but the current source stays unchanged (style takes over
    // later if the higher-priority source is cleared). Fires change
    // notification when the effective value actually changes.
    SetStyleValue(value: any): void
    {
        const old_effective_value = this.value;
        this.style_value = value;
        this.has_style_value = true;
        if (this.source === PropertyValueSource.LocalValue
            || this.source === PropertyValueSource.Binding
            || this.source === PropertyValueSource.AnimatedValue
            || this.source === PropertyValueSource.TriggerValue)
        {
            return;
        }
        this.source = PropertyValueSource.StyleValue;
        const new_effective_value = this.value;
        if (old_effective_value !== new_effective_value)
        {
            this.OnPropertyChange(old_effective_value, new_effective_value);
        }
    }

    // Drops the style slot. If Style was the current source, falls
    // through to InheritedValue (if cached) or Default. Higher-
    // priority sources are unaffected.
    ClearStyleValue(): void
    {
        if (!this.has_style_value) return;
        const old_effective_value = this.value;
        this.style_value = undefined;
        this.has_style_value = false;
        if (this.source === PropertyValueSource.StyleValue)
        {
            this.source = this.has_inherited_value
                ? PropertyValueSource.InheritedValue
                : PropertyValueSource.Default;
        }
        const new_effective_value = this.value;
        if (old_effective_value !== new_effective_value)
        {
            this.OnPropertyChange(old_effective_value, new_effective_value);
        }
    }

    // Caches a Trigger-driven value for this property. Trigger sits
    // above Binding / Local / Style / Inherited / Default; only
    // Animated and Coerced outrank it. Same pattern as SetStyleValue
    // otherwise — stash regardless, but only flip source if no higher-
    // priority slot is active.
    SetTriggerValue(value: any): void
    {
        const old_effective_value = this.value;
        this.trigger_value = value;
        this.has_trigger_value = true;
        if (this.source === PropertyValueSource.AnimatedValue)
        {
            return;
        }
        this.source = PropertyValueSource.TriggerValue;
        const new_effective_value = this.value;
        if (old_effective_value !== new_effective_value)
        {
            this.OnPropertyChange(old_effective_value, new_effective_value);
        }
    }

    // Drops the trigger slot. If Trigger was the current source,
    // falls through to Binding (live binding still installed), then
    // LocalValue, then StyleValue, then InheritedValue, then Default.
    // Higher-priority sources (Animated) are unaffected.
    ClearTriggerValue(): void
    {
        if (!this.has_trigger_value) return;
        const old_effective_value = this.value;
        this.trigger_value = undefined;
        this.has_trigger_value = false;
        if (this.source === PropertyValueSource.TriggerValue)
        {
            this.source = this.binding_value !== undefined
                ? PropertyValueSource.Binding
                : this.has_local_value
                    ? PropertyValueSource.LocalValue
                    : this.has_style_value
                        ? PropertyValueSource.StyleValue
                        : this.has_inherited_value
                            ? PropertyValueSource.InheritedValue
                            : PropertyValueSource.Default;
        }
        const new_effective_value = this.value;
        if (old_effective_value !== new_effective_value)
        {
            this.OnPropertyChange(old_effective_value, new_effective_value);
        }
    }

    // Drops the inherited cache. If InheritedValue was the current
    // source, falls through to Default. ALWAYS clears the cached slot
    // — even when a higher-priority source is masking inheritance —
    // so a later clear of that higher source falls through to Default
    // rather than to a stale inherited value the ancestor no longer
    // provides. Used when the ancestor chain no longer carries a
    // value (after Detach or when an ancestor's value was cleared).
    ClearInherited(): void
    {
        if (!this.has_inherited_value) return;
        const old_effective_value = this.value;
        this.inherited_value = undefined;
        this.has_inherited_value = false;
        if (this.source !== PropertyValueSource.InheritedValue) return;
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
        // IsNotDataBindable gate: structural DPs (Style.TargetType,
        // DataTemplate.DataType, Setter.Property, …) refuse Binding
        // installs at the call site rather than producing weird
        // downstream behavior when the binding resolves to something
        // the framework can't interpret. Direct value writes go
        // through unchanged.
        if (val instanceof Binding && isNotDataBindable(this.property_descriptor.MetaData))
        {
            throw new Error(
                `Property '${this.property_descriptor.RootOwner.name}.${this.property_descriptor.Name}' is marked IsNotDataBindable — Binding installs are rejected.`,
            );
        }

        const old_effective_value = this.value;

        // TwoWay / OneWayToSource writeback: route non-Binding writes
        // through the installed binding instead of replacing it.
        if (!(val instanceof Binding)
            && this.binding_value !== undefined
            && (this.binding_value.mode === BindingMode.TwoWay
             || this.binding_value.mode === BindingMode.OneWayToSource))
        {
            // Validation gate: any failing rule blocks the writeback
            // and surfaces the errors on the target via Validation
            // attached properties. The source keeps its previous
            // value; consumers see the target's previous value too
            // (no OnPropertyChange fires).
            if (this.binding_value.HasValidationRules)
            {
                const errors = this.binding_value.Validate(val);
                Validation.SetErrors(this.owner, this.binding_value, errors);
                if (errors.length > 0) return;
            }
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
            // Clear any validation errors the old binding had set on
            // the target — the binding is no longer the source of
            // truth for those errors.
            if (this.binding_value.HasValidationRules)
            {
                Validation.SetErrors(this.owner, this.binding_value, []);
            }
            this.binding_value.dispose();
            this.binding_value = undefined;
        }

        if (val instanceof Binding)
        {
            // Resolve default mode against the target property's metadata
            // BEFORE any reads of binding.mode (push-callback handler below
            // and any subsequent writeback). Bindings without an explicit
            // mode pick up TwoWay when the target declares
            // BindsTwoWayByDefault; explicit modes are preserved.
            val.ResolveDefaultMode(this.property_descriptor);
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
                const old_final = this.apply_coerce(val.apply_transform(old_resolved));
                const new_final = this.apply_coerce(val.apply_transform(new_resolved));
                // Validation on every push: source-side reads update
                // the target's error state but the value still flows
                // through to consumers (per the chosen scope).
                if (val.HasValidationRules)
                {
                    Validation.SetErrors(this.owner, val, val.Validate(new_final));
                }
                if (old_final !== new_final)
                {
                    this.OnPropertyChange(old_final, new_final);
                }
            });
            // Collection-as-leaf pulse: the binding's source path
            // resolves to a collection (ObservableCollection or
            // observable-array proxy) and its contents change. The
            // value identity hasn't shifted — bypassing the dedup
            // above is exactly the point. Listeners fire with
            // (coll, coll) so a consumer bound to the collection
            // sees PropertyChanged on every mutation, mirroring
            // INotifyCollectionChanged.
            val.setOnCollectionPulse(() =>
            {
                const v = this.value;
                this.OnPropertyChange(v, v);
            });
            // Animation AND active triggers stay on top — the binding
            // cache updates so a later Stop / ClearTriggerValue /
            // ClearAnimated falls through to the fresh binding, but
            // the visible source stays at the higher tier until that
            // clears.
            if (this.source === PropertyValueSource.AnimatedValue
                || this.source === PropertyValueSource.TriggerValue)
            {
                return;
            }
            this.source = PropertyValueSource.Binding;
            // New value reads through `this.value` so coerce (if any)
            // is applied; listeners see the same values consumers do.
            const new_effective_value = this.value;
            // Initial validation pass on install so the target's
            // Validation state reflects the freshly-resolved value
            // before any push notification fires.
            if (val.HasValidationRules)
            {
                Validation.SetErrors(this.owner, val, val.Validate(new_effective_value));
            }
            this.OnPropertyChange(old_effective_value, new_effective_value);
        }
        else
        {
            this.local_value = val;
            this.has_local_value = true;
            // Local writes are NOT visible while an animation OR an
            // active trigger shadows them. Mural's priority order
            // (Animated > Trigger > Binding > Local) intentionally
            // deviates from WPF's (Local > Trigger) so template
            // factories can set per-part defaults while state-driven
            // triggers in the same template still take effect. The
            // local slot still updates so that ClearAnimatedValue /
            // ClearTriggerValue drops back to the freshest user-
            // written value, not a stale snapshot.
            if (this.source === PropertyValueSource.AnimatedValue
                || this.source === PropertyValueSource.TriggerValue)
            {
                return;
            }
            this.source = PropertyValueSource.LocalValue;
            // Coerce applied via `this.value` — clamped/normalized
            // values reach listeners, not the raw write.
            this.OnPropertyChange(old_effective_value, this.value);
        }
    }

    // ── Animated slot ──────────────────────────────────────────────────

    // Pin a value on the Animated slot. Animation overrides Binding /
    // Local / Trigger / Style / Inherited / Default (highest priority
    // among the base-value sources — Coerced still wins). Used by
    // Storyboard.AdvanceTo every clock tick; consumers normally drive
    // it indirectly via Visual.BeginAnimation / Storyboard.Add. Calling
    // it directly is a valid escape hatch but the slot is then nobody's
    // responsibility to release.
    SetAnimatedValue(value: any): void
    {
        if (isAnimationProhibited(this.property_descriptor.MetaData))
        {
            throw new Error(
                `Property '${this.property_descriptor.RootOwner.name}.${this.property_descriptor.Name}' is marked IsAnimationProhibited — animation writes are rejected.`,
            );
        }
        const old_effective_value = this.value;
        this.animated_value = value;
        this.has_animated_value = true;
        // Coerced stays on top — animations don't override the coercion
        // pass (coercion is the final word on what's writable). The
        // animation cache still updates so that ClearCoerced (when it
        // lands) falls through to the animated value.
        if (this.source === PropertyValueSource.CoercedValue) return;
        this.source = PropertyValueSource.AnimatedValue;
        const new_effective_value = this.value;
        if (old_effective_value !== new_effective_value)
        {
            this.OnPropertyChange(old_effective_value, new_effective_value);
        }
    }

    // Drop the Animated slot. If Animated was the current source, falls
    // through to Trigger / Binding / Local / Style / Inherited / Default
    // in priority order — whichever slot is still set wins. The
    // underlying value is whatever was last written to those slots
    // BEFORE / DURING the animation (the value setter keeps trigger /
    // local / binding caches fresh under the animated mask), so the
    // post-ClearAnimatedValue effective value matches the highest-
    // priority slot still set.
    ClearAnimatedValue(): void
    {
        if (!this.has_animated_value) return;
        const old_effective_value = this.value;
        this.animated_value = undefined;
        this.has_animated_value = false;
        if (this.source === PropertyValueSource.AnimatedValue)
        {
            this.source = this.has_trigger_value
                ? PropertyValueSource.TriggerValue
                : this.binding_value !== undefined
                    ? PropertyValueSource.Binding
                    : this.has_local_value
                        ? PropertyValueSource.LocalValue
                        : this.has_style_value
                            ? PropertyValueSource.StyleValue
                            : this.has_inherited_value
                                ? PropertyValueSource.InheritedValue
                                : PropertyValueSource.Default;
        }
        const new_effective_value = this.value;
        if (old_effective_value !== new_effective_value)
        {
            this.OnPropertyChange(old_effective_value, new_effective_value);
        }
    }

    // The effective value: the highest-priority base entry (Animated >
    // Binding > Local > Trigger > Style > Inherited > Default), then
    // the descriptor's CoerceValue callback (if any) applied on top.
    // Coerce runs on every read so a write to a coerce-influencing
    // sibling property is reflected on the next access without any
    // explicit "recoerce" call.
    get value(): any
    {
        return this.apply_coerce(this.compute_base_value());
    }

    // Highest-priority base slot, excluding coercion. Source enum cases
    // map 1:1 to slots; the field `source` never holds CoercedValue
    // (coercion is a transform, not a base slot).
    private compute_base_value(): any
    {
        switch (this.source)
        {
            case PropertyValueSource.AnimatedValue:
                return this.animated_value;
            case PropertyValueSource.Binding:
                return this.binding_value!.get_value();
            case PropertyValueSource.LocalValue:
                return this.local_value;
            case PropertyValueSource.TriggerValue:
                return this.trigger_value;
            case PropertyValueSource.StyleValue:
                return this.style_value;
            case PropertyValueSource.InheritedValue:
                return this.inherited_value;
            default:
                return this.property_descriptor.DefaultValue;
        }
    }

    // Apply the descriptor's coerce callback if one is registered.
    // Used by the value getter and the binding push handler so consumer
    // listeners see the same values `value` returns.
    private apply_coerce(base: any): any
    {
        const coerce = this.property_descriptor.CoerceValue;
        return coerce !== undefined ? coerce(this.owner, base) : base;
    }
}
