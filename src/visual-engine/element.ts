import { Visual, safeFire } from './visual.js';
import { ObservableCollection, type IReadOnlyObservableCollection } from '../runtime/observable-collection.js';
import type { Behavior } from './behavior.js';

// `Element` — the FrameworkElement-tier seam between `Visual` and the
// control library. Today (§ 1.1) it's an empty subclass of `Visual` —
// the layer exists so every UI-facing subclass (`Single`, `Panel`,
// `Shape`, `TemplatedControl`, `Control` and everything below) can
// already declare itself as Element-tier without touching them again
// when the structural moves land.
//
// Future home (§ 1.7-1.9): DataContext + inheritance machinery, Style
// + Resources + Triggers, dimension knobs (Width / Height / Min / Max
// / Margin / HorizontalAlignment / VerticalAlignment), the dimension-
// aware constrained-sizing pipeline that wraps `MeasureOverride`,
// DefaultStyleKey + theme resolution, Loaded / Unloaded, FindName /
// NameScope, ResourceDictionary, ambient-theme hooks, Behaviors.
//
// What stays on `Visual` (UIElement-tier): visual-tree wiring + host
// attachment, render pipeline, the layout entry points
// (`Measure(availableSize)` / `Arrange(finalRect)`) + cache state,
// routed-event registry + input virtuals, input-state DPs, focus,
// hit-testing.
//
// The `MeasureCore` / `ArrangeCore` seam (§ 1.1 design): `Visual` keeps
// `Measure` / `Arrange` and a default `MeasureCore` / `ArrangeCore`
// that delegates to `MeasureOverride` / `ArrangeOverride` unconstrained;
// `Element` (later) overrides `MeasureCore` to wrap the override with
// the Width / Height / Min / Max / Margin / Alignment dance. Subclass
// authors keep overriding `MeasureOverride` / `ArrangeOverride`
// unchanged — the seam is invisible to them.
export class Element extends Visual
{
    // ── Lifecycle listeners ───────────────────────────────────────────
    //
    // Loaded — fires exactly once when this Element first attaches to
    // a target. Adding a listener AFTER the Element is already loaded
    // fires it synchronously (matches the React useEffect mount
    // shape — a registered listener never misses the load event).
    //
    // § 1.11 — the symmetric per-attach pair lives on
    // `_attachedListeners` below. Behaviors wiring (setUp, tearDown)
    // wants Attached + Detached (every attach + every detach);
    // WPF-parity consumers wanting `FrameworkElement.Loaded` once-only
    // stay on Loaded + Unloaded. Detached is wired as an alias to
    // Unloaded — same edges, kept separate listener storage so
    // authors can read their intent off the wiring
    // (`AddDetachedListener` signals "I want Attached/Detached
    // symmetry" without forcing the existing Unloaded callers to
    // migrate).
    private _loadedListeners:   Set<() => void> | undefined;
    private _attachedListeners: Set<() => void> | undefined;
    private _unloadedListeners: Set<() => void> | undefined;
    private _hasFiredLoaded: boolean = false;

    public AddLoadedListener(listener: () => void): void
    {
        (this._loadedListeners ??= new Set()).add(listener);
        // Already loaded — fire synchronously so consumers attaching
        // after mount still see the load edge.
        if (this._hasFiredLoaded) listener();
    }

    public RemoveLoadedListener(listener: () => void): void
    {
        this._loadedListeners?.delete(listener);
    }

    /** § 1.11 — Per-attach edge listener. Fires every time this
     *  Element's visualParent transitions from undefined to defined,
     *  including re-attaches after a detach (recycled containers,
     *  popups mounted+unmounted across hover edges). Symmetric with
     *  `AddUnloadedListener` / `AddDetachedListener`. If the Element
     *  is already attached at registration time, the listener fires
     *  synchronously so consumers don't miss the current edge. */
    public AddAttachedListener(listener: () => void): void
    {
        (this._attachedListeners ??= new Set()).add(listener);
        if (this['target'] !== undefined) listener();
    }

    public RemoveAttachedListener(listener: () => void): void
    {
        this._attachedListeners?.delete(listener);
    }

    // Unloaded — fires on every `visualParent` defined → undefined
    // edge (not one-shot like Loaded). A Visual that's added →
    // removed → added → removed fires Unloaded twice. The asymmetry
    // is pragmatic — behaviors that need to release a resource on
    // detach should run their cleanup each time the Element leaves
    // the tree.
    public AddUnloadedListener(listener: () => void): void
    {
        (this._unloadedListeners ??= new Set()).add(listener);
    }

    public RemoveUnloadedListener(listener: () => void): void
    {
        this._unloadedListeners?.delete(listener);
    }

