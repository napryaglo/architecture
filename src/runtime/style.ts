import { Application } from './application.js';
import type { Binding } from './binding/binding.js';
import { ResourceDictionary, type ResourceKey } from './resource-dictionary.js';
import type { TriggerAction } from './trigger-actions.js';
import type { EventTrigger } from './event-trigger.js';
import type { Visual } from '../visual-engine/visual.js';

// Factory that produces a fresh Binding per styled target. DataTrigger /
// MultiDataTrigger accept these to support sources beyond DataContext
// paths (ElementName, RelativeSource, Source, converters). One factory
// invocation per target, so the per-target setOnValueChanged callback
// can't accidentally cross-wire two styled visuals.
export type DataTriggerBindingFactory = (target: Visual) => Binding;

// Wrapper that defers Setter / Trigger value creation until the style
// is applied to a specific target. Use when the value needs the
// target instance (e.g. `DynamicResource(target, 'Accent')`) or when
// the value carries per-target state (e.g. a fresh `Binding` whose
// `setOnValueChanged` callback must be unique per target).
//
// Without this wrapper, sharing a Binding across two Visuals that
// both apply the same Style would have them overwrite each other's
// listeners — the second target's binding update would silently
// detach the first. SetterFactory sidesteps the issue by creating
// a fresh value per target.
export class SetterFactory<T = unknown>
{
    constructor(public readonly create: (target: Visual) => T) {}
}

// A property assignment within a Style. Applied to a Visual via
// EVD.SetStyleValue, which puts it in the Style priority tier
// (LocalValue / Binding / Animated / Coerced shadow it; Trigger /
// Inherited / Default sit below).
//
// `owner` is the class on which the property is registered. Explicit
// always — required so cross-class / attached-property setters work
// cleanly (Setter(Canvas, 'Left', 20) on a Visual, etc.). The same
// (owner, property) pair in a derived Style overrides a base Setter
// in ResolveSetters.
//
// `value` may be:
//   * A plain literal — installed as-is at StyleValue priority.
//   * A `Binding` — installed reactively; the resolved value is
//     pushed to the StyleValue slot on every binding-source change.
//     For per-target safety prefer wrapping in SetterFactory.
//   * A `SetterFactory` — invoked with the target Visual at apply
//     time; the result is treated as one of the above. Use for
//     DynamicResource (needs target) or Binding (needs fresh
//     per-target callback).
export class Setter
{
    constructor(
        public readonly owner: Function,
        public readonly property: string,
        public readonly value: unknown,
    ) {}
}

// Conditional setter group — when the target Visual's
// (propertyOwner, propertyName) property equals `value`, the
// trigger's setters are applied at the Trigger priority tier (above
// StyleValue, below LocalValue). When the property changes such that
// the trigger no longer matches, the trigger's setters are
// unapplied and the underlying StyleValue / InheritedValue takes
// over again.
//
// Triggers are evaluated synchronously on every change to their
// watched property (driven by AddPropertyChangedListener), so a
// large number of triggers on a hot-path property has a real cost.
// Match against === equality — no value-equality helpers, no
// converters. Setter.value rules are the same as for normal Setters
// (plain literals, Binding, SetterFactory all supported).
export class PropertyTrigger
{
    constructor(
        public readonly propertyOwner: Function,
        public readonly propertyName: string,
        public readonly value: unknown,
        public readonly setters: readonly Setter[],
        // Actions invoked on the activation EDGE — i.e., the trigger
        // transitions from non-matching to matching. NOT fired on
        // initial style apply when the property already matches the
        // trigger value, nor on Style detach (uninstall) when the
        // trigger was active. WPF parity: enter/exit fire only on
        // genuine property-driven transitions; install/uninstall are
        // resting-state changes, not edges. Consumers wanting initial
        // state replay script it imperatively or use a Loaded event
        // trigger. One-shot per edge — no idempotence guards inside
        // the runtime, so an action that mutates target state will see
        // the same transitions the user sees.
        public readonly enterActions: readonly TriggerAction[] = [],
        // Symmetric — fires on the deactivation edge (matching → not).
        // Like enterActions, NOT fired on Style detach.
        public readonly exitActions:  readonly TriggerAction[] = [],
    ) {}
}

// One conjunct condition inside a MultiTrigger. Equivalent to a
// PropertyTrigger's (owner, name, value) trio, but without setters —
// setters live on the MultiTrigger itself and fire only when EVERY
// condition currently holds.
export interface TriggerCondition
{
    propertyOwner: Function;
    propertyName: string;
    value:        unknown;
}

