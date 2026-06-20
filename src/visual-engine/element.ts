import { Visual, safeFire } from './visual.js';
import { Model } from '../runtime/model.js';
import { MetaData } from '../runtime/metadata.js';
import { ObservableCollection, type IReadOnlyObservableCollection } from '../runtime/observable-collection.js';
import { ResourceDictionary, type ResourceKey } from '../runtime/resource-dictionary.js';
import { Application } from '../runtime/application.js';
import { Setter, Style } from '../runtime/style.js';
import type { PropertyDescriptor } from '../runtime/property-descriptor.js';
import { StyleApplicator } from './style-applicator.js';
import { ResourceResolver } from './resource-resolver.js';
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
// Friend-interface for the cross-class internals reached from
// Element's Style / Resources machinery during the ancestor walk —
// each cursor is a `Visual` (parents may be plain Visuals, not
// Elements), but the fields we touch (`_logicalParent`,
// `_templatedParent`) live on `Visual` and are accessible only
// through a typed cast. Per CLAUDE.md cross-class internals pattern.
// Mural-internal: never re-exported.
interface VisualAncestorAccess
{
    _logicalParent:   Visual | undefined;
    _templatedParent: Visual | undefined;
}

export class Element extends Visual
{
    // ── FrameworkElement-tier DPs ─────────────────────────────────────

    // Style isn't inherited (each Element carries its own); changing
    // it can affect Measure/Arrange/Render via whichever setters
    // it contains, but the Style property itself doesn't need a
    // metadata flag — the underlying property changes from
    // SetStyleValue fire their own invalidation per their own
    // metadata. MetaData.None keeps OnPropertyChanged from doing
    // redundant work.
    public static readonly StyleKey = Model.RegisterProperty<Style | undefined>(Element, 'Style', undefined, MetaData.None);

    // Type-keyed lookup for the theme-supplied default Style. Read-only
    // at the instance level (no public per-instance writes); subclasses
    // opt in by overriding metadata in their static init:
    //
    //     class Button extends ContentControl {
    //         static {
    //             Model.OverrideMetadata(Button, Element.DefaultStyleKeyKey,
    //                 { default_value: Button });
    //         }
    //     }
    //
    // The value is a class function used as a key into the resource
    // chain. resolve_theme_style runs TryFindResource(DefaultStyleKey)
    // and applies the matching Style on a fallback slot below the user
    // ImplicitStyle. A subclass that doesn't override DefaultStyleKey
    // inherits its base's value, so MyFancyButton renders with Button's
    // theme chrome until it opts into its own. Default is undefined —
    // an Element whose DefaultStyleKey is undefined skips theme lookup.
    //
    // Key is public so subclasses can pass it to Model.OverrideMetadata;
    // the read-only gate on set_property_value / by-name paths still
    // prevents per-instance writes (set_property_value_with_key is the
    // documented framework-internal escape hatch).
    public static readonly DefaultStyleKeyKey = Model.RegisterReadOnlyProperty<Function | undefined>(
        Element, 'DefaultStyleKey', undefined, MetaData.None,
    );

    // ── Style / Resources / apply_setter ──────────────────────────────

    // Per-instance ResourceDictionary, lazy-created on first access.
    // Read directly (not through the public Resources getter) by
    // TryFindResource so an ancestor walk doesn't accidentally allocate
    // empty dicts on every node it passes through.
    private _resources: ResourceDictionary | undefined;

    // Resource-lookup machinery + ThemeManager-facing ambient-token
    // hook live on `ResourceResolver` (§ 1.9). Element retains a lazy
    // `_resourceResolver` field; Elements that never trigger a
    // TryFindResource pay no allocation.
    private _resourceResolver: ResourceResolver | undefined;

    // The Style currently driving the StyleValue slot lives on
    // `StyleApplicator` (§ 1.7) — `_styleApplicator?.ActiveStyle`.
    // The applicator is lazy: undefined for Elements that never opt
    // into Style.
    private _styleApplicator: StyleApplicator | undefined;

