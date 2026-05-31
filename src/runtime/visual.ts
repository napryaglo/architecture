import { Model } from './model.js';
import type { PropertyDescriptor } from './property-descriptor.js';
import { PropertyValueSource } from './effective-value.js';
import { MetaData, affectsArrange, affectsMeasure, affectsRender, inherits } from './metadata.js';
import { Binding } from './binding.js';
import { NameScope } from './namescope.js';
import { ObservableCollection, type IReadOnlyObservableCollection } from './observable-collection.js';
import { ResourceDictionary, type ResourceKey } from './resource-dictionary.js';
import { Application } from './application.js';
import { Setter, SetterFactory, Style, PropertyTrigger, MultiTrigger } from './style.js';
import { Rect, Size, Thickness } from './primitives.js';
import type { DrawingContext } from './drawing-context.js';
import type { TextMeasurer } from './text-measurer.js';

// Horizontal positioning of a Visual within its parent-given slot when
// the rendered area is smaller than the slot. Stretch fills the slot
// when no explicit Width is set; with an explicit Width, Stretch falls
// back to Center (WPF semantics).
export enum HorizontalAlignment
{
    Left    = 'left',
    Center  = 'center',
    Right   = 'right',
    Stretch = 'stretch',
}

// Vertical counterpart of HorizontalAlignment.
export enum VerticalAlignment
{
    Top     = 'top',
    Center  = 'center',
    Bottom  = 'bottom',
    Stretch = 'stretch',
}

// What a Visual sees of its host. Concrete implementation lives in the
// visual-engine layer (PresentationTarget and its subclasses). Defined
// here so Visual has typed references for routing layout/render
// invalidation without runtime importing visual-engine. The visual-
// engine class satisfies this contract structurally.
export interface VisualHost
{
    OnMeasureInvalidated(visual: Visual): void;
    OnArrangeInvalidated(visual: Visual): void;
    OnRenderInvalidated(visual: Visual): void;

    // Per-environment text measurement service. Visuals that need to
    // size text (TextBlock, future label-bearing controls) read this
    // during MeasureOverride. Defaults to APPROXIMATE_TEXT_MEASURER on
    // PresentationTarget unless a concrete subclass wires something more
    // accurate (FontMetricsMeasurer with loaded fonts, a future
    // CanvasTextMeasurer in HtmlTarget, etc.).
    readonly TextMeasurer: TextMeasurer;
}

// Tree-aware Model with WPF-style layout + render lifecycle.
//
// Public lifecycle entry points (called by the layout/render pass — do
// not override directly):
//   * Measure(availableSize)  → caches DesiredSize via MeasureOverride
//   * Arrange(finalRect)      → caches RenderSize + ArrangedRect via ArrangeOverride
//   * Render(dc)              → delegates to RenderOverride
//
// Subclass override points (where layout / drawing policy lives):
//   * MeasureOverride(availableSize): Size  — return the desired size
//   * ArrangeOverride(finalSize): Size      — place children, return actual used size
//   * RenderOverride(dc)                    — emit drawing primitives for THIS Visual
//
// Invalidation API (call these when something that affects layout or
// rendering changes — usually fired automatically through OnPropertyChanged
// per the property's MetaData flags):
//   * InvalidateMeasure()   — measure + arrange cache invalidated, host notified
//   * InvalidateArrange()   — arrange cache invalidated, host notified
//   * InvalidateVisual()    — render request, host notified
//
// Tree + host:
//   * parent: Visual | undefined  — set by Attach / Detach
//   * target: VisualHost | undefined — back-pointer to the PresentationTarget
//     owning this tree, propagated through Attach / Detach for O(1) lookup
//
// Plain Models stay storage-only. Only Visuals participate in layout,
// rendering, the visual tree, and property value inheritance.
export class Visual extends Model
{
    static {
        // NaN is the "not set" sentinel for explicit size constraints —
        // matches WPF FrameworkElement.Width / .Height. Marked Measure
        // so changing either invalidates the layout pass.
        Model.RegisterProperty(Visual, 'Width',     Number.NaN,                MetaData.Measure);
        Model.RegisterProperty(Visual, 'Height',    Number.NaN,                MetaData.Measure);
        Model.RegisterProperty(Visual, 'MinWidth',  0,                         MetaData.Measure);
        Model.RegisterProperty(Visual, 'MinHeight', 0,                         MetaData.Measure);
        Model.RegisterProperty(Visual, 'MaxWidth',  Number.POSITIVE_INFINITY,  MetaData.Measure);
        Model.RegisterProperty(Visual, 'MaxHeight', Number.POSITIVE_INFINITY,  MetaData.Measure);
        Model.RegisterProperty(Visual, 'HorizontalAlignment', HorizontalAlignment.Stretch, MetaData.Arrange);
        Model.RegisterProperty(Visual, 'VerticalAlignment',   VerticalAlignment.Stretch,   MetaData.Arrange);
        // Outer spacing around this Visual. Eats into availableSize at
        // Measure time, inflates DesiredSize so the parent reserves the
        // space, and offsets the rendered area at Arrange time. Mirrors
        // WPF FrameworkElement.Margin.
        Model.RegisterProperty(Visual, 'Margin',  Thickness.Zero, MetaData.Measure);
        // Style isn't inherited (each Visual carries its own); changing
        // it can affect Measure/Arrange/Render via whichever setters
        // it contains, but the Style property itself doesn't need a
        // metadata flag — the underlying property changes from
        // SetStyleValue fire their own invalidation per their own
        // metadata. MetaData.None keeps OnPropertyChanged from doing
        // redundant work.
        Model.RegisterProperty(Visual, 'Style',   undefined,      MetaData.None);
        // Optional clip geometry applied to this Visual and its
        // visual subtree at render time. Typed as `unknown` here so
        // the runtime doesn't depend on visual-engine's Geometry
        // class — the host's DrawingContext.PushClip is what reads
        // it. MetaData.Render so changes re-render.
        Model.RegisterProperty(Visual, 'Clip',    undefined,      MetaData.Render);
        // Ambient data root for bindings. Inherits down the logical
        // tree so a binding written as `$Path` on a descendant
        // resolves against the nearest ancestor's DataContext. No
        // measure / arrange / render impact — pure data plumbing —
        // hence the inherits-only flag.
        Model.RegisterProperty(Visual, 'DataContext', undefined, MetaData.Inherits);
    }

