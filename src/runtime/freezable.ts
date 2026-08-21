import { MuralBase, PropertyKey } from './model.js';
import { PropertyValueSource } from './binding/effective-value.js';
import { ObservableCollection } from './observable-collection.js';
import type { PropertyDescriptor } from './property-descriptor.js';

// Freezable — WPF `System.Windows.Freezable` analog, and the base for
// mural's shareable value-like Models (Brush, Pen, Geometry, Transform).
// It layers two capabilities onto MuralBase that a raw MuralBase doesn't have:
//
//   1. CHANGE NOTIFICATION WITH MULTIPLE OWNERS. A Freezable tracks the
//      set of "owners" registered against it and fires every one whenever
//      it — OR any nested Freezable it holds — changes. This is the
//      `Changed` half of WPF Freezable: mutating a SHARED brush's Color
//      (or a shared Transform's Angle) notifies every Visual that holds
//      it, so they all re-render. It replaces both the single-consumer
//      `_setRenderInvalidator` hook Transform used to carry (which
//      clobbered the first owner when a Transform was shared across two
//      Visuals) and Shape's hand-rolled `subscribeAny` property-list hack.
//
//   2. IMMUTABILITY (Freeze) + Clone. `Freeze()` makes the object (and
//      its Freezable graph) read-only — subsequent writes throw — so a
//      frozen instance can be shared with zero change-tracking overhead.
//      `Clone()` / `CloneCurrentValue()` deep-copy the Freezable so a
//      caller can share-by-value instead. `GetAsFrozen()` returns a frozen
//      clone. These mirror the WPF surface (`IsFrozen` / `CanFreeze` /
//      `Freeze` / `Clone` / `CloneCurrentValue` / `GetAsFrozen`).
//
// How owners get wired: a Visual that holds a Freezable in a DP registers
// itself as an owner (see Visual.OnPropertyChanged) with a callback that
// invalidates per the DP's MetaData (Measure / Arrange / Render). Nested
// Freezables (Pen.Brush, Brush.Transform, GeometryGroup.Children, a
// TransformGroup's Children) are tracked automatically so their inner
// changes bubble up to the same owners.
export abstract class Freezable extends MuralBase
{
    private _frozen = false;

    // Owner callbacks — notified on any own-property change or a bubbled
    // change from a nested Freezable. Lazily allocated; undefined once
    // frozen (a frozen Freezable never changes, so nobody needs to listen).
    private _owners: Set<() => void> | undefined;

    // Per-property child subscriptions, keyed by the composite DP key. When
    // a DP that holds a Freezable (or an array / ObservableCollection of
    // them) changes, we swap the subscription so the new child's inner
    // changes bubble to OUR owners and the old child's stop.
    private _childSubs: Map<string, () => void> | undefined;

    // Stable per-instance bubble callback registered as the owner on each
    // nested Freezable. Captured once so register / unregister identity-
    // compare without allocating per call.
    private readonly _bubble = (): void => { this.fireChanged(); };

    // ── Frozen state ─────────────────────────────────────────────────
    public get IsFrozen(): boolean { return this._frozen; }

    /** True when this Freezable (and every nested Freezable it holds) can
     *  be frozen. Default true; subclasses with un-freezable transient
     *  state override `canFreezeCore`. */
    public get CanFreeze(): boolean { return this.canFreezeCore(); }

    // ── Owner registration (the Changed mechanism) ──────────────────
    /** Register `onChanged` to fire whenever this Freezable or a nested
     *  Freezable changes. No-op on a frozen instance (it never changes). */
    public RegisterOwner(onChanged: () => void): void
    {
        if (this._frozen) return;
        (this._owners ??= new Set()).add(onChanged);
    }

    public UnregisterOwner(onChanged: () => void): void
    {
        this._owners?.delete(onChanged);
    }

    /** Fire all registered owners. Called on any own-DP change and on a
     *  bubbled change from a nested Freezable. */
    protected fireChanged(): void
    {
        if (this._owners === undefined) return;
        // Snapshot — an owner callback may unregister mid-iteration.
        for (const cb of [...this._owners]) cb();
    }