// Binding-driven conditional setter group — counterpart to WPF's
// DataTrigger. Two source forms:
//
//   * String path (the common case): resolved through
//     DataContextBinding's walk semantics on the styled Visual's
//     DataContext. Authored markup writes `when( $Path )` (matches
//     when the bound value === true; `not $Path` matches when ===
//     false), or `when( $Path = expr )` to compare against a specific
//     value.
//   * Binding factory (the escape hatch): `(target) => Binding` so the
//     trigger can read from arbitrary Binding sources — ElementName,
//     RelativeSource, Source, converters, etc. WPF's full Binding
//     surface that the bare-path form can't reach. Programmatic only
//     today; the parser doesn't have markup syntax for it yet.
//
// In either form: when the resolved value === `value`, the trigger's
// setters apply at the Trigger priority tier; when the match flips,
// they're unapplied. Same edge semantics as PropertyTrigger
// (initial-state match applies setters silently; enterActions /
// exitActions fire only on genuine transitions).
//
// Unlike PropertyTrigger this is bound by *data identity* rather than
// a DP on the target, so the same trigger transparently fires for
// any item whose source resolves to a matching value. Heavily used
// inside DataTemplate triggers (where the DataContext is the per-item
// view model), but also valid inside an ordinary Style — useful for
// per-element data-driven re-skinning without an intermediate VM
// flag mirrored as a DP on the target.
export class DataTrigger
{
    // Populated when constructed with a string source; undefined for
    // the binding-factory form.
    public readonly path: string | undefined;
    // Populated when constructed with a binding-factory source;
    // undefined for the path form. The factory is invoked once per
    // styled target at install time.
    public readonly bindingFactory: DataTriggerBindingFactory | undefined;

    constructor(
        pathOrBindingFactory: string | DataTriggerBindingFactory,
        public readonly value:   unknown,
        public readonly setters: readonly Setter[],
        // Same edge semantics as PropertyTrigger.enterActions —
        // activation transitions only, no initial-state replay.
        public readonly enterActions: readonly TriggerAction[] = [],
        public readonly exitActions:  readonly TriggerAction[] = [],
    )
    {
        if (typeof pathOrBindingFactory === 'string')
        {
            this.path = pathOrBindingFactory;
            this.bindingFactory = undefined;
        }
        else
        {
            this.path = undefined;
            this.bindingFactory = pathOrBindingFactory;
        }
    }
}

// Multi-property AND-trigger. Counterpart to WPF's MultiTrigger.
// Watches each condition's (owner, name) pair; when a watched value
// changes the trigger re-evaluates. Setters apply ONLY when every
// condition matches; deactivate as soon as any one stops matching.
//
// Authored markup never instantiates this directly — the compiler
// emits MultiTrigger when a `when{ A and B }` clause is lowered (and
// also when a `(A and B) or C` DNF-expansion produces a conjunct of
// length > 1). Single-condition `when{}` clauses still lower to
// PropertyTrigger for compactness; both kinds coexist in a Style.
export class MultiTrigger
{
    constructor(
        public readonly conditions: readonly TriggerCondition[],
        public readonly setters:    readonly Setter[],
        // Same edge semantics as PropertyTrigger.enterActions — see
        // there for full notes.
        public readonly enterActions: readonly TriggerAction[] = [],
        public readonly exitActions:  readonly TriggerAction[] = [],
    ) {}
}

// One conjunct condition inside a MultiDataTrigger — a binding source
// + expected value pair. Mirrors TriggerCondition's shape but reads
// from a Binding rather than a DP on the target. The source is either
// a DataContext path (the common case, resolved via
// DataContextBinding(this, path)) or a binding factory (the escape
// hatch for ElementName / RelativeSource / Source / converters).
export interface DataTriggerCondition
{
    path?:           string;
    bindingFactory?: DataTriggerBindingFactory;
    value:           unknown;
}

// Multi-binding AND-trigger. Counterpart to WPF's MultiDataTrigger.
// Watches each condition's DataContext path; setters apply ONLY when
// every bound value === its expected, deactivate as soon as any one
// stops matching. The N bindings are independent — a swap of the
// styled visual's DataContext re-resolves all of them.
//
// Authored markup writes `when( $A and $B )` (or mixed
// `when( IsMouseOver and $IsHot )`); the compiler emits a
// MultiDataTrigger when ANY conjunct term carries a $path, otherwise
// the existing pure-DP MultiTrigger. Mixed conjuncts (DP + $path) are
// lowered by stamping the DP-path conditions as `Owner.Name` pseudo-
// paths — the runtime's install path consults DataContextBinding for
// $-prefixed entries and the DP lookup for the rest.
export class MultiDataTrigger
{
    constructor(
        public readonly conditions: readonly DataTriggerCondition[],
        public readonly setters:    readonly Setter[],
        // Same edge semantics as PropertyTrigger.enterActions —
        // activation transitions only, no initial-state replay.
        public readonly enterActions: readonly TriggerAction[] = [],
        public readonly exitActions:  readonly TriggerAction[] = [],
    ) {}
}