    public get DataContext(): unknown { return this.get_property_value('DataContext'); }
    public set DataContext(value: unknown) { this.set_property_value('DataContext', value); }

    // Two parent pointers: visual (renderer / hit-testing / target
    // propagation) and logical (property inheritance / future named-
    // element scoping / resource lookup). For all non-templated Visuals
    // both pointers reference the same parent — they only diverge when
    // a ControlTemplate slots user-supplied logical content into a
    // template-generated visual subtree (Phase 2 work). Default Attach
    // sets both; AttachVisual / AttachLogical exist for template code
    // to wire them independently.
    private _visualParent:  Visual | undefined;
    private _logicalParent: Visual | undefined;
    private _target: VisualHost | undefined;

    // The control whose ControlTemplate generated this Visual, or
    // undefined for Visuals authored by the consumer. Set by the
    // template-apply pipeline (Controls/control-template.ts) on every
    // node in the template's generated subtree. Read by TemplateBinding
    // and by walk_inherited (template internals fall back through here
    // to reach the templated control's logical ancestry).
    private _templatedParent: Visual | undefined;

    // Optional x:Name-equivalent — a stable identifier used by
    // FindName to look this Visual up later. Set freely by consumers
    // or by template factories; registration in a NameScope is
    // automatic when the Visual is later added to a tree under a
    // NameScope-bearing ancestor (template Apply auto-registers
    // every named Visual in the template's instance NameScope).
    public Name: string | undefined;

    // Per-instance NameScope attached to this Visual. When set, this
    // Visual is the boundary for FindName lookups from any logical
    // descendant — the walk stops here and resolves in this scope.
    // ControlTemplate.Apply attaches a fresh NameScope to the
    // template root so each template instance gets its own name
    // space (PART_Background in two Button templates don't collide).
    private _nameScope: NameScope | undefined;

    // Per-instance ResourceDictionary, lazy-created on first access.
    // Read directly (not through the public Resources getter) by
    // TryFindResource so an ancestor walk doesn't accidentally allocate
    // empty dicts on every node it passes through.
    private _resources: ResourceDictionary | undefined;

    // The Style currently driving the StyleValue slot for this Visual's
    // properties. Always equals the explicit Style if one is set; falls
    // back to the implicit style resolved at AttachLogical when explicit
    // is undefined. Tracked separately so the Style setter and the
    // implicit-style resolver can each clear the prior setters cleanly.
    private _activeStyle: Style | undefined;

    // The implicit style discovered by walking the logical chain at
    // AttachLogical and looking up `this.constructor` in the resource
    // dictionaries. Cached so DetachLogical knows what to unapply, and
    // so Style = undefined can re-promote it to active. Only populated
    // for Visuals whose ancestor chain contains a matching Style; left
    // undefined otherwise.
    private _implicitStyle: Style | undefined;

    // Subscriptions on ancestor ResourceDictionaries that, when fired,
    // re-trigger resolve_implicit_style. Wired at AttachLogical for
    // every dict found in the current ancestor chain; torn down at
    // DetachLogical or when refresh_implicit_subscriptions rebuilds
    // them after a tree mutation.
    private _implicitStyleSubscriptions: Array<() => void> = [];

    // Per-target bindings created from Setter.value (either a Binding
    // directly, or one produced by a SetterFactory). Keyed by the
    // owning Setter so unapply can locate and dispose them. Separate
    // maps for style-tier vs trigger-tier because the same Setter
    // instance can legally appear in both.
    private _styleSetterBindings: Map<Setter, Binding> = new Map();
    private _triggerSetterBindings: Map<Setter, Binding> = new Map();

    // Currently-matched triggers. A trigger is added on its watched
    // property matching the trigger's value; removed when the value
    // diverges. Trigger setters are applied / cleared in lock-step.
    private _activeTriggers: Set<PropertyTrigger | MultiTrigger> = new Set();

    // Per-trigger unsubscribe callback, set at install_trigger,
    // invoked at uninstall_trigger. Keyed by the trigger instance.
    private _triggerSubscriptions: Map<PropertyTrigger | MultiTrigger, () => void> = new Map();

    // Layout state cache. Updated by Measure / Arrange runs; read by the
    // renderer and by parents during their own MeasureOverride /
    // ArrangeOverride passes. _isMeasureValid / _isArrangeValid track
    // whether the cached values reflect the current property state — a
    // freshly-constructed Visual starts invalid; Invalidate* flips it back.
    private _desiredSize: Size = Size.Zero;
    private _renderSize: Size = Size.Zero;
    private _arrangedRect: Rect = Rect.Zero;
    private _previousAvailableSize: Size = Size.Empty;
    private _isMeasureValid: boolean = false;
    private _isArrangeValid: boolean = false;

    // ------------------------------------------------------------------
    // Tree + host
    // ------------------------------------------------------------------

    // Parent in the VISUAL tree — what the renderer walks. Set by
    // AttachVisual / cleared by DetachVisual (and through the Attach /
    // Detach convenience methods that wire both trees at once).
    protected get visualParent(): Visual | undefined
    {
        return this._visualParent;
    }

    // Parent in the LOGICAL tree — what property inheritance and
    // (future) named-element / resource lookup walk. Set by
    // AttachLogical / cleared by DetachLogical. For Visuals added
    // through Attach (i.e. every non-template-internal child today)
    // logicalParent === visualParent.
    protected get logicalParent(): Visual | undefined
    {
        return this._logicalParent;
    }

    // The control whose ControlTemplate generated this Visual, or
    // undefined for Visuals the consumer authored directly. Read by
    // TemplateBinding (future) and by debugging / tree-walking code
    // that needs to attribute a generated visual back to its owning
    // control. Not part of either tree's ancestor walk.
    public get templatedParent(): Visual | undefined
    {
        return this._templatedParent;
    }