    // ── Freeze ───────────────────────────────────────────────────────
    /** Make this Freezable (and its nested Freezable graph) immutable.
     *  Subsequent property writes throw. Idempotent; returns `this` so a
     *  freshly-built frozen value can be assigned inline. */
    public Freeze(): this
    {
        if (this._frozen) return this;
        if (!this.CanFreeze)
        {
            throw new Error(
                `${this.constructor.name} cannot be frozen — it (or a nested `
                + 'Freezable) reported CanFreeze = false.');
        }
        // Freeze children first (depth-first) so the graph is fully immutable
        // before we flip our own flag and drop tracking.
        for (const child of this.collectFreezableChildren()) child.Freeze();
        this._frozen = true;
        // Frozen never changes: drop owner tracking + detach child subs.
        this._owners = undefined;
        if (this._childSubs !== undefined)
        {
            for (const unsub of this._childSubs.values()) unsub();
            this._childSubs.clear();
        }
        return this;
    }

    // ── Clone ────────────────────────────────────────────────────────
    /** Deep-copy into a new, UNFROZEN instance. Nested Freezables are
     *  cloned recursively; immutable value types (Color, Matrix, Point,
     *  GradientStop, …) are shared by reference (safe — they never mutate). */
    public Clone(): this
    {
        const copy = this.createClone();
        copy.copyFrom(this);
        return copy;
    }

    /** In mural's value-Models a property's base value and its current
     *  (post-animation) effective value coincide except while an animation
     *  is live, and `get_property_value` already returns the current
     *  effective value — so CloneCurrentValue collapses to the same deep
     *  copy Clone performs. Kept as a distinct method for WPF-surface
     *  parity and so call sites read intent. */
    public CloneCurrentValue(): this { return this.Clone(); }

    /** Return a frozen copy: `this` if already frozen, else a frozen
     *  Clone. Mirrors WPF Freezable.GetAsFrozen. */
    public GetAsFrozen(): this
    {
        if (this._frozen) return this;
        return this.Clone().Freeze();
    }

    // ── MuralBase write-path guard ───────────────────────────────────────
    // Every public setter on a concrete Freezable DP routes through
    // set_property_value; animation through SetAnimatedValue. Guard both so
    // a frozen instance rejects mutation the way WPF's WritePreamble does.
    public override set_property_value<T>(key: PropertyKey<T>, value: T): void
    {
        this.throwIfFrozen();
        super.set_property_value(key, value);
    }

    public override set_property_value_with_key<T>(key: PropertyKey<T>, value: T): void
    {
        this.throwIfFrozen();
        super.set_property_value_with_key(key, value);
    }

    public override SetAnimatedValue<T>(key: PropertyKey<T>, value: T): void
    {
        this.throwIfFrozen();
        super.SetAnimatedValue(key, value);
    }

    private throwIfFrozen(): void
    {
        if (this._frozen)
        {
            throw new Error(
                `Cannot modify a frozen ${this.constructor.name}. Clone() it `
                + 'first, or build it before freezing (WPF Freezable semantics).');
        }
    }

