import { ResourceDictionary, type ResourceKey } from './resource-dictionary.js';
import type { Visual } from './visual.js';

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
// Still skipped vs WPF: EventTrigger (no animation system),
// MultiTrigger (multi-condition AND), DataTrigger (Binding-driven
// trigger conditions — covers a real use case but layers cleanly
// on top of PropertyTrigger if needed later), per-style namespace
// scoping for setter-resolved names.
export class Style
{
    public readonly TargetType: Function;
    public readonly Setters: readonly Setter[];
    public readonly BasedOn: Style | undefined;
    public readonly Triggers: readonly PropertyTrigger[];

    private _sealed: boolean = false;
    private _resources: ResourceDictionary | undefined;

    constructor(
        targetType: Function,
        setters: readonly Setter[] = [],
        basedOn?: Style,
        triggers: readonly PropertyTrigger[] = [],
    )
    {
        this.TargetType = targetType;
        this.Setters = setters;
        this.BasedOn = basedOn;
        this.Triggers = triggers;
    }

    public get IsSealed(): boolean { return this._sealed; }

    // Seals this style (and its BasedOn chain). Idempotent. Visual
    // calls this automatically on first apply. Acts as a contract
    // marker today (Setters / Triggers / BasedOn already `readonly`);
    // gates future mutation surface (e.g., mutable trigger
    // collections) once those exist.
    public Seal(): void
    {
        if (this._sealed) return;
        this._sealed = true;
        this.BasedOn?.Seal();
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
}