    // Set by the template-apply pipeline (Controls/control-template.ts)
    // when stamping every node in a template's generated subtree.
    // Public-but-not-for-consumer-use: only the template machinery
    // should call this, but it can't be protected because the
    // machinery lives outside the Visual hierarchy.
    public SetTemplatedParent(p: Visual | undefined): void
    {
        this._templatedParent = p;
    }

    // The NameScope this Visual owns, or undefined. Read for FindName
    // boundary detection. Set by ControlTemplate.Apply (one per
    // template instance) and by future Window/PresentationTarget-level
    // scope creation. Public-but-not-for-consumer-use, same convention
    // as SetTemplatedParent.
    public get nameScope(): NameScope | undefined
    {
        return this._nameScope;
    }

    public SetNameScope(scope: NameScope | undefined): void
    {
        this._nameScope = scope;
    }

    // Resolves an x:Name to a Visual within the nearest enclosing
    // NameScope. Walks up logical ancestors (with templatedParent
    // fallback for template internals — same path as walk_inherited)
    // until it hits the first Visual carrying a NameScope, then
    // resolves in that scope.
    //
    // Returns undefined when no ancestor carries a scope, or when the
    // name isn't registered in the scope that's found. WPF semantics:
    // names are scoped, so the same name can exist in multiple
    // templates without collision — each lookup resolves only within
    // its own enclosing scope.
    public FindName(name: string): Visual | undefined
    {
        let cursor: Visual | undefined = this;
        while (cursor !== undefined)
        {
            if (cursor._nameScope !== undefined)
            {
                return cursor._nameScope.Find(name);
            }
            cursor = cursor._logicalParent ?? cursor._templatedParent;
        }
        return undefined;
    }

