import { Model } from './model.js';
import type { PropertyDescriptor } from './property-descriptor.js';
import { PropertyValueSource } from './effective-value.js';
import { MetaData, affectsArrange, affectsMeasure, affectsRender, inherits } from './metadata.js';
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
    }

    private _parent: Visual | undefined;
    private _target: VisualHost | undefined;

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

    protected get parent(): Visual | undefined
    {
        return this._parent;
    }

    // The VisualHost (PresentationTarget) that owns this Visual's tree,
    // or undefined when the Visual is unattached.
    protected get target(): VisualHost | undefined
    {
        return this._target;
    }

    protected SetParent(parent: Visual | undefined): void
    {
        this._parent = parent;
    }

    // Sets this Visual's host back-pointer and cascades it down the
    // subtree via propagate_target_to_children. Called by Attach /
    // Detach with the parent's target (or `undefined` on detach), and
    // by PresentationTarget.Content when seeding/tearing down the chain
    // at the root.
    protected SetTarget(target: VisualHost | undefined): void
    {
        if (this._target === target) return;
        if (this._target !== undefined && target !== undefined)
        {
            throw new Error('Visual is already attached to a host; detach from the current host first.');
        }
        this._target = target;
        this.propagate_target_to_children();
    }

    protected propagate_target_to_children(): void { /* override in Single / Panel */ }

    protected Attach(child: Visual): void
    {
        if (child === this)
        {
            throw new Error('A Visual cannot be its own child.');
        }
        if (child._parent !== undefined)
        {
            throw new Error('Visual already has a parent; remove it from its current parent first.');
        }
        child.SetParent(this);
        child.SetTarget(this._target);
        child.refresh_inheritance_subtree();
    }

    protected Detach(child: Visual): void
    {
        if (child._parent !== this)
        {
            throw new Error('Cannot detach a Visual that is not a child of this.');
        }
        child.SetParent(undefined);
        child.SetTarget(undefined);
        child.refresh_inheritance_subtree();
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

    // Mark this Visual's measure state invalid. Cascades to arrange (a
    // new desired size implies a new arrangement). Notifies the host so
    // it can schedule the next layout pass. The host is responsible for
    // deduplication — repeated calls between passes funnel into one
    // pending entry in the host's dirty set.
    public InvalidateMeasure(): void
    {
        this._isMeasureValid = false;
        this._isArrangeValid = false;
        this._target?.OnMeasureInvalidated(this);
    }

    // Mark arrange state invalid. Notifies the host.
    public InvalidateArrange(): void
    {
        this._isArrangeValid = false;
        this._target?.OnArrangeInvalidated(this);
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
        if (inherits(meta))       this.propagate_inheritance_for(descriptor);
    }

    // ------------------------------------------------------------------
    // Property value inheritance
    // ------------------------------------------------------------------

    private walk_inherited(key: string): any | undefined
    {
        let p = this._parent;
        while (p !== undefined)
        {
            const evd = p['property_values'].get(key);
            if (evd !== undefined && evd.Source !== PropertyValueSource.Default)
            {
                return evd.value;
            }
            p = p._parent;
        }
        return undefined;
    }

    protected refresh_inherited(descriptor: PropertyDescriptor): void
    {
        if (!inherits(descriptor.MetaData)) return;

        const key = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        const evd = this['property_values'].get(key);
        if (evd !== undefined
            && evd.Source !== PropertyValueSource.Default
            && evd.Source !== PropertyValueSource.InheritedValue)
        {
            return;
        }

        const value = this.walk_inherited(key);
        if (value !== undefined)
        {
            this['ensure_effective_value_for'](descriptor).SetInheritedValue(value);
        }
        else if (evd !== undefined && evd.Source === PropertyValueSource.InheritedValue)
        {
            evd.ClearInherited();
        }
    }

    protected refresh_inheritance_subtree(): void
    {
        for (const descriptor of Visual.collect_inheritable_descriptors(this.constructor))
        {
            this.refresh_inherited(descriptor);
        }
        this.propagate_inheritance_to_children();
    }

    protected propagate_inheritance_to_children(): void { /* override in Single / Panel */ }

    protected propagate_inheritance_for(_descriptor: PropertyDescriptor): void { /* override in Single / Panel */ }

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
export class Single extends Visual
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

    protected override propagate_inheritance_to_children(): void
    {
        this._child?.['refresh_inheritance_subtree']();
    }

    protected override propagate_inheritance_for(descriptor: PropertyDescriptor): void
    {
        this._child?.['refresh_inherited'](descriptor);
    }

    protected override propagate_target_to_children(): void
    {
        this._child?.['SetTarget'](this['target']);
    }
}

// A Visual that owns an ordered collection of children.
export class Panel extends Visual
{
    private _children: Visual[] = [];

    public get children(): ReadonlyArray<Visual>
    {
        return this._children;
    }

    public AddChild(child: Visual): void
    {
        this.Attach(child);
        this._children.push(child);
    }

    public RemoveChild(child: Visual): void
    {
        const index = this._children.indexOf(child);
        if (index === -1) return;
        this._children.splice(index, 1);
        this.Detach(child);
    }

    protected override propagate_inheritance_to_children(): void
    {
        for (const c of this._children) c['refresh_inheritance_subtree']();
    }

    protected override propagate_inheritance_for(descriptor: PropertyDescriptor): void
    {
        for (const c of this._children) c['refresh_inherited'](descriptor);
    }

    protected override propagate_target_to_children(): void
    {
        const t = this['target'];
        for (const c of this._children) c['SetTarget'](t);
    }
}
