import { Visual, safeFire } from './visual.js';
import { Model } from '../runtime/model.js';
import { propertyValues } from '../runtime/model-internals.js';
import { PropertyValueSource } from '../runtime/binding/effective-value.js';
import { MetaData, inherits } from '../runtime/metadata.js';
import { NameScope } from './namescope.js';
import { ObservableCollection, type IReadOnlyObservableCollection } from '../runtime/observable-collection.js';
import { ResourceDictionary, type ResourceKey } from '../runtime/resource-dictionary.js';
import { Application } from '../runtime/application.js';
import { Setter, Style } from '../runtime/style.js';
import type { PropertyDescriptor } from '../runtime/property-descriptor.js';
import type { PropertyTrigger, MultiTrigger, DataTrigger, MultiDataTrigger } from '../runtime/style.js';
import type { EventTrigger } from '../runtime/event-trigger.js';
import { StyleApplicator } from './style-applicator.js';
import { TriggerHost, type ITriggerHost } from './trigger-host.js';
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

export class Element extends Visual implements ITriggerHost
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

    // Generic consumer-side handle, mirroring WPF's FrameworkElement.Tag.
    // Common use: bind a domain object to an Element so a click handler
    // / selection listener can recover the consumer's data without an
    // external WeakMap. Pure storage — never read by the framework
    // itself — hence MetaData.None.
    public static readonly TagKey = Model.RegisterProperty<unknown>(Element, 'Tag', undefined, MetaData.None);

    // Ambient data root for bindings. Inherits down the logical tree so
    // a binding written as `$Path` on a descendant resolves against the
    // nearest ancestor's DataContext. No measure / arrange / render
    // impact — pure data plumbing — hence the inherits-only flag.
    // IsAnimationProhibited: a DataContext swap is a coherent identity
    // change, not a value to tween; animating it would silently break
    // every binding rooted in it.
    public static readonly DataContextKey = Model.RegisterProperty<unknown>(Element, 'DataContext', undefined, MetaData.Inherits | MetaData.IsAnimationProhibited);

    // Disabled-state surface. WPF parity: a disabled Element swallows
    // pointer / keyboard input across its entire subtree, and templates
    // can observe `when (not IsEnabled)` to dim the chrome. Inherited
    // downward — setting it on a control disables every descendant.
    // Default `true` so untouched Elements stay interactive.
    //
    // Input gating lives in the routed-event dispatcher
    // (routed-event.ts): dispatchPointer / dispatchPointerDirect /
    // dispatchKey skip tunnels/bubbles when any ancestor (or the source
    // itself) reports IsEnabled=false. The dispatcher walks the visual
    // chain (which is `Visual[]`, not `Element[]`); Visual exposes a
    // no-op `IsEnabled` accessor stub returning the default `true` so
    // plain (non-Element) Visuals pass the gate naturally. Enter / Leave
    // still update IsMouseOver on enabled ancestors so hover chrome on
    // a disabled descendant's surrounding container behaves naturally.
    public static readonly IsEnabledKey = Model.RegisterProperty<boolean>(
        Element, 'IsEnabled', true, MetaData.Inherits | MetaData.IsAnimationProhibited);

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

    // Generic consumer-side handle. The framework never reads Tag;
    // consumers attach arbitrary data (a domain object, a routing key,
    // an action delegate) so click / selection handlers can recover it
    // without an out-of-band map. WPF parity. Overrides Visual's no-op
    // stub pair (§ Phase B / B5.1) with real DP-backed access.
    public override get Tag(): unknown { return this.get_property_value(Element.TagKey); }
    public override set Tag(value: unknown) { this.set_property_value(Element.TagKey, value); }

    // Ambient data root for descendants' bindings. Inherits down the
    // logical tree (§ B4.4). Overrides Visual's no-op stub pair
    // (§ Phase B / B5.2) with real DP-backed access.
    public override get DataContext(): unknown { return this.get_property_value(Element.DataContextKey); }
    public override set DataContext(value: unknown) { this.set_property_value(Element.DataContextKey, value); }

    // Disabled-state surface. WPF parity, inherits down the logical
    // tree (§ B4.4). Overrides Visual's `true`-returning stub pair
    // (§ Phase B / B5.3) with real DP-backed access — only an Element
    // can actually be disabled.
    public override get IsEnabled(): boolean { return this.get_property_value(Element.IsEnabledKey); }
    public override set IsEnabled(value: boolean) { this.set_property_value(Element.IsEnabledKey, value); }

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
    // no matter how the property is written. Also fans out the
    // ambient-resource-trigger DP cascade (§ 17.1 — ThemeManager-
    // registered Scheme / Theme inherited DPs) so DynamicResource
    // bindings re-resolve against the new scheme. Other DP changes
    // delegate to the base Visual override.
    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        old_value: any,
        new_value: any,
    ): void
    {
        super.OnPropertyChanged(descriptor, old_value, new_value);
        if (descriptor.Name === 'Style') this.refresh_active_style();
        if (inherits(descriptor.MetaData))
        {
            // Cascade the new inherited value to every logical /
            // overlay descendant. The cascade dispatches through
            // Element's `_refresh_inherited` override on each
            // descendant; plain Visual descendants no-op via Visual's
            // stub.
            this.propagate_inheritance_for_logical_children(descriptor);
            this.forEachOverlayChild(c => c._refresh_inherited(descriptor));
            // Ambient resource triggers (§ 17.1) — ThemeManager
            // registers Scheme / Theme as ambient-resource-trigger
            // DPs. When one of those values cascades to this Element,
            // every DynamicResource binding rooted here re-resolves.
            if (ResourceResolver.IsAmbientResourceTriggerDp(descriptor))
            {
                this._fire_dynamic_resource_listeners();
            }
        }
    }

    // ── Triggers (Property / Multi / Data / MultiData / Event) ───────

    // Trigger install / evaluation / teardown machinery lives on
    // `TriggerHost` (§ 1.8). Lazy — Elements that never opt into
    // Style / Triggers pay zero cost.
    private _triggerHost: TriggerHost | undefined;

    // Public hook to wire a stand-alone EventTrigger onto an
    // Element. Templated controls install their own EventTriggers
    // through the Style cascade; this surface is for consumers
    // wiring an EventTrigger directly (rare but documented). Thin
    // aliases for `InstallEventTrigger` / `UninstallEventTrigger`
    // (the `ITriggerHost` surface) — kept for the conventional
    // Add/Remove naming that consumer call sites read with.
    public AddEventTrigger(trigger: EventTrigger): void
    {
        this.InstallEventTrigger(trigger);
    }

    public RemoveEventTrigger(trigger: EventTrigger): void
    {
        this.UninstallEventTrigger(trigger);
    }

    // ── ITriggerHost implementation ──────────────────────────────────
    //
    // Element formally implements `ITriggerHost` by forwarding to a
    // lazily-allocated `TriggerHost`. The seven methods below match
    // the interface signature one-for-one; an Element that never has
    // a trigger installed never allocates a TriggerHost. Called from
    // `StyleApplicator.RefreshActiveStyle` (via the `ITriggerHost`
    // typed reference) during a Style swap and from the public
    // `AddEventTrigger` / `RemoveEventTrigger` consumer surface above.

    public InstallTrigger(trigger: PropertyTrigger): void
    {
        (this._triggerHost ??= new TriggerHost(this)).InstallTrigger(trigger);
    }

    public InstallMultiTrigger(trigger: MultiTrigger): void
    {
        (this._triggerHost ??= new TriggerHost(this)).InstallMultiTrigger(trigger);
    }

    public InstallDataTrigger(trigger: DataTrigger): void
    {
        (this._triggerHost ??= new TriggerHost(this)).InstallDataTrigger(trigger);
    }

    public InstallMultiDataTrigger(trigger: MultiDataTrigger): void
    {
        (this._triggerHost ??= new TriggerHost(this)).InstallMultiDataTrigger(trigger);
    }

    public InstallEventTrigger(trigger: EventTrigger): void
    {
        (this._triggerHost ??= new TriggerHost(this)).InstallEventTrigger(trigger);
    }

    public UninstallTrigger(trigger: PropertyTrigger | MultiTrigger | DataTrigger | MultiDataTrigger): void
    {
        this._triggerHost?.UninstallTrigger(trigger);
    }

    public UninstallEventTrigger(trigger: EventTrigger): void
    {
        this._triggerHost?.UninstallEventTrigger(trigger);
    }

    // ── DynamicResource re-wire support ──────────────────────────────
    //
    // DynamicResource bindings cache their ancestor-chain subscriptions
    // at construction. Reparenting changes the chain (new ancestors
    // visible, old ones gone), so the binding has to re-walk. Each
    // binding registers a re-wire callback via _subscribe_dynamic_resource;
    // AttachLogical / DetachLogical fire them across the subtree.
    private _dynamic_resource_listeners: Array<() => void> | undefined;

    /** @internal — DynamicResourceBinding only. Subscribes a callback
     *  that fires when this Element's ancestor chain may have changed.
     *  Returns an unsubscribe thunk. */
    public _subscribe_dynamic_resource(listener: () => void): () => void
    {
        (this._dynamic_resource_listeners ??= []).push(listener);
        return (): void =>
        {
            if (this._dynamic_resource_listeners === undefined) return;
            const i = this._dynamic_resource_listeners.indexOf(listener);
            if (i >= 0) this._dynamic_resource_listeners.splice(i, 1);
        };
    }

    /** @internal — override of Visual's no-op stub. Fired on the
     *  per-visual edge from `Visual.SetTemplatedParent` so a
     *  freshly-stamped template node's DynamicResource bindings see
     *  the new templated-parent chain. Also called locally from
     *  `_refresh_dynamic_resources_subtree` for the subtree cascade
     *  and from `OnPropertyChanged` for the ambient-resource-trigger
     *  cascade. */
    public override _fire_dynamic_resource_listeners(): void
    {
        safeFire(this._dynamic_resource_listeners);
    }

    /** @internal — § 1.10. Override of Visual's no-op stub. Re-walks
     *  every DynamicResource binding rooted in this subtree so cached
     *  ancestor-chain subscriptions pick up the new chain after a
     *  reparent / theme override. Plain Visual descendants no-op
     *  themselves via the base stub. */
    public override _refresh_dynamic_resources_subtree(): void
    {
        this._fire_dynamic_resource_listeners();
        this.propagate_dynamic_resources_to_logical_children();
        // Overlay children's DynamicResource bindings cached against the
        // OLD chain (before this Element joined / left its ancestor's
        // tree). Re-walking through the popup's subtree re-resolves
        // every `@Token` lookup so theme tokens flip when the owner's
        // chain changes.
        this.forEachOverlayChild(c => c._refresh_dynamic_resources_subtree());
    }

    protected propagate_dynamic_resources_to_logical_children(): void
    {
        this.forEachLogicalChild(c => c._refresh_dynamic_resources_subtree());
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

    // ── Name + NameScope + FindName (§ Phase B / B4.6) ────────────────

    // Optional x:Name-equivalent — a stable identifier used by
    // FindName to look this Element up later. Backed by `_name`
    // because Visual exposes Name as a no-op accessor pair; a TS
    // subclass overrides accessors with accessors.
    private _name: string | undefined;
    public override get Name(): string | undefined { return this._name; }
    public override set Name(v: string | undefined) { this._name = v; }

    // Per-instance NameScope attached to this Element. When set,
    // this Element is the boundary for FindName lookups from any
    // logical descendant — the walk stops here and resolves in this
    // scope. ControlTemplate.Apply attaches a fresh NameScope to the
    // template root so each template instance gets its own name
    // space (PART_Background in two Button templates don't collide).
    private _nameScope: NameScope | undefined;

    public override get nameScope(): NameScope | undefined
    {
        return this._nameScope;
    }

    public override SetNameScope(scope: NameScope | undefined): void
    {
        this._nameScope = scope;
    }

    // Resolves an x:Name to a Visual within the nearest enclosing
    // NameScope. Walks up logical ancestors (with templatedParent
    // fallback for template internals — same path as walk_inherited)
    // until it hits the first Element carrying a NameScope, then
    // resolves in that scope. Returns undefined when no ancestor
    // carries a scope, or when the name isn't registered in the
    // scope that's found.
    public override FindName(name: string): Visual | undefined
    {
        let cursor: Element | undefined = this;
        while (cursor !== undefined)
        {
            if (cursor._nameScope !== undefined)
            {
                return cursor._nameScope.Find(name);
            }
            const next: Visual | undefined = cursor._logicalParent ?? cursor._templatedParent;
            // The cursor walks Element ancestors. A plain-Visual parent
            // (rare; production has none) terminates the walk — it owns
            // no NameScope and no further logical/templated parent.
            cursor = next instanceof Element ? next : undefined;
        }
        return undefined;
    }

    // ── Templated-parent back-pointer (§ Phase B / B4.5) ─────────────

    // The control whose ControlTemplate generated this Element, or
    // undefined for Elements the consumer authored directly. Set by
    // the template-apply pipeline on every node in a template's
    // generated subtree. Read by TemplateBinding, walk_inherited
    // (template internals fall back here to reach the templated
    // control's logical ancestry), and ResourceResolver.
    private _templatedParent: Visual | undefined;

    public override get templatedParent(): Visual | undefined
    {
        return this._templatedParent;
    }

    public override SetTemplatedParent(p: Visual | undefined): void
    {
        const changed = this._templatedParent !== p;
        this._templatedParent = p;
        // Re-fire DynamicResource bindings attached to this Element.
        // Bindings constructed inside a ControlTemplate factory walk
        // the ancestor chain at construction time — when the element
        // had no templated parent yet — and would otherwise hold an
        // empty resolution chain. Stamping the templated parent
        // expands the chain (templatedParent fallback now reaches the
        // owning Application's Resources via the templated control's
        // ancestors), so the binding needs a chance to re-resolve.
        if (changed) this._fire_dynamic_resource_listeners();
    }

    // ── Logical-tree parent (FE-tier inheritance + resource chain) ────

    // Parent in the LOGICAL tree — what property inheritance and
    // resource lookup walk. Set by AttachLogical (still on Visual
    // pre-B4.3), cleared by DetachLogical. For Elements added through
    // the normal `Attach` helper, logicalParent === visualParent. Only
    // the field lives here; AttachLogical / DetachLogical themselves
    // move in B4.3 alongside the inheritance / style cascades that
    // their wiring fires. Typed `Visual | undefined` to match the
    // friend-interface shape Visual code uses to read it through
    // `ElementLogicalChain`.
    private _logicalParent: Visual | undefined;

    protected override get logicalParent(): Visual | undefined
    {
        return this._logicalParent;
    }

    public override GetLogicalParent(): Visual | undefined
    {
        return this._logicalParent;
    }

    protected override SetLogicalParent(p: Visual | undefined): void
    {
        this._logicalParent = p;
    }

    // ── Property-value inheritance (§ Phase B / B4.4) ─────────────────

    private walk_inherited(key: string): unknown | undefined
    {
        // Inheritance follows the LOGICAL tree — DataContext, font
        // properties, etc. flow through "where the consumer wrote
        // this", not "where the template put it visually". For all
        // non-templated trees the logical and visual parents are the
        // same instance, so behavior matches the pre-split codebase.
        //
        // For template-generated Elements (templatedParent set), the
        // top of the logical chain hops onto the templated control —
        // template internals inherit from the consumer's authored
        // ancestry, with the templated control as the bridge.
        //
        // `_logicalParent` (B4.2) and `_templatedParent` (B4.5) are
        // both Element-private fields. The cursor walks Element
        // ancestors and accesses them directly.
        let cursor: Element = this;
        while (true)
        {
            const next = cursor._logicalParent ?? cursor._templatedParent;
            if (next === undefined) return undefined;
            const evd = propertyValues(next).get(key);
            if (evd !== undefined && evd.Source !== PropertyValueSource.Default)
            {
                return evd.value;
            }
            // The cursor walks Element ancestors. Plain Visual parents
            // (rare; production has none) would terminate the walk —
            // their EVD bag would still be inspectable above, but their
            // `_logicalParent` is Visual's no-op stub returning
            // undefined, so the next iteration would exit.
            if (!(next instanceof Element)) return undefined;
            cursor = next;
        }
    }

    /** @internal — § 1.10. Override of Visual's no-op stub. Re-
     *  resolves the inherited value for the given descriptor on this
     *  Element; the subtree cascade runs through the logical +
     *  overlay subtree via the propagate_inheritance_* virtuals. */
    public override _refresh_inherited(descriptor: PropertyDescriptor): void
    {
        if (!inherits(descriptor.MetaData)) return;
        const key = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        const value = this.walk_inherited(key);
        if (value !== undefined)
        {
            this['ensure_effective_value_for'](descriptor).SetInheritedValue(value);
        }
        else
        {
            propertyValues(this).get(key)?.ClearInherited();
        }
    }

    /** @internal — § 1.10. Override of Visual's no-op stub. Refresh
     *  every inheritable DP on this Element and cascade through the
     *  logical + overlay subtree. Fired when the ancestor chain
     *  restructures. */
    public override _refresh_inheritance_subtree(): void
    {
        for (const descriptor of Visual._collect_inheritable_descriptors(this.constructor))
        {
            this._refresh_inherited(descriptor);
        }
        this.propagate_inheritance_to_logical_children();
        // Overlay children participate alongside logical children —
        // they're the same logical tree from the popup's perspective.
        this.forEachOverlayChild(c => c._refresh_inheritance_subtree());
    }

    protected propagate_inheritance_to_logical_children(): void
    {
        this.forEachLogicalChild(c => c._refresh_inheritance_subtree());
    }

    protected propagate_inheritance_for_logical_children(descriptor: PropertyDescriptor): void
    {
        this.forEachLogicalChild(c => c._refresh_inherited(descriptor));
    }

    // ── Logical-tree attach / detach (§ Phase B / B4.3) ──────────────

    // Convenience for the common case where a child belongs to BOTH
    // trees with the same parent — every user-supplied child of a
    // non-templated Panel or Single goes through here. Templated
    // controls call AttachVisual and AttachLogical independently when
    // the trees diverge. AttachVisual lives on Visual (visual-tree
    // hop) and is inherited; AttachLogical lives here (FE-tier).
    protected Attach(child: Visual): void
    {
        this.AttachVisual(child);
        this.AttachLogical(child);
    }

    protected Detach(child: Visual): void
    {
        this.DetachLogical(child);
        this.DetachVisual(child);
    }

    // LOGICAL-tree wiring only: sets the child's logical parent and
    // refreshes property-value inheritance for the new ancestry. Use
    // directly from templating code when slotting consumer-supplied
    // logical content into a templated control (the child's visual
    // parent is set separately by the ContentPresenter /
    // ItemsPresenter doing the visual slotting). Accepts `Visual`
    // because callers' references are Visual-typed; non-Element
    // children silently no-op for the logical-tree state writes
    // (`SetLogicalParent` is a Visual-tier no-op stub on plain
    // Visuals — B4.2) and skip the cascade calls (also Visual stubs).
    protected AttachLogical(child: Visual): void
    {
        if (child === this)
        {
            throw new Error('An Element cannot be its own logical child.');
        }
        // Plain Visuals carry no logical-tree state — the
        // SetLogicalParent / inheritance / style / DynamicResource
        // cascades are all FE-tier. Skip silently for non-Element
        // children; the AttachVisual hop in `Attach()` still runs.
        if (!(child instanceof Element)) return;
        // The Element overrides of GetLogicalParent (B4.2) return the
        // actual parent; the check catches Element children that
        // already have a parent.
        if (child.GetLogicalParent() !== undefined)
        {
            throw new Error('Element already has a logical parent; detach it from the current parent first.');
        }
        child.SetLogicalParent(this);
        child._refresh_inheritance_subtree();
        // Style lookups run AFTER inheritance refresh — the resource
        // chain now reflects the child's new ancestry, so the
        // type-keyed Style lookup (implicit via constructor + theme
        // via DefaultStyleKey) sees what the consumer would see at
        // this position in the tree.
        child._refresh_styles_subtree();
        // DynamicResource bindings cached their ancestor-chain
        // subscriptions at construction. Reparenting grew (or shrank)
        // that chain — re-walk so any new ancestor's Resources dict
        // becomes observable.
        child._refresh_dynamic_resources_subtree();
    }

    protected DetachLogical(child: Visual): void
    {
        // Mirrors AttachLogical: plain Visuals carry no logical-tree
        // state, so DetachLogical is a no-op for them. The DetachVisual
        // hop in `Detach()` still tears down the visual side.
        if (!(child instanceof Element)) return;
        if (child.GetLogicalParent() !== this)
        {
            throw new Error('Cannot detach an Element that is not a logical child of this.');
        }
        // Tear down ancestor-resource subscriptions FIRST (whole
        // subtree) so a mutation on the now-detached chain doesn't
        // fire resolve_implicit_style / resolve_theme_style through
        // stale subs.
        child._unsubscribe_styles_subtree();
        child.SetLogicalParent(undefined);
        child._refresh_inheritance_subtree();
        // No ancestor chain anymore — re-resolve drops any inherited
        // implicit or theme style across the subtree.
        child._refresh_styles_subtree();
        // DynamicResource bindings re-walk their ancestor chain.
        child._refresh_dynamic_resources_subtree();
    }

    // ── Overlay children (logical-owner-side wiring) ─────────────────
    //
    // Elements that THIS Element owns as overlay-mounted children —
    // popups, dropdowns, drag previews, tooltips. Distinct from visual
    // children (which paint as descendants in the visualParent's slot)
    // and from standard logical children: an overlay child has its
    // VISUAL parent set to the host's OverlayLayer but its LOGICAL
    // parent set to this Element (so resource / DataContext /
    // inheritable-DP cascades flow from the owning control, not from
    // the overlay layer — see § 18.10). Populated by
    // `AttachOverlayChild`, cleared by `DetachOverlayChild`. Walked
    // alongside `logicalChildren` by the inheritance / style /
    // dynamic-resource subtree cascades.
    private _overlayChildren: Visual[] | undefined;

    // Cascade-iteration helper (§ 1.5). Yields every direct subtree
    // root that should receive a subtree-wide refresh — logical
    // children for the main tree, plus any overlay children. Override
    // of Visual's empty generator so cascades that walk overlay roots
    // (Style / Resources / DynamicResource subtree refresh) see them.
    protected override *allLogicalDescendantSubtreeRoots(): IterableIterator<Visual>
    {
        for (const c of this.logicalChildren) yield c;
        if (this._overlayChildren !== undefined)
        {
            for (const c of this._overlayChildren) yield c;
        }
    }

    // Companion helper for hot-path cascades that already use the
    // `propagate_*_to_logical_children` virtual quartet. Calling this
    // immediately after the propagate_* call covers the overlay branch
    // without re-traversing the main logical tree.
    protected override forEachOverlayChild(fn: (child: Visual) => void): void
    {
        if (this._overlayChildren === undefined) return;
        for (const c of this._overlayChildren) fn(c);
    }

    /** Public-but-not-for-consumer-use. Attaches `child` as an
     *  overlay-mounted logical child of this Element: visual hop
     *  into the host's OverlayLayer; logical hop sets `child`'s
     *  logicalParent to this. Symmetric with AddChild / RemoveChild
     *  for the in-tree case. Throws if this Element has no host
     *  target yet — the visual hop can't resolve without one. */
    public override AttachOverlayChild(child: Visual): void
    {
        const t = this['target'] as ReturnType<Visual['FindAncestorPresentationTarget']>;
        if (t === undefined)
        {
            throw new Error(
                'Element.AttachOverlayChild: this Element is not attached to a presentation target — '
                + 'wait until the owner is mounted before attaching overlay children.',
            );
        }
        // Logical hop is idempotent — controls that re-mount their
        // popup across a host-target swap tear down the visual hop
        // directly via `oldTarget.DetachOverlay` and then call
        // AttachOverlayChild again. The logical relationship persists;
        // only the visual hop flips.
        const alreadyOwned = this._overlayChildren?.includes(child) === true;
        if (!alreadyOwned)
        {
            if (this._overlayChildren === undefined) this._overlayChildren = [];
            this._overlayChildren.push(child);
            // Logical hop: child._logicalParent = this; runs the
            // inheritance / style / DynamicResource refreshes through
            // child's subtree.
            this.AttachLogical(child);
        }
        // Visual hop: the host materialises its OverlayLayer (if not
        // yet present) and adds the child as a VISUAL-only panel
        // child.
        t.AttachOverlay(child);
    }

    public override DetachOverlayChild(child: Visual): void
    {
        const t = this['target'] as ReturnType<Visual['FindAncestorPresentationTarget']>;
        // Visual hop first so the renderer drops the child before its
        // logical owner releases inheritance state.
        if (t !== undefined) t.DetachOverlay(child);
        if (this._overlayChildren !== undefined)
        {
            const i = this._overlayChildren.indexOf(child);
            if (i >= 0) this._overlayChildren.splice(i, 1);
        }
        // Detach the logical hop only if it still points here — the
        // child may have been re-parented externally (rare).
        if (child.GetLogicalParent() === this) this.DetachLogical(child);
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