    // Lazy-created per-instance ResourceDictionary. Touching this
    // getter allocates an empty dict on first access — fine for
    // writers (`v.Resources.Set('Brush', …)`) but reads should go
    // through TryFindResource / FindResource, which check the
    // backing field directly and don't allocate at every walk step.
    public get Resources(): ResourceDictionary
    {
        if (this._resources === undefined)
        {
            this._resources = new ResourceDictionary();
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
        // Active Style's Resources first — covers `Setter.value =
        // SetterFactory(t => DynamicResource(t, 'Accent'))` patterns
        // where the lookup key lives on the Style itself rather than
        // on any tree-attached dict. BasedOn chain is walked inside
        // Style.TryResolveResource.
        if (this._activeStyle !== undefined)
        {
            const v = this._activeStyle.TryResolveResource(key);
            if (v !== undefined) return v;
        }
        let cursor: Visual | undefined = this;
        while (cursor !== undefined)
        {
            const r = cursor._resources;
            if (r !== undefined && r.CanResolve(key))
            {
                return r.Resolve(key);
            }
            cursor = cursor._logicalParent ?? cursor._templatedParent;
        }
        // Application-level fallback. The tree walk exhausts at the
        // topmost mounted root; when a key isn't found there, consult
        // the app's root resources. Matches WPF's FrameworkElement.
        // FindResource behavior. Returns undefined when no Application
        // is current — fine for unattached / test fixtures.
        return Application.current?.Resources.Resolve(key);
    }

    // Explicit style for this Visual. When set, takes priority over any
    // implicit (TargetType-keyed) style discovered in the ancestor
    // resource chain. Setting it to undefined re-promotes the implicit
    // style (if one was found at AttachLogical).
    //
    // Style setters apply to the StyleValue priority tier in EVD —
    // they sit below LocalValue / Binding / Animated / Coerced, so
    // an explicit set or binding always shadows the styled value, but
    // above InheritedValue / Default.
    public get Style(): Style | undefined { return this.get_property_value('Style'); }
    public set Style(value: Style | undefined)
    {
        const old = this.Style;
        if (old === value) return;
        this.set_property_value('Style', value);
        this.refresh_active_style();
    }

    // Pick which Style should be driving the StyleValue tier: explicit
    // beats implicit. Unapply the previous active style (if any), apply
    // the new one. Called from the Style setter and from the implicit-
    // style resolver hooked into AttachLogical / DetachLogical.
    private refresh_active_style(): void
    {
        const desired = this.Style ?? this._implicitStyle;
        if (desired === this._activeStyle) return;
        if (this._activeStyle !== undefined)
        {
            this.unapply_style(this._activeStyle);
        }
        this._activeStyle = desired;
        if (desired !== undefined)
        {
            this.apply_style(desired);
        }
    }

    private apply_style(style: Style): void
    {
        // Reject mismatched TargetType up front — applying a Style with
        // an incompatible target is a programming error that would
        // silently leak unrelated setters otherwise.
        if (!(this instanceof (style.TargetType as new (...args: any[]) => Visual)))
        {
            const actual = (this as Visual).constructor.name;
            throw new Error(
                `Style.TargetType '${style.TargetType.name}' does not match target '${actual}'.`,
            );
        }
        // Seal on first apply (WPF parity). Idempotent — subsequent
        // applies are no-ops on Seal but still drive the setters.
        style.Seal();

        for (const setter of style.ResolveSetters().values())
        {
            this.apply_setter(setter, 'style');
        }
        for (const trigger of style.ResolveTriggers())
        {
            this.install_trigger(trigger);
        }
        for (const multi of style.ResolveMultiTriggers())
        {
            this.install_multi_trigger(multi);
        }
    }

    private unapply_style(style: Style): void
    {
        // Triggers first: they sit ABOVE style values in priority, so
        // taking them down before the style values keeps the value
        // resolution coherent at each EVD step. Then style setters.
        for (const multi of style.ResolveMultiTriggers())
        {
            this.uninstall_trigger(multi);
        }
        for (const trigger of style.ResolveTriggers())
        {
            this.uninstall_trigger(trigger);
        }
        for (const setter of style.ResolveSetters().values())
        {
            this.unapply_setter(setter, 'style');
        }
    }

    // Apply a single setter at the requested priority tier. Handles
    // all three Setter.value shapes:
    //   * SetterFactory<T>  — invoked with `this` to produce the actual
    //                         value, recursively normalized.
    //   * Binding           — installed reactively; the binding's
    //                         current value is pushed to the tier and a
    //                         change subscription keeps it updated.
    //                         Stashed in the per-tier binding map for
    //                         later disposal.
    //   * any other value   — pushed to the tier directly.
    private apply_setter(setter: Setter, tier: 'style' | 'trigger'): void
    {
        const descriptor = Model['find_descriptor'](setter.owner, setter.property);
        if (descriptor === undefined) return;
        const evd = this.ensure_effective_value_for(descriptor);

        let value: unknown = setter.value;
        if (value instanceof SetterFactory)
        {
            value = (value as SetterFactory).create(this);
        }

        if (value instanceof Binding)
        {
            const binding = value;
            const push = (v: any): void => {
                if (tier === 'style') evd.SetStyleValue(v);
                else                  evd.SetTriggerValue(v);
            };
            push(binding.get_value());
            binding.setOnValueChanged((_old, newRaw) => {
                push(binding.apply_transform(newRaw));
            });
            (tier === 'style' ? this._styleSetterBindings : this._triggerSetterBindings).set(setter, binding);
        }
        else
        {
            if (tier === 'style') evd.SetStyleValue(value);
            else                  evd.SetTriggerValue(value);
        }
    }

    // Undo apply_setter — clear the tier on the target EVD, dispose
    // the per-target binding if one was installed, drop the
    // bookkeeping entry.
    private unapply_setter(setter: Setter, tier: 'style' | 'trigger'): void
    {
        const descriptor = Model['find_descriptor'](setter.owner, setter.property);
        if (descriptor === undefined) return;
        const key = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        const evd = this['property_values'].get(key);
        if (evd !== undefined)
        {
            if (tier === 'style') evd.ClearStyleValue();
            else                  evd.ClearTriggerValue();
        }
        const bindings = tier === 'style' ? this._styleSetterBindings : this._triggerSetterBindings;
        const binding = bindings.get(setter);
        if (binding !== undefined)
        {
            binding.setOnValueChanged(undefined);
            binding.dispose();
            bindings.delete(setter);
        }
    }

    // Subscribe to the trigger's watched property and run an initial
    // evaluation so an already-matching trigger activates immediately.
    private install_trigger(trigger: PropertyTrigger): void
    {
        const onChange = (): void => { this.evaluate_trigger(trigger); };
        this.AddPropertyChangedListener(trigger.propertyOwner, trigger.propertyName, onChange);
        this._triggerSubscriptions.set(trigger, () => {
            this.RemovePropertyChangedListener(trigger.propertyOwner, trigger.propertyName, onChange);
        });
        this.evaluate_trigger(trigger);
    }

    private uninstall_trigger(trigger: PropertyTrigger | MultiTrigger): void
    {
        this._triggerSubscriptions.get(trigger)?.();
        this._triggerSubscriptions.delete(trigger);
        if (this._activeTriggers.has(trigger))
        {
            for (const setter of trigger.setters)
            {
                this.unapply_setter(setter, 'trigger');
            }
            this._activeTriggers.delete(trigger);
        }
    }

    // Multi-property AND-trigger install. Subscribes to every condition's
    // (owner, name) pair so any change re-evaluates the conjunction.
    // Activation is all-or-nothing: setters apply only when every
    // watched value === its expected; they deactivate as soon as one
    // stops matching.
    private install_multi_trigger(trigger: MultiTrigger): void
    {
        const onChange = (): void => { this.evaluate_multi_trigger(trigger); };
        const unsubs: Array<() => void> = [];
        for (const cond of trigger.conditions)
        {
            this.AddPropertyChangedListener(cond.propertyOwner, cond.propertyName, onChange);
            unsubs.push(() =>
            {
                this.RemovePropertyChangedListener(
                    cond.propertyOwner, cond.propertyName, onChange);
            });
        }
        this._triggerSubscriptions.set(trigger, () => { for (const u of unsubs) u(); });
        this.evaluate_multi_trigger(trigger);
    }

    private evaluate_multi_trigger(trigger: MultiTrigger): void
    {
        const allMatch = trigger.conditions.every(cond =>
            this.get_property_value(cond.propertyOwner, cond.propertyName) === cond.value);
        const wasActive = this._activeTriggers.has(trigger);
        if (allMatch && !wasActive)
        {
            for (const setter of trigger.setters)
            {
                this.apply_setter(setter, 'trigger');
            }
            this._activeTriggers.add(trigger);
        }
        else if (!allMatch && wasActive)
        {
            for (const setter of trigger.setters)
            {
                this.unapply_setter(setter, 'trigger');
            }
            this._activeTriggers.delete(trigger);
        }
    }

    // Compare the trigger's watched property against its target
    // value; flip activation state accordingly. Apply its setters
    // on activation; clear them on deactivation. === equality only
    // (WPF parity for PropertyTrigger).
    private evaluate_trigger(trigger: PropertyTrigger): void
    {
        const current = this.get_property_value(trigger.propertyOwner, trigger.propertyName);
        const matched = current === trigger.value;
        const wasActive = this._activeTriggers.has(trigger);
        if (matched && !wasActive)
        {
            for (const setter of trigger.setters)
            {
                this.apply_setter(setter, 'trigger');
            }
            this._activeTriggers.add(trigger);
        }
        else if (!matched && wasActive)
        {
            for (const setter of trigger.setters)
            {
                this.unapply_setter(setter, 'trigger');
            }
            this._activeTriggers.delete(trigger);
        }
    }

    // Looks up an implicit Style keyed by this Visual's constructor in
    // the ancestor resource chain. Called from AttachLogical (newly in
    // a tree, may have an implicit Style above), from DetachLogical
    // (no chain anymore, implicit clears), and from the ancestor-
    // resource subscriptions wired by subscribe_implicit_style (a
    // dictionary change might add / remove the implicit style).
    private resolve_implicit_style(): void
    {
        const found = this.TryFindResource(this.constructor) as Style | undefined;
        if (found === this._implicitStyle) return;
        this._implicitStyle = found;
        this.refresh_active_style();
    }

    // Subscribe to every ResourceDictionary in the ancestor chain so
    // changes to any of them trigger re-resolution of the implicit
    // style. Wired at AttachLogical; rewired by future tree mutations
    // is not automatic (same limitation as DynamicResource — works
    // for the common case of static ancestry).
    private subscribe_implicit_style(): void
    {
        this.unsubscribe_implicit_style();
        let cursor: Visual | undefined = this;
        while (cursor !== undefined)
        {
            const r = cursor._resources;
            if (r !== undefined)
            {
                this._implicitStyleSubscriptions.push(
                    r.Subscribe(() => this.resolve_implicit_style()),
                );
            }
            cursor = cursor._logicalParent ?? cursor._templatedParent;
        }
        // Mirror the Application-level fallback in TryFindResource —
        // theme / implicit-style changes on the app's root dict must
        // trigger re-resolution here too.
        const appRd = Application.current?.Resources;
        if (appRd !== undefined)
        {
            this._implicitStyleSubscriptions.push(
                appRd.Subscribe(() => this.resolve_implicit_style()),
            );
        }
    }

    private unsubscribe_implicit_style(): void
    {
        for (const unsub of this._implicitStyleSubscriptions) unsub();
        this._implicitStyleSubscriptions.length = 0;
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
            throw new Error(`Visual.FindResource: resource ${desc} not found in any logical ancestor.`);
        }
        return v;
    }