    /** § 1.11 — Symmetric companion to `AddAttachedListener`. Wired
     *  as an alias to `AddUnloadedListener` — same per-detach edges,
     *  separate name so authors picking the per-attach / per-detach
     *  pair signal their intent at the wiring site. WPF-parity
     *  consumers (Loaded + Unloaded) stay on the existing methods. */
    public AddDetachedListener(listener: () => void): void
    {
        this.AddUnloadedListener(listener);
    }

    public RemoveDetachedListener(listener: () => void): void
    {
        this.RemoveUnloadedListener(listener);
    }

    // Hooks fired by Visual.SetTarget / Visual.SetVisualParent — see
    // `on_attach_edge` / `on_detach_edge` on Visual.
    protected override on_attach_edge(): void
    {
        // Loaded: one-shot. Subsequent re-attach cycles never re-fire.
        if (!this._hasFiredLoaded)
        {
            this._hasFiredLoaded = true;
            safeFire(this._loadedListeners);
        }
        // Attached: every attach edge.
        safeFire(this._attachedListeners);
    }

    protected override on_detach_edge(): void
    {
        safeFire(this._unloadedListeners);
    }

    // ── Behavior attachment ───────────────────────────────────────────
    //
    // Behaviors are markup-attachable wiring objects (see
    // [./behavior.ts](./behavior.ts)). The compiler emits per-element
    // `<element>.AddBehavior(<behavior>)` after constructing the
    // behavior and applying its DP setters, so by the time
    // `OnAttached` fires the behavior's per-instance properties are
    // already populated.
    //
    // The Element holds a reference to every attached behavior so it
    // can survive GC alongside the Element itself; that matches the
    // behavior's natural lifetime — it's wired up to listen on the
    // Element it was attached to, so as long as the Element is alive
    // the behavior should be too.
    private _behaviors: Behavior[] | undefined;
    // Per-behavior unload listener — kept so `RemoveBehavior` can
    // pull the listener back off `AddUnloadedListener` and fire
    // `OnDetached` exactly once on imperative removal (vs. the
    // unload edge firing it later anyway).
    private _behaviorUnloadListeners: Map<Behavior, () => void> | undefined;

    public AddBehavior(behavior: Behavior): void
    {
        (this._behaviors ??= []).push(behavior);
        // Auto-wire OnDetached via the Unloaded listener so behaviors
        // get a teardown edge without their author writing the
        // subscription themselves. Each detach fires OnDetached again
        // (matching the underlying Unloaded semantics) — a behavior
        // that needs once-only teardown should track that itself.
        const onUnloaded = (): void => { behavior.OnDetached(this); };
        this.AddUnloadedListener(onUnloaded);
        (this._behaviorUnloadListeners ??= new Map()).set(behavior, onUnloaded);
        behavior.OnAttached(this);
    }

    // Imperative companion to AddBehavior — used by triggered-behavior
    // actions (style triggers with a Behaviors block) and any consumer
    // that needs to drop a behavior before the Element is unloaded.
    // Fires `OnDetached` once and unsubscribes the unload listener so
    // a later Unloaded edge doesn't fire `OnDetached` a second time.
    // No-op when `behavior` is not currently attached.
    public RemoveBehavior(behavior: Behavior): void
    {
        if (this._behaviors === undefined) return;
        const idx = this._behaviors.indexOf(behavior);
        if (idx < 0) return;
        this._behaviors.splice(idx, 1);

        const onUnloaded = this._behaviorUnloadListeners?.get(behavior);
        if (onUnloaded !== undefined)
        {
            this.RemoveUnloadedListener(onUnloaded);
            this._behaviorUnloadListeners!.delete(behavior);
        }
        behavior.OnDetached(this);
    }

    public get Behaviors(): readonly Behavior[]
    {
        return this._behaviors ?? [];
    }
}

/** Class constructor reference for an `Element` subclass. Used as the
 *  type for `Style.TargetType`, `DefaultStyleKey` defaults, and any
 *  metadata that names a templated control's class. Replaces the
 *  loose `Function | undefined` typing for these slots — `ElementCtor`
 *  keeps the `instanceof` check on the consumer side typed without
 *  an `as new (...args: any[]) => Visual` cast at each use site
 *  (§ 1.10). */
export type ElementCtor = new (...args: any[]) => Element;

// A Visual that owns at most one child. SetChild(undefined) clears the
// slot. Replacing a non-undefined child first detaches the previous one.
export abstract class Single extends Element
{
    private _child: Visual | undefined;

    public get child(): Visual | undefined
    {
        return this._child;
    }

    public SetChild(child: Visual | undefined): void
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