// Style is a reusable bag of Setters (+ optional Triggers) applied
// to a target Visual class. Counterpart to WPF's Style.
//
// Application:
//   * Explicit — set Visual.Style = someStyle.
//   * Implicit — put the style in a ResourceDictionary keyed by the
//     TargetType class; any descendant matching TargetType picks it
//     up automatically at AttachLogical time and re-resolves
//     reactively when ancestor dictionaries change.
// Explicit always wins. Setting Visual.Style = undefined falls back
// to the implicit style (if any in scope).
//
// BasedOn lets one style inherit setters / triggers / resources
// from another: child entries override base entries (by composite
// owner.property key for setters; by list-concat for triggers; by
// merged-dictionary walk for resources). The chain is resolved at
// Apply time, not flattened at construction, so editing a base
// Style is observable in derivatives.
//
// Resources scoped to the Style are consulted FIRST by
// Visual.TryFindResource when this style is the Visual's active
// style — handy for setter values that use DynamicResource to look
// up colors/brushes specific to the style.
//
// Sealing: Visual.apply_style calls Seal() on first apply. After
// sealing, the Style is conceptually frozen — currently a contract
// signal more than a hard guarantee (Setters / Triggers / BasedOn
// are already `readonly`), but future trigger or setter-collection
// mutation would gate on this.
//
// Per-style namespace scoping for setter-resolved names is the main
// remaining gap vs WPF (PropertyTrigger / MultiTrigger / DataTrigger /
// EventTrigger all parity now).
export class Style
{
    public readonly TargetType: Function;
    public readonly Setters: readonly Setter[];
    public readonly Triggers:          readonly PropertyTrigger[];
    public readonly MultiTriggers:     readonly MultiTrigger[];
    public readonly DataTriggers:      readonly DataTrigger[];
    public readonly MultiDataTriggers: readonly MultiDataTrigger[];
    public readonly EventTriggers:     readonly EventTrigger[];

    // BasedOn is exposed read-only via the getter. The backing field
    // is mutable so Seal() can splice in the THEME style for this
    // TargetType when the author didn't pass an explicit BasedOn — the
    // WPF parity for "every Style implicitly inherits from the default
    // Style for its TargetType". Theme resolution happens at Seal
    // (first apply) so the bundled controls theme's registration race
    // with class-static block ordering doesn't matter — by the time
    // any Style applies, the theme has been pushed onto
    // Application.DefaultResourceFactories.
    private _basedOn: Style | undefined;
    public get BasedOn(): Style | undefined { return this._basedOn; }

    private _sealed: boolean = false;
    private _resources: ResourceDictionary | undefined;

    constructor(
        targetType: Function,
        setters: readonly Setter[] = [],
        basedOn?: Style,
        triggers: readonly PropertyTrigger[] = [],
        multiTriggers: readonly MultiTrigger[] = [],
        eventTriggers: readonly EventTrigger[] = [],
        dataTriggers:  readonly DataTrigger[]  = [],
        multiDataTriggers: readonly MultiDataTrigger[] = [],
    )
    {
        this.TargetType        = targetType;
        this.Setters           = setters;
        this._basedOn          = basedOn;
        this.Triggers          = triggers;
        this.MultiTriggers     = multiTriggers;
        this.EventTriggers     = eventTriggers;
        this.DataTriggers      = dataTriggers;
        this.MultiDataTriggers = multiDataTriggers;
    }

    public get IsSealed(): boolean { return this._sealed; }

    // Seals this style (and its BasedOn chain). Idempotent. Visual
    // calls this automatically on first apply. Acts as a contract
    // marker today (Setters / Triggers / BasedOn already `readonly`);
    // gates future mutation surface (e.g., mutable trigger
    // collections) once those exist.
    //
    // Also performs the WPF implicit-BasedOn resolution: when no
    // explicit BasedOn was passed AND a theme Style for the
    // TargetType exists in the bundled defaults / Application
    // resources, splice it in. This makes every author-side Style
    // automatically inherit Template + chrome setters from the theme
    // without forcing them to write BasedOn manually — setting an
    // unrelated property (e.g. `IsExpanded = true` in
    // `ItemContainerStyle`) no longer blows away the control's
    // chrome.
    //
    // The self-reference guard skips the splice when the resolved
    // theme IS this style (the theme's own Style getting sealed),
    // preventing an infinite BasedOn loop.
    public Seal(): void
    {
        if (this._sealed) return;
        this._sealed = true;
        if (this._basedOn === undefined)
        {
            const theme = Application.ResolveDefaultResource(this.TargetType);
            if (theme instanceof Style && theme !== this)
            {
                this._basedOn = theme;
            }
        }
        this._basedOn?.Seal();
    }