    // The VisualHost (PresentationTarget) that owns this Visual's tree,
    // or undefined when the Visual is unattached.
    protected get target(): VisualHost | undefined
    {
        return this._target;
    }

    protected SetVisualParent(p: Visual | undefined): void
    {
        this._visualParent = p;
    }

    protected SetLogicalParent(p: Visual | undefined): void
    {
        this._logicalParent = p;
    }

    // Sets this Visual's host back-pointer and cascades it down the
    // VISUAL subtree via propagate_target_to_visual_children. The host
    // is a rendering concept (where pixels go, where layout invalidation
    // routes to), so it follows visual ancestry — a template's
    // internally-generated visuals all share their templated control's
    // host, and consumer-supplied logical content slotted into them
    // picks up the same host through its visual parent.
    protected SetTarget(target: VisualHost | undefined): void
    {
        if (this._target === target) return;
        if (this._target !== undefined && target !== undefined)
        {
            throw new Error('Visual is already attached to a host; detach from the current host first.');
        }
        this._target = target;
        this.propagate_target_to_visual_children();
    }

    protected propagate_target_to_visual_children(): void { /* override in Single / Panel */ }

    // Children iteration surface — every Visual exposes its visual
    // children (for the renderer / hit-testing) and its logical
    // children (for tree walks that need the consumer-authored
    // structure). Base default is empty (leaf Visual). Single and
    // Panel override; templated controls (Phase 2) override these
    // independently so the two collections can differ.
    public get visualChildren(): readonly Visual[]  { return []; }
    public get logicalChildren(): readonly Visual[] { return []; }

    // VISUAL-tree wiring only: sets the child's visual parent and
    // cascades the host (renderer needs both). Does NOT touch the
    // logical parent or refresh inheritance — those ride the logical
    // tree. Call this directly only from templating code that's
    // attaching template-generated visuals to their templated control;
    // for ordinary user-supplied children use Attach (which wires both
    // trees).
    protected AttachVisual(child: Visual): void
    {
        if (child === this)
        {
            throw new Error('A Visual cannot be its own child.');
        }
        if (child._visualParent !== undefined)
        {
            throw new Error('Visual already has a visual parent; detach it from the current parent first.');
        }
        child.SetVisualParent(this);
        child.SetTarget(this._target);
    }

    protected DetachVisual(child: Visual): void
    {
        if (child._visualParent !== this)
        {
            throw new Error('Cannot detach a Visual that is not a visual child of this.');
        }
        child.SetVisualParent(undefined);
        child.SetTarget(undefined);
    }

    // LOGICAL-tree wiring only: sets the child's logical parent and
    // refreshes property-value inheritance for the new ancestry. Use
    // directly from templating code when slotting consumer-supplied
    // logical content into a templated control (the child's visual
    // parent is set separately by the ContentPresenter / ItemsPresenter
    // doing the visual slotting).
    protected AttachLogical(child: Visual): void
    {
        if (child === this)
        {
            throw new Error('A Visual cannot be its own logical child.');
        }
        if (child._logicalParent !== undefined)
        {
            throw new Error('Visual already has a logical parent; detach it from the current parent first.');
        }
        child.SetLogicalParent(this);
        child.refresh_inheritance_subtree();
        // Implicit-style lookup runs AFTER inheritance refresh — the
        // resource chain now reflects the child's new ancestry, so the
        // (TargetType-keyed) Style lookup sees what the consumer would
        // see at this position in the tree. subscribe_implicit_style
        // wires reactive re-resolution: a later mutation on any
        // ancestor's ResourceDictionary refires resolve_implicit_style
        // (the same way DynamicResource reacts to its tracked dicts).
        child.resolve_implicit_style();
        child.subscribe_implicit_style();
    }

    protected DetachLogical(child: Visual): void
    {
        if (child._logicalParent !== this)
        {
            throw new Error('Cannot detach a Visual that is not a logical child of this.');
        }
        // Tear down ancestor-resource subscriptions FIRST so the
        // resolve_implicit_style triggered by detach doesn't fire
        // through stale subs.
        child.unsubscribe_implicit_style();
        child.SetLogicalParent(undefined);
        child.refresh_inheritance_subtree();
        // No ancestor chain anymore, so the implicit-style lookup
        // returns undefined and refresh_active_style clears it. If
        // an explicit Style is set it stays active.
        child.resolve_implicit_style();
    }

    // Convenience for the common case where a child belongs to BOTH
    // trees with the same parent — every user-supplied child of a
    // non-templated Panel or Single goes through here. Templated
    // controls (Phase 2) call AttachVisual and AttachLogical
    // independently when the trees diverge.
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

    // ------------------------------------------------------------------
    // Layout / Render lifecycle
    // ------------------------------------------------------------------

    // Explicit size constraints. Width / Height: NaN means "size to
    // content" — MeasureOverride's result wins (clamped by Min/Max). Any
    // numeric value locks the size to exactly that value (clamped by
    // Min/Max in case of conflict). Min/Max: default 0 / +Infinity, so
    // by default they impose no constraint. Set them when you want a
    // fixed-size element ("100×100 box") or a range ("at least 40 wide,
    // never wider than 200"). All four contribute to a single per-axis
    // [min, max] range resolved in Measure.
    public get Width(): number { return this.get_property_value('Width'); }
    public set Width(value: number) { this.set_property_value('Width', value); }