        // Dynamic SetChild after the Single has already been measured
        // must re-flow on the next layout pass — without this, a child
        // swapped in post-layout would stay un-measured and arrange to
        // (0,0,0×0). Symmetric with Panel's collection subscription.
        this.InvalidateMeasure();
    }

    // The single child belongs to both trees — a non-templated Single
    // never separates its visual and logical content. Templated
    // subclasses (Phase 2) override these independently.
    public override get visualChildren(): readonly Visual[]
    {
        return this._child !== undefined ? [this._child] : [];
    }

    public override get logicalChildren(): readonly Visual[]
    {
        return this._child !== undefined ? [this._child] : [];
    }

    protected override forEachVisualChild(fn: (child: Visual) => void): void
    {
        if (this._child !== undefined) fn(this._child);
    }

    protected override forEachLogicalChild(fn: (child: Visual) => void): void
    {
        if (this._child !== undefined) fn(this._child);
    }
}

// A Visual that owns an ordered collection of children.
//
// The internal child list is an ObservableCollection<Visual>; public
// reads / iterations / subscriptions go through `Children` (the read-
// only view typed as IReadOnlyObservableCollection). Mutation is
// routed through AddChild / InsertChild / RemoveChild (full Attach
// pair: both trees) or AddVisualChild / InsertVisualChild /
// RemoveVisualChild (visual-tree only — used by ItemsControl-style
// hosts where containers live visually in the items panel but
// logically belong to the outer control).
//
// `visualChildren` / `logicalChildren` continue to return a
// `readonly Visual[]`, materialized lazily from the ObservableCollection
// and invalidated by a per-Panel subscription so the snapshot stays
// fresh without per-call allocation in the common case where children
// don't mutate between reads.
export class Panel extends Element
{
    private readonly _children: ObservableCollection<Visual> = new ObservableCollection<Visual>();

    // Lazily-materialized snapshot for visualChildren / logicalChildren.
    // Invalidated by the subscription wired in the constructor.
    private _childrenSnapshot: readonly Visual[] | undefined;

    constructor()
    {
        super();
        // Subscribe once at construction; the unsubscribe is never
        // called — the subscription's lifetime is tied to this Panel.
        // Invalidates the visualChildren snapshot AND the panel's
        // measure: a child added (or removed) after the panel has
        // already been measured must re-flow on the next layout pass —
        // without this, dynamically-appended children stay un-measured
        // and arrange to (0,0,0×0). Panel-driven Attach / Detach
        // doesn't itself invalidate measure, so the ObservableCollection
        // subscription is the natural seam.
        this._children.Subscribe(() =>
        {
            this._childrenSnapshot = undefined;
            this.InvalidateMeasure();
        });
    }

    // Public read-only view: iterate, count, lookup, subscribe — but
    // not mutate. Mutation goes through Panel's AddChild / InsertChild
    // / RemoveChild so Attach / Detach run alongside.
    public get Children(): IReadOnlyObservableCollection<Visual>
    {
        return this._children;
    }

    public AddChild(child: Visual): void
    {
        this.Attach(child);
        this._children.Add(child);
    }

    public InsertChild(index: number, child: Visual): void
    {
        this.Attach(child);
        this._children.Insert(index, child);
    }

    public RemoveChild(child: Visual): void
    {
        if (this._children.IndexOf(child) === -1) return;
        this._children.Remove(child);
        this.Detach(child);
    }

    // Visual-only attach: adds child to the panel's visual children
    // (renderer / hit-testing) WITHOUT wiring its logical parent.
    // Used by ItemsControl-style hosts where containers live visually
    // in the items panel but logically belong to the outer control
    // (so DataContext / inheritance flow through the outer control,
    // not the panel). Plain consumers should use AddChild.
    public AddVisualChild(child: Visual): void
    {
        this.AttachVisual(child);
        this._children.Add(child);
    }

    public InsertVisualChild(index: number, child: Visual): void
    {
        this.AttachVisual(child);
        this._children.Insert(index, child);
    }

    public RemoveVisualChild(child: Visual): void
    {
        if (this._children.IndexOf(child) === -1) return;
        this._children.Remove(child);
        this.DetachVisual(child);
    }

    // Children added via AddChild belong to both trees; visual and
    // logical iteration return the same snapshot array. Templated
    // subclasses (Phase 2) override these independently.
    public override get visualChildren(): readonly Visual[]  { return this.childrenSnapshot(); }
    public override get logicalChildren(): readonly Visual[] { return this.childrenSnapshot(); }

    private childrenSnapshot(): readonly Visual[]
    {
        if (this._childrenSnapshot === undefined)
        {
            this._childrenSnapshot = this._children.ToArray();
        }
        return this._childrenSnapshot;
    }

    protected override forEachVisualChild(fn: (child: Visual) => void): void
    {
        for (const c of this._children) fn(c);
    }

    protected override forEachLogicalChild(fn: (child: Visual) => void): void
    {
        for (const c of this._children) fn(c);
    }
}