    // Lazy-created per-style ResourceDictionary. Touching this
    // getter allocates an empty dict on first access; consult
    // `HasResources` if you need to know whether anything has been
    // set without allocating.
    public get Resources(): ResourceDictionary
    {
        if (this._resources === undefined) this._resources = new ResourceDictionary();
        return this._resources;
    }

    public get HasResources(): boolean { return this._resources !== undefined; }

    // Resolves a resource key through this style's Resources, then
    // its BasedOn chain. Used by Visual.TryFindResource as the
    // first lookup step when this style is the Visual's active one.
    public TryResolveResource(key: ResourceKey): unknown | undefined
    {
        if (this._resources?.CanResolve(key)) return this._resources.Resolve(key);
        return this.BasedOn?.TryResolveResource(key);
    }

    // Flattens this style and its BasedOn chain into a single map
    // keyed by composite (`Owner.Property`). For a key set in both
    // base and child, the child wins — WPF Style.BasedOn semantics.
    //
    // Used at apply time (Visual.Style setter) and at unapply time
    // (so we know exactly which slots to clear). Iteration order of
    // the returned Map is base-first, child-second after override.
    public ResolveSetters(): Map<string, Setter>
    {
        const map = new Map<string, Setter>();
        if (this.BasedOn !== undefined)
        {
            for (const [k, v] of this.BasedOn.ResolveSetters())
            {
                map.set(k, v);
            }
        }
        for (const s of this.Setters)
        {
            map.set(`${s.owner.name}.${s.property}`, s);
        }
        return map;
    }

    // BasedOn triggers run first; this style's triggers append. No
    // de-duplication — multiple triggers on the same property are
    // valid (each independently activates / deactivates), and order
    // matters because trigger setters that target the same property
    // resolve last-applied-wins via the Trigger priority tier.
    public ResolveTriggers(): PropertyTrigger[]
    {
        const list: PropertyTrigger[] = [];
        if (this.BasedOn !== undefined) list.push(...this.BasedOn.ResolveTriggers());
        list.push(...this.Triggers);
        return list;
    }

    // Same resolution semantics as ResolveTriggers — BasedOn chain
    // walked first, then this style's own list. Multi-triggers are a
    // sibling concept to single-property triggers; they share the
    // Trigger priority tier and last-applied-wins ordering.
    public ResolveMultiTriggers(): MultiTrigger[]
    {
        const list: MultiTrigger[] = [];
        if (this.BasedOn !== undefined) list.push(...this.BasedOn.ResolveMultiTriggers());
        list.push(...this.MultiTriggers);
        return list;
    }

    // EventTriggers don't compete for slot priority (they wire side-
    // effecting actions, not values), so the resolution is a clean
    // BasedOn-first list concat — base triggers fire before child
    // triggers when both bind the same event.
    public ResolveEventTriggers(): EventTrigger[]
    {
        const list: EventTrigger[] = [];
        if (this.BasedOn !== undefined) list.push(...this.BasedOn.ResolveEventTriggers());
        list.push(...this.EventTriggers);
        return list;
    }

    // Same resolution semantics as the other Resolve* methods — BasedOn
    // first, then this style's own list. DataTriggers share the Trigger
    // priority tier with PropertyTrigger / MultiTrigger and follow
    // last-applied-wins ordering when their setters collide on the
    // same slot.
    public ResolveDataTriggers(): DataTrigger[]
    {
        const list: DataTrigger[] = [];
        if (this.BasedOn !== undefined) list.push(...this.BasedOn.ResolveDataTriggers());
        list.push(...this.DataTriggers);
        return list;
    }

    // BasedOn-first resolution for MultiDataTriggers — sibling of
    // ResolveMultiTriggers / ResolveDataTriggers. Same Trigger priority
    // tier; last-applied-wins ordering.
    public ResolveMultiDataTriggers(): MultiDataTrigger[]
    {
        const list: MultiDataTrigger[] = [];
        if (this.BasedOn !== undefined) list.push(...this.BasedOn.ResolveMultiDataTriggers());
        list.push(...this.MultiDataTriggers);
        return list;
    }
}