    public get Height(): number { return this.get_property_value('Height'); }
    public set Height(value: number) { this.set_property_value('Height', value); }

    public get MinWidth(): number { return this.get_property_value('MinWidth'); }
    public set MinWidth(value: number) { this.set_property_value('MinWidth', value); }

    public get MinHeight(): number { return this.get_property_value('MinHeight'); }
    public set MinHeight(value: number) { this.set_property_value('MinHeight', value); }

    public get MaxWidth(): number { return this.get_property_value('MaxWidth'); }
    public set MaxWidth(value: number) { this.set_property_value('MaxWidth', value); }

    public get MaxHeight(): number { return this.get_property_value('MaxHeight'); }
    public set MaxHeight(value: number) { this.set_property_value('MaxHeight', value); }

    // Positioning within the parent-given slot when the rendered area
    // is smaller than the slot. Defaults to Stretch (fill the slot when
    // no explicit Width / Height is set; with explicit size, Stretch
    // falls back to Center per WPF semantics).
    public get HorizontalAlignment(): HorizontalAlignment { return this.get_property_value('HorizontalAlignment'); }
    public set HorizontalAlignment(value: HorizontalAlignment) { this.set_property_value('HorizontalAlignment', value); }

    public get VerticalAlignment(): VerticalAlignment { return this.get_property_value('VerticalAlignment'); }
    public set VerticalAlignment(value: VerticalAlignment) { this.set_property_value('VerticalAlignment', value); }

    // Outer spacing — distance from this Visual's rendered area to the
    // edges of its parent-given slot. Differs from a Border's Padding
    // (which is inside the border, around the child): Margin lives
    // OUTSIDE the Visual itself and is consumed by the parent's layout.
    public get Margin(): Thickness { return this.get_property_value('Margin'); }
    public set Margin(value: Thickness) { this.set_property_value('Margin', value); }

    // Optional clip applied at render time — a Geometry in this
    // Visual's local coordinate space. The renderer pushes this clip
    // before RenderOverride and before walking visual children, pops
    // after children. Typed as `unknown` so runtime stays decoupled
    // from visual-engine's Geometry class; whatever shape DC.PushClip
    // accepts works here.
    public get Clip(): unknown | undefined { return this.get_property_value('Clip'); }
    public set Clip(value: unknown | undefined) { this.set_property_value('Clip', value); }

    public get DesiredSize(): Size  { return this._desiredSize; }
    public get RenderSize(): Size   { return this._renderSize; }
    public get ArrangedRect(): Rect { return this._arrangedRect; }
    public get IsMeasureValid(): boolean { return this._isMeasureValid; }
    public get IsArrangeValid(): boolean { return this._isArrangeValid; }

    // Measure pass entry point. Computes DesiredSize via MeasureOverride.
    // Cached: returns immediately when measure state is valid AND the
    // availableSize matches the prior call.
    //
    // Do not override directly — override MeasureOverride for custom
    // layout policy.
    public Measure(availableSize: Size): void
    {
        if (this._isMeasureValid && this._previousAvailableSize.Equals(availableSize)) return;
        this._previousAvailableSize = availableSize;

        // Subtract Margin first — that space belongs to the gap between
        // this Visual and its parent's slot edge, not to this Visual's
        // own content. MeasureOverride sees only the inner budget.
        const margin = this.Margin;
        const marginH = margin.Horizontal;
        const marginV = margin.Vertical;
        const inner = new Size(
            Math.max(0, availableSize.Width  - marginH),
            Math.max(0, availableSize.Height - marginV),
        );

        // Resolve the effective [min, max] per axis from Width /
        // Height / MinWidth / MinHeight / MaxWidth / MaxHeight. Explicit
        // Width is the special case where min === max === Width.
        const mm = this.resolveMinMax();

        // availableSize handed to MeasureOverride is clamped to that
        // range — when Width is set, MeasureOverride sees exactly Width
        // (children measure themselves against the asserted size, not
        // the parent's slot).
        const constrained = new Size(
            Visual.clamp(inner.Width,  mm.minW, mm.maxW),
            Visual.clamp(inner.Height, mm.minH, mm.maxH),
        );

        const measured = this.MeasureOverride(constrained);

        // Clamp MeasureOverride's result to the same range — Min/Max
        // act as floor/ceiling on the natural content size. With Width
        // set, this pins the inner size to Width regardless.
        const clamped = new Size(
            Visual.clamp(measured.Width,  mm.minW, mm.maxW),
            Visual.clamp(measured.Height, mm.minH, mm.maxH),
        );

        // Add Margin back so the parent reserves the full bounding box
        // (inner content + outer spacing) for this Visual.
        this._desiredSize = new Size(
            clamped.Width  + marginH,
            clamped.Height + marginV,
        );
        this._isMeasureValid = true;
        // A new desired size invalidates any prior arrangement that was
        // computed against the old desired size — the parent will need
        // to re-Arrange this Visual with a possibly different finalRect.
        this._isArrangeValid = false;
    }

    // Override to compute DesiredSize from this Visual's content and
    // (typically) its children's DesiredSize. Subclasses that contain
    // children must call child.Measure(constrainedSize) for each child
    // before reading child.DesiredSize.
    //
    // Default returns Size.Zero — the leaf-Visual case.
    protected MeasureOverride(_availableSize: Size): Size
    {
        return Size.Zero;
    }