    // The implicit style discovered by walking the logical chain at
    // AttachLogical and looking up `this.constructor` in the resource
    // dictionaries. Cached so DetachLogical knows what to unapply, and
    // so Style = undefined can re-promote it to active. Only populated
    // for Elements whose ancestor chain contains a matching Style; left
    // undefined otherwise.
    private _implicitStyle: Style | undefined;

    // The theme style discovered by looking up `this.DefaultStyleKey`
    // in the same logical-chain walk as `_implicitStyle`. Sits below
    // `_implicitStyle` in `refresh_active_style`, so a user-side
    // `Style [TargetType=Button]` in app or element resources always
    // shadows the theme's `[TargetType=Button]` entry — which lives in
    // a merged theme dictionary lower in the resolver chain. Only
    // populated when DefaultStyleKey is set; left undefined otherwise.
    private _themeStyle: Style | undefined;

    // Subscriptions on ancestor ResourceDictionaries that, when fired,
    // re-trigger resolve_implicit_style AND resolve_theme_style — both
    // sources watch the same chain so they share one subscription list.
    // Wired at AttachLogical for every dict found in the current
    // ancestor chain; torn down at DetachLogical or when
    // _refresh_styles_subtree rebuilds them after a tree mutation.
    // Lazy — Elements that never opt into Style / Triggers /
    // DynamicResource pay zero allocation.
    private _styleSubscriptions: Array<() => void> | undefined;

    // Per-instance Resources dictionary, lazy-allocated on first
    // touch. Pure-read consumers (`v.Resources.Has(k)`) pay only the
    // allocation; mutation triggers `_refresh_styles_subtree` +
    // `_refresh_dynamic_resources_subtree` via the dict's subscription
    // (§ 1.12), so descendants pick up new resources at the moment a
    // value lands rather than at the unrelated moment the dict was
    // lazy-allocated.
    public get Resources(): ResourceDictionary
    {
        if (this._resources === undefined)
        {
            const dict = new ResourceDictionary();
            this._resources = dict;
            dict.Subscribe(() => {
                this._refresh_styles_subtree();
                this._refresh_dynamic_resources_subtree();
            });
        }
        return this._resources;
    }

    // Logical-ancestor lookup for a resource key. Same walk pattern as
    // FindName / walk_inherited (logical parent, with templatedParent
    // fallback) — so template internals find resources defined on the
    // templated control or on the consumer's surrounding tree. Each
    // ancestor's dictionary is queried via Resolve so MergedDictionaries
    // are included; closer ancestors shadow farther ones. Returns
    // undefined when no ancestor's composition contains the key.
    public TryFindResource(key: ResourceKey): unknown | undefined
    {
        return (this._resourceResolver ??= new ResourceResolver(this)).TryFindResource(key);
    }

    // Throws when the resource isn't found anywhere up the chain — use
    // when the caller treats absence as a programming error. For
    // optional lookups use TryFindResource.
    public FindResource(key: ResourceKey): unknown
    {
        const v = this.TryFindResource(key);
        if (v === undefined)
        {
            const desc = typeof key === 'string' ? `'${key}'` : `[${(key as Function).name}]`;
            throw new Error(`Element.FindResource: resource ${desc} not found in any logical ancestor.`);
        }
        return v;
    }

    // Explicit style for this Element. When set, takes priority over
    // any implicit (TargetType-keyed) style discovered in the ancestor
    // resource chain. Setting it to undefined re-promotes the implicit
    // style (if one was found at AttachLogical).
    //
    // Style setters apply to the StyleValue priority tier in EVD —
    // they sit below LocalValue / Binding / Animated / Coerced, so
    // an explicit set or binding always shadows the styled value, but
    // above InheritedValue / Default.
    public get Style(): Style | undefined { return this.get_property_value(Element.StyleKey); }
    public set Style(value: Style | undefined)
    {
        const old = this.Style;
        if (old === value) return;
        this.set_property_value(Element.StyleKey, value);
        this.refresh_active_style();
    }

    // Read-only at the instance level. Subclasses override the default
    // value via Model.OverrideMetadata at type-init; see the docstring
    // on DefaultStyleKeyKey. Returns undefined for any Element whose
    // class (or any base) hasn't opted in.
    public get DefaultStyleKey(): Function | undefined
    {
        return this.get_property_value(Element.DefaultStyleKeyKey);
    }