    // ── Change detection: own DPs + nested-Freezable bubbling ────────
    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        old_value: unknown,
        new_value: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, old_value, new_value);
        // A frozen Freezable shouldn't be changing at all (writes throw);
        // if some lower tier still fires, there are no owners to notify.
        if (this._frozen) return;

        // Re-point the nested-Freezable subscription for THIS property so a
        // freshly-assigned child bubbles and the old one stops.
        const key = descriptor.ComposedKey;
        const prev = this._childSubs?.get(key);
        if (prev !== undefined)
        {
            prev();
            this._childSubs!.delete(key);
        }
        const unsub = this.subscribeChildValue(new_value);
        if (unsub !== undefined) (this._childSubs ??= new Map()).set(key, unsub);

        this.fireChanged();
    }

    // Subscribe our bubble callback to whatever Freezable(s) `value` holds:
    // a single Freezable, an array of them, or an ObservableCollection (in
    // which case collection mutations re-sync + fire). Returns an unsub
    // thunk, or undefined when `value` carries no Freezable.
    private subscribeChildValue(value: unknown): (() => void) | undefined
    {
        if (value instanceof Freezable)
        {
            value.RegisterOwner(this._bubble);
            return () => value.UnregisterOwner(this._bubble);
        }
        if (Array.isArray(value))
        {
            const kids = value.filter((v): v is Freezable => v instanceof Freezable);
            if (kids.length === 0) return undefined;
            for (const k of kids) k.RegisterOwner(this._bubble);
            return () => { for (const k of kids) k.UnregisterOwner(this._bubble); };
        }
        if (value instanceof ObservableCollection)
        {
            const coll = value as ObservableCollection<unknown>;
            let kids: Freezable[] = [];
            const resync = (): void =>
            {
                for (const k of kids) k.UnregisterOwner(this._bubble);
                kids = [];
                for (let i = 0; i < coll.Count; i++)
                {
                    const e = coll.Get(i);
                    if (e instanceof Freezable) { e.RegisterOwner(this._bubble); kids.push(e); }
                }
            };
            resync();
            const collUnsub = coll.Subscribe(() => { resync(); this.fireChanged(); });
            return () => { for (const k of kids) k.UnregisterOwner(this._bubble); collUnsub(); };
        }
        return undefined;
    }

    // ── Extensibility hooks ──────────────────────────────────────────
    /** Enumerate every nested Freezable held by this instance — the union
     *  of all set Freezable-valued DPs (single / array / collection). Used
     *  by Freeze and CanFreeze. Subclasses that hold Freezables OUTSIDE the
     *  DP system (e.g. TransformGroup's plain-field Children collection)
     *  override to append them via super + push. */
    protected collectFreezableChildren(): Freezable[]
    {
        const out: Freezable[] = [];
        for (const desc of MuralBase.EnumerateProperties(this.constructor))
        {
            const key = new PropertyKey(desc);
            if (this.GetValueSource(key) === PropertyValueSource.Default) continue;
            const v = this.get_property_value(key);
            if (v instanceof Freezable) out.push(v);
            else if (Array.isArray(v))
            {
                for (const e of v) if (e instanceof Freezable) out.push(e);
            }
            else if (v instanceof ObservableCollection)
            {
                for (let i = 0; i < v.Count; i++) { const e = v.Get(i); if (e instanceof Freezable) out.push(e); }
            }
        }
        return out;
    }

    protected canFreezeCore(): boolean
    {
        for (const child of this.collectFreezableChildren()) if (!child.CanFreeze) return false;
        return true;
    }

    // Allocate a bare instance of the concrete type for Clone to populate.
    // The subclass's no-arg (or all-optional-arg) constructor runs so any
    // non-DP setup (e.g. TransformGroup's collection subscription) is wired.
    protected createClone(): this
    {
        return new (this.constructor as new () => this)();
    }

    // Copy every locally-set DP value from `source` onto this fresh clone,
    // deep-cloning nested Freezables. Subclasses with non-DP Freezable state
    // override `cloneExtra` to copy it.
    protected copyFrom(source: this): void
    {
        for (const desc of MuralBase.EnumerateProperties(source.constructor))
        {
            const key = new PropertyKey(desc);
            if (source.GetValueSource(key) === PropertyValueSource.Default) continue;
            this.set_property_value_with_key(key, cloneFreezableValue(source.get_property_value(key)));
        }
        this.cloneExtra(source);
    }

    /** Hook for subclasses holding Freezable state outside the DP system to
     *  copy it into the clone. Default no-op. */
    protected cloneExtra(_source: this): void { }
}

// Deep-clone a property value for Clone: nested Freezables recurse, arrays
// and ObservableCollections map element-wise, immutable value types pass
// through by reference (Color / Matrix / Point / GradientStop / … never
// mutate, so sharing is safe).
export function cloneFreezableValue(v: unknown): unknown
{
    if (v instanceof Freezable) return v.Clone();
    if (Array.isArray(v)) return v.map(cloneFreezableValue);
    if (v instanceof ObservableCollection)
    {
        const copy = new ObservableCollection<unknown>();
        for (let i = 0; i < v.Count; i++) copy.Add(cloneFreezableValue(v.Get(i)));
        return copy;
    }
    return v;
}