    // Arrange pass entry point. Places this Visual into finalRect and
    // runs ArrangeOverride to position children. Forces a Measure if
    // measure state is invalid (using the previously-passed available
    // size, or finalRect.Size as a fallback). Cached: returns immediately
    // when arrange state is valid AND finalRect matches the prior call.
    //
    // Do not override directly — override ArrangeOverride.
    public Arrange(finalRect: Rect): void
    {
        if (this._isArrangeValid && this._arrangedRect.Equals(finalRect)) return;
        if (!this._isMeasureValid)
        {
            const available = this._previousAvailableSize.IsEmpty
                ? finalRect.Size
                : this._previousAvailableSize;
            this.Measure(available);
        }

        // Subtract Margin from the parent-given slot before computing
        // render size / alignment. The marginedRect is where this Visual's
        // own content actually lives; the margin gap is what's left
        // between marginedRect and finalRect on each side.
        const margin = this.Margin;
        const marginedRect = new Rect(
            finalRect.X + margin.Left,
            finalRect.Y + margin.Top,
            Math.max(0, finalRect.Width  - margin.Horizontal),
            Math.max(0, finalRect.Height - margin.Vertical),
        );

        const mm = this.resolveMinMax();
        const hAlign = this.HorizontalAlignment;
        const vAlign = this.VerticalAlignment;
        const explicitW = !Number.isNaN(this.Width);
        const explicitH = !Number.isNaN(this.Height);

        // Per-axis render size:
        //   * Explicit Width / Height — always wins, clamped to Min/Max.
        //   * Stretch alignment without explicit size — fill the margined
        //     slot (clamped to Min/Max).
        //   * Anything else — use DesiredSize minus margin (DesiredSize
        //     reported to the parent included margin, so peel it back
        //     out for the actual render size).
        const renderW = explicitW
            ? Visual.clamp(this.Width, mm.minW, mm.maxW)
            : hAlign === HorizontalAlignment.Stretch
                ? Visual.clamp(marginedRect.Width, mm.minW, mm.maxW)
                : Math.max(0, this._desiredSize.Width - margin.Horizontal);

        const renderH = explicitH
            ? Visual.clamp(this.Height, mm.minH, mm.maxH)
            : vAlign === VerticalAlignment.Stretch
                ? Visual.clamp(marginedRect.Height, mm.minH, mm.maxH)
                : Math.max(0, this._desiredSize.Height - margin.Vertical);

        const renderSize = new Size(renderW, renderH);

        // Position within the MARGINED slot per alignment. ArrangedRect
        // is the FINAL aligned rect (margined slot.X + alignment offset,
        // renderSize) — that's what the renderer pushes as a translate
        // and what hit-testing reads as the Visual's bounds. WPF Stretch
        // + explicit size falls back to centered; the same offset formula
        // handles both since Stretch with renderSize < slot has extra > 0.
        const offsetX = Visual.computeOffsetX(hAlign, marginedRect.Width,  renderW);
        const offsetY = Visual.computeOffsetY(vAlign, marginedRect.Height, renderH);

        this._arrangedRect = new Rect(
            marginedRect.X + offsetX,
            marginedRect.Y + offsetY,
            renderW,
            renderH,
        );
        this._renderSize = this.ArrangeOverride(renderSize);
        this._isArrangeValid = true;
    }

    // ------------------------------------------------------------------
    // Layout helpers
    // ------------------------------------------------------------------

    private resolveMinMax(): { minW: number; maxW: number; minH: number; maxH: number }
    {
        const w = this.Width;
        const h = this.Height;
        const minW0 = this.MinWidth;
        const maxW0 = this.MaxWidth;
        const minH0 = this.MinHeight;
        const maxH0 = this.MaxHeight;

        // Explicit Width collapses [min, max] to a single value (clamped
        // to the user's own min/max if they conflict). Same for Height.
        let minW = minW0, maxW = maxW0;
        if (!Number.isNaN(w))
        {
            const locked = Visual.clamp(w, minW0, maxW0);
            minW = locked;
            maxW = locked;
        }

        let minH = minH0, maxH = maxH0;
        if (!Number.isNaN(h))
        {
            const locked = Visual.clamp(h, minH0, maxH0);
            minH = locked;
            maxH = locked;
        }

        return { minW, maxW, minH, maxH };
    }

    private static clamp(v: number, min: number, max: number): number
    {
        return Math.max(min, Math.min(max, v));
    }

    private static computeOffsetX(align: HorizontalAlignment, slotWidth: number, renderWidth: number): number
    {
        const extra = slotWidth - renderWidth;
        if (extra <= 0) return 0; // overflow / exact fit → no offset (clipped at slot origin)
        switch (align)
        {
            case HorizontalAlignment.Left:    return 0;
            case HorizontalAlignment.Right:   return extra;
            case HorizontalAlignment.Center:  return extra / 2;
            case HorizontalAlignment.Stretch: return extra / 2; // Stretch + content < slot → center
        }
    }

    private static computeOffsetY(align: VerticalAlignment, slotHeight: number, renderHeight: number): number
    {
        const extra = slotHeight - renderHeight;
        if (extra <= 0) return 0;
        switch (align)
        {
            case VerticalAlignment.Top:     return 0;
            case VerticalAlignment.Bottom:  return extra;
            case VerticalAlignment.Center:  return extra / 2;
            case VerticalAlignment.Stretch: return extra / 2;
        }
    }

    // Override to place children inside finalSize. Subclasses that
    // contain children call child.Arrange(rect) for each child.
    // Returns the actual size used (typically finalSize).
    //
    // Default returns finalSize — accept whatever the parent provided.
    protected ArrangeOverride(finalSize: Size): Size
    {
        return finalSize;
    }

    // Render pass entry point. Called by the host's renderer when this
    // Visual is render-dirty. Delegates to RenderOverride.
    //
    // Do not override directly — override RenderOverride.
    public Render(dc: DrawingContext): void
    {
        this.RenderOverride(dc);
    }

    // Override to draw this Visual's contribution into the DrawingContext.
    // Children are rendered separately by the renderer's tree walk —
    // RenderOverride should only emit primitives belonging to this Visual.
    //
    // Default is empty — most container Visuals (Single, Panel) are pure
    // composition and contribute nothing; their children do the drawing.
    protected RenderOverride(_dc: DrawingContext): void { }

    // ------------------------------------------------------------------
    // Invalidation API
    // ------------------------------------------------------------------