    // Pick which Style should be driving the StyleValue tier. Priority
    // matches WPF: explicit Style > implicit (user-side
    // [TargetType=X] walked from the live tree, exact-match by
    // constructor) > theme (DefaultStyleKey-keyed, lives in merged
    // theme dictionaries). Delegates the diff-swap of setters +
    // triggers to `StyleApplicator` (§ 1.7); the applicator is
    // created lazily on first touch so Elements that never opt into
    // Style pay zero allocation.
    private refresh_active_style(): void
    {
        const desired = this.Style ?? this._implicitStyle ?? this._themeStyle;
        if (desired === this._styleApplicator?.ActiveStyle) return;
        (this._styleApplicator ??= new StyleApplicator(this)).RefreshActiveStyle(desired);
    }

    // § 1.7 trampolines — apply_setter / unapply_setter now live on
    // StyleApplicator. Element keeps thin wrappers so the trigger
    // install / uninstall machinery (on TriggerHost) continues calling
    // them without knowing about the applicator.
    private apply_setter(setter: Setter, tier: 'style' | 'trigger'): void
    {
        (this._styleApplicator ??= new StyleApplicator(this)).ApplySetter(setter, tier);
    }

    private unapply_setter(setter: Setter, tier: 'style' | 'trigger'): void
    {
        this._styleApplicator?.UnapplySetter(setter, tier);
    }

    // Public hooks used by DataTemplate triggers — they let a trigger
    // wired up at the template root apply/clear setters on a named
    // descendant ('TargetName' in WPF) at the Trigger priority tier,
    // exactly the way a Style-installed PropertyTrigger/DataTrigger
    // would but with the styled visual and the setter target being two
    // different Elements. The setter machinery itself doesn't care about
    // the split; it just operates on `this`.
    public ApplyTriggerSetter(setter: Setter): void
    {
        this.apply_setter(setter, 'trigger');
    }
    public ClearTriggerSetter(setter: Setter): void
    {
        this.unapply_setter(setter, 'trigger');
    }

    // Looks up an implicit Style keyed by this Element's constructor in
    // the ancestor resource chain. Called from AttachLogical (newly in
    // a tree, may have an implicit Style above), from DetachLogical
    // (no chain anymore, implicit clears), and from the ancestor-
    // resource subscriptions wired by subscribe_styles (a dictionary
    // change might add / remove the implicit style).
    private resolve_implicit_style(): void
    {
        // Function-keyed entries in the resource chain may be Styles
        // (user-side `[TargetType=X]`) OR ControlTemplates (the bundled
        // controls theme's `[TargetType=X]` Templates). The implicit-Style
        // path takes Styles only — guard with `instanceof Style` so a
        // ControlTemplate registered under the same key doesn't get
        // mis-applied here (the control's constructor reads the
        // template directly via Application.ResolveDefaultResource).
        const raw = this.TryFindResource(this.constructor);
        const found = raw instanceof Style ? raw : undefined;
        if (found === this._implicitStyle) return;
        this._implicitStyle = found;
        this.refresh_active_style();
    }

    // Theme-style counterpart of resolve_implicit_style. Looks up
    // `this.DefaultStyleKey` (a class function picked by metadata
    // override) in the same ancestor resource chain. An Element whose
    // DefaultStyleKey is undefined (the default) skips the lookup —
    // theme styling is opt-in per subclass. In practice the matching
    // entry lives in a merged theme dictionary on Application.Resources;
    // user-side [TargetType=X] entries closer in the chain hit
    // resolve_implicit_style first and shadow what we find here.
    private resolve_theme_style(): void
    {
        const key = this.DefaultStyleKey;
        const raw = key !== undefined ? this.TryFindResource(key) : undefined;
        // Same instanceof guard as resolve_implicit_style — Function
        // keys are shared with ControlTemplate registrations, so skip
        // anything that isn't a Style.
        const found = raw instanceof Style ? raw : undefined;
        if (found === this._themeStyle) return;
        this._themeStyle = found;
        this.refresh_active_style();
    }

    // Eagerly resolve the default Style and apply it. Convention for
    // templated controls: call this at the end of the subclass
    // constructor. The framework would otherwise only resolve styles
    // on AttachLogical (via _refresh_styles_subtree) — fine for tree-
    // mounted controls, but standalone tests / unmounted instances
    // would have a missing Template (and the visualChildren / Measure
    // contracts would observe an un-templated control). Calling this
    // is the WPF parity for the EnsureTemplate hook that runs lazily
    // in MeasureCore there; mural runs it eagerly at construction so
    // unattached visualChildren reads still see the default chrome.
    //
    // Idempotent: re-resolving the same Style is a no-op
    // (resolve_*_style short-circuits on identity match). Safe to call
    // multiple times during composition (e.g. when a subclass needs
    // the Template to be populated before its own ctor finishes).
    protected applyDefaultStyle(): void
    {
        this.resolve_implicit_style();
        this.resolve_theme_style();
    }

    // Subscribe to every ResourceDictionary in the ancestor chain so
    // changes to any of them re-resolve BOTH the implicit and theme
    // styles. Wired at AttachLogical; tree mutations rebuild via
    // _refresh_styles_subtree. Implicit and theme share one subscription
    // list because they consult the same chain — splitting would
    // double the subscribers on every dict for no benefit.
    private subscribe_styles(): void
    {
        this.unsubscribe_styles();
        const onChange = (): void =>
        {
            this.resolve_implicit_style();
            this.resolve_theme_style();
        };
        // The cursor walks the Visual ancestor chain, but the
        // `_resources` field we read lives on Element. Plain Visual
        // parents in the chain return undefined for the cast (the
        // field simply isn't on the instance), so the walk skips them.
        let cursor: Visual | undefined = this;
        while (cursor !== undefined)
        {
            const back = cursor as unknown as VisualAncestorAccess;
            if (cursor instanceof Element)
            {
                const r = cursor._resources;
                if (r !== undefined)
                {
                    (this._styleSubscriptions ??= []).push(r.Subscribe(onChange));
                }
            }
            cursor = back._logicalParent ?? back._templatedParent;
        }
        // Mirror the Application-level fallback in TryFindResource —
        // theme / implicit-style changes on the app's root dict must
        // trigger re-resolution here too.
        const appRd = Application.current?.Resources;
        if (appRd !== undefined)
        {
            (this._styleSubscriptions ??= []).push(appRd.Subscribe(onChange));
        }
    }

    private unsubscribe_styles(): void
    {
        if (this._styleSubscriptions === undefined) return;
        for (const unsub of this._styleSubscriptions) unsub();
        this._styleSubscriptions = undefined;
    }

    // Style writes via low-level `set_property_value("Style", …)`
    // (compiler-emitted paths, runtime-installed bindings) bypass the
    // public Style setter and miss its `refresh_active_style` call.
    // Catch them here so the new Style's setters / triggers install
    // no matter how the property is written. Other DP changes
    // delegate to the base Visual override.
    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        old_value: any,
        new_value: any,
    ): void
    {
        super.OnPropertyChanged(descriptor, old_value, new_value);
        if (descriptor.Name === 'Style') this.refresh_active_style();
    }

    /** @internal — § 1.10. Override of Visual's no-op stub. Walks
     *  this Element and every logical / overlay descendant, re-
     *  resolving implicit + theme styles and re-subscribing to
     *  ancestor ResourceDictionary changes. Recursion dispatches
     *  through Visual.`_refresh_styles_subtree` so plain Visual
     *  descendants no-op themselves; Element descendants run their
     *  override. */
    public override _refresh_styles_subtree(): void
    {
        this.unsubscribe_styles();
        this.resolve_implicit_style();
        this.resolve_theme_style();
        this.subscribe_styles();
        for (const c of this.allLogicalDescendantSubtreeRoots())
        {
            c._refresh_styles_subtree();
        }
    }

    /** @internal — § 1.10. See `_refresh_styles_subtree`. Tears down
     *  ancestor ResourceDictionary subscriptions across the subtree
     *  before a detach so they can't fire through the still-attached
     *  chain. */
    public override _unsubscribe_styles_subtree(): void
    {
        this.unsubscribe_styles();
        for (const c of this.allLogicalDescendantSubtreeRoots())
        {
            c._unsubscribe_styles_subtree();
        }
    }

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