    // Mark this Visual's measure state invalid. Side effect: also
    // invalidates the arrange cache, because a new DesiredSize would
    // make the prior arrangement stale. Always notifies the host's
    // measure queue. Cascades UP the visual tree only if the cache
    // actually transitioned from valid to invalid — without that
    // upward walk, a parent whose own cache is still valid would
    // short-circuit the next top-down Measure pass and never reach
    // this Visual through its MeasureOverride. The "wasValid" check
    // dedups the cascade so it's O(depth-to-first-invalid) per call,
    // and prevents a paired InvalidateMeasure / InvalidateArrange on
    // the same property (Measure | Arrange metadata) from triggering
    // a duplicate upward walk.
    public InvalidateMeasure(): void
    {
        const wasValid = this._isMeasureValid;
        this._isMeasureValid = false;
        this._isArrangeValid = false;
        this._target?.OnMeasureInvalidated(this);
        if (wasValid)
        {
            this._visualParent?.InvalidateMeasure();
        }
    }

    // Mark arrange state invalid. Always notifies the host's arrange
    // queue — even if a prior InvalidateMeasure cleared the cache
    // already, the host still needs to know that arrange specifically
    // was requested for this Visual. Cascades up only on actual
    // transition (same reason as InvalidateMeasure).
    public InvalidateArrange(): void
    {
        const wasValid = this._isArrangeValid;
        this._isArrangeValid = false;
        this._target?.OnArrangeInvalidated(this);
        if (wasValid)
        {
            this._visualParent?.InvalidateArrange();
        }
    }

    // Request a re-render on the next render pass. Render state isn't
    // cached on the Visual (RenderOverride is always re-runnable), so
    // this is purely a host notification.
    public InvalidateVisual(): void
    {
        this._target?.OnRenderInvalidated(this);
    }

    // ------------------------------------------------------------------
    // Property-change routing
    // ------------------------------------------------------------------

    // Visual override of Model's virtual hook. Consults the property's
    // MetaData flags and routes to the matching Invalidate* method
    // plus — when the property is marked Inherits — pushes the change
    // down the subtree.
    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        _old_value: any,
        _new_value: any,
    ): void
    {
        const meta = descriptor.MetaData;
        if (affectsMeasure(meta)) this.InvalidateMeasure();
        if (affectsArrange(meta)) this.InvalidateArrange();
        if (affectsRender(meta))  this.InvalidateVisual();
        if (inherits(meta))       this.propagate_inheritance_for_logical_children(descriptor);
    }

    // ------------------------------------------------------------------
    // Property value inheritance
    // ------------------------------------------------------------------

    private walk_inherited(key: string): any | undefined
    {
        // Inheritance follows the LOGICAL tree — DataContext, font
        // properties, etc. flow through "where the consumer wrote
        // this", not "where the template put it visually". For all
        // non-templated trees the logical and visual parents are the
        // same instance, so behavior matches the pre-split codebase.
        //
        // For template-generated Visuals (templatedParent set), the
        // top of the logical chain hops onto the templated control —
        // template internals inherit from the consumer's authored
        // ancestry, with the templated control as the bridge. WPF
        // does the same: a Border inside a Button's template inherits
        // Foreground from the Button, then from the Button's logical
        // ancestors.
        let cursor: Visual = this;
        while (true)
        {
            const next = cursor._logicalParent ?? cursor._templatedParent;
            if (next === undefined) return undefined;
            const evd = next['property_values'].get(key);
            if (evd !== undefined && evd.Source !== PropertyValueSource.Default)
            {
                return evd.value;
            }
            cursor = next;
        }
    }

    // Re-resolves the inherited value for `descriptor` against the
    // current logical-ancestor chain and updates this Visual's EVD
    // cache. Runs unconditionally — even when a higher-priority source
    // (LocalValue / Binding / Trigger / Style / …) is currently the
    // active source — because the cached InheritedValue slot has to
    // stay fresh for the eventual fall-through when that higher source
    // clears. SetInheritedValue / ClearInherited internally suppress
    // the source flip and change-notification when shadowed, so this
    // method's `walk + push` is cheap when no descendant cascade is
    // warranted.
    protected refresh_inherited(descriptor: PropertyDescriptor): void
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
            this['property_values'].get(key)?.ClearInherited();
        }
    }

    protected refresh_inheritance_subtree(): void
    {
        for (const descriptor of Visual.collect_inheritable_descriptors(this.constructor))
        {
            this.refresh_inherited(descriptor);
        }
        this.propagate_inheritance_to_logical_children();
    }

    protected propagate_inheritance_to_logical_children(): void { /* override in Single / Panel */ }

    protected propagate_inheritance_for_logical_children(_descriptor: PropertyDescriptor): void { /* override in Single / Panel */ }

    private static collect_inheritable_descriptors(klass: Function): PropertyDescriptor[]
    {
        const seen = new Set<string>();
        const result: PropertyDescriptor[] = [];
        let current: Function | null = klass;
        while (current !== null && current !== Function.prototype)
        {
            const bag = Model['peek_property_bag'](current);
            if (bag !== undefined)
            {
                for (const [name, desc] of bag)
                {
                    if (!seen.has(name) && inherits(desc.MetaData))
                    {
                        seen.add(name);
                        result.push(desc);
                    }
                }
            }
            current = Object.getPrototypeOf(current);
        }
        return result;
    }
}

// A Visual that owns at most one child. SetChild(undefined) clears the
// slot. Replacing a non-undefined child first detaches the previous one.
export abstract class Single extends Visual
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

    protected override propagate_inheritance_to_logical_children(): void
    {
        this._child?.['refresh_inheritance_subtree']();
    }

    protected override propagate_inheritance_for_logical_children(descriptor: PropertyDescriptor): void
    {
        this._child?.['refresh_inherited'](descriptor);
    }

    protected override propagate_target_to_visual_children(): void
    {
        this._child?.['SetTarget'](this['target']);
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
export class Panel extends Visual
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
        this._children.Subscribe(() =>
        {
            this._childrenSnapshot = undefined;
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

    protected override propagate_inheritance_to_logical_children(): void
    {
        for (const c of this._children) c['refresh_inheritance_subtree']();
    }

    protected override propagate_inheritance_for_logical_children(descriptor: PropertyDescriptor): void
    {
        for (const c of this._children) c['refresh_inherited'](descriptor);
    }

    protected override propagate_target_to_visual_children(): void
    {
        const t = this['target'];
        for (const c of this._children) c['SetTarget'](t);
    }
}
