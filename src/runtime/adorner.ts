import { Panel, Single, Visual } from './visual.js';
import { Rect, Size } from './primitives.js';
import type { DrawingContext } from './drawing-context.js';

// Adorner — a Visual that decorates another Visual (the "adorned
// element") by painting on top of it within an AdornerLayer.
//
// WPF-parity contract: an Adorner is hosted by an AdornerLayer (NOT
// by the adorned element itself), arranged at the adorned element's
// position within the layer's local coordinate space, and reaches back
// to the adorned element via the AdornedElement property to track its
// size / state. The layer recomputes adorner positioning on every
// arrange pass, so an adorner stays glued to its target as the host
// layout shifts (scroll, panel reflow, container recycle).
//
// Sizing default: an adorner is measured with Infinity available on
// both axes — it picks its own natural size via MeasureOverride.
// Arrange default: the adorner gets the adorned element's bounding
// rect in the layer's frame, capped at the adorner's measured desired
// size; override Placement to offset or scale relative to the
// adorned element.
//
// Hit-testing: adorners are hit-testable by default (like any Visual
// — the renderer stamps `pointer-events="all"` on the mural-hit pad).
// Feedback-only adorners (insertion lines, drag ghosts) should opt
// out by overriding Placement to a zero-area rect or by composing
// with a hit-transparent host (forthcoming IsHitTestVisible DP).
//
// Lifecycle: nothing in this class touches the adorned element itself
// — adding/removing adorners is the host's job via AdornerLayer.Add /
// Remove. If the adorned element is detached from the tree, the
// adorner stays visible at its last-known position; the host is
// responsible for removing the adorner on adorned-element cleanup.
export abstract class Adorner extends Visual
{
    private readonly _adornedElement: Visual;

    constructor(adornedElement: Visual)
    {
        super();
        this._adornedElement = adornedElement;
    }

    public get AdornedElement(): Visual { return this._adornedElement; }

    // Returns the rect (in the layer's local coordinate space) where
    // this adorner should be arranged. Default: the adorned element's
    // rect as computed by the layer. Override to offset (e.g. a tooltip
    // bubble above the adorned element), scale (resize-handle overlay
    // padded by handle size), or pin to a corner.
    //
    // `adornedRect` is the layer's measurement of where AdornedElement
    // lives within the layer; `desiredSize` is what MeasureOverride
    // returned. The default fits the adorner inside the adorned rect,
    // honouring `desiredSize` when it's smaller.
    public Placement(adornedRect: Rect, desiredSize: Size): Rect
    {
        void desiredSize;
        return adornedRect;
    }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        return Size.Zero;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        return finalSize;
    }

    protected override RenderOverride(_dc: DrawingContext): void { }
}

// AdornerLayer — Panel that hosts Adorners on top of the adorned
// content tree. Owned by an AdornerDecorator (its parent in the visual
// tree); paints AFTER the decorator's Child so adorners overlay the
// content.
//
// Layout protocol: on Arrange, each adorner's position is computed by
// walking from `adorner.AdornedElement` up through the visual tree
// summing ArrangedRect offsets until reaching the layer's owning
// AdornerDecorator. The accumulated offset is the adorned element's
// position in the layer's local frame; the adorner is then arranged
// at the rect its Placement override returns.
//
// Static AdornerLayer.GetAdornerLayer(visual) walks up from any visual
// looking for an AdornerDecorator's layer — the standard entry point
// for behaviours that want to attach an adorner to a control they're
// hosted on without the consumer threading the layer through manually.
export class AdornerLayer extends Panel
{
    // Backref to the owning AdornerDecorator. Set by the decorator
    // constructor; used as the walk-stop sentinel when computing the
    // adorned element's position in this layer's frame.
    private _decorator: AdornerDecorator | undefined;

    public Add(adorner: Adorner): void
    {
        this.AddVisualChild(adorner);
    }

    public Remove(adorner: Adorner): void
    {
        this.RemoveVisualChild(adorner);
    }

    // Snapshot of adorners decorating a given element. WPF parity for
    // AdornerLayer.GetAdorners — null when there are none, an array
    // otherwise. We return undefined for "none" to match the rest of
    // the µ-mural API's "absent" convention.
    public GetAdorners(adornedElement: Visual): readonly Adorner[] | undefined
    {
        let hit: Adorner[] | undefined;
        for (const child of this.visualChildren)
        {
            if (child instanceof Adorner && child.AdornedElement === adornedElement)
            {
                (hit ??= []).push(child);
            }
        }
        return hit;
    }

    // Internal: set by AdornerDecorator at construction so the
    // arrange walk knows where to stop accumulating offsets.
    public _SetDecorator(decorator: AdornerDecorator): void
    {
        this._decorator = decorator;
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        // Adorners measure with unbounded available — they pick their
        // own natural size. Constraining to availableSize would clip
        // adorners that extend past the adorned element's edges (a
        // halo, a glow, a tooltip overhanging the bottom).
        const unbounded = new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        for (const child of this.visualChildren)
        {
            child.Measure(unbounded);
        }
        // Layer fills the slot the decorator gave us (which is the
        // decorator's full bounds).
        return availableSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        for (const child of this.visualChildren)
        {
            if (!(child instanceof Adorner)) continue;
            const adornedRect = this.computeAdornedRectInLayerFrame(child);
            const place = child.Placement(adornedRect, child.DesiredSize);
            child.Arrange(place);
        }
        return finalSize;
    }

    private computeAdornedRectInLayerFrame(adorner: Adorner): Rect
    {
        // Walk from the adorned element upward through the visual tree,
        // summing ArrangedRect offsets until we reach the owning
        // AdornerDecorator. The accumulated (x, y) is the adorned
        // element's top-left in the decorator's frame — which IS the
        // layer's frame, since the layer fills the decorator at (0, 0).
        // If the walk runs off the top (adorned element not under our
        // decorator), fall back to (0, 0) — the adorner stays at the
        // layer origin rather than tracking an unreachable target.
        const adorned = adorner.AdornedElement;
        let x = 0, y = 0;
        let cur: Visual | undefined = adorned;
        while (cur !== undefined && cur !== this._decorator)
        {
            x += cur.ArrangedRect.X;
            y += cur.ArrangedRect.Y;
            cur = cur.GetVisualParent();
        }
        if (cur === undefined) return new Rect(0, 0, 0, 0);
        const rs = adorned.RenderSize;
        return new Rect(x, y, rs.Width, rs.Height);
    }

    // Walks up the visual tree from `visual` looking for any ancestor
    // that exposes an AdornerLayer — typically an AdornerDecorator
    // wrapping a subtree, or a ScrollContentPresenter that carries an
    // inner layer so adorners scroll with content. Returns the FIRST
    // layer found, matching WPF's nearest-ancestor lookup. Returns
    // undefined when nothing in the ancestor chain provides one —
    // callers typically either short-circuit (skip the adornment) or
    // fail loudly so the missing host surfaces.
    //
    // The lookup duck-types on an `AdornerLayer` property of
    // AdornerLayer shape so providers in `Controls/` (SCP) don't
    // create a circular runtime → Controls dependency: any Visual
    // that wants to host adorners just exposes the property.
    public static GetAdornerLayer(visual: Visual): AdornerLayer | undefined
    {
        let cur: Visual | undefined = visual;
        while (cur !== undefined)
        {
            const candidate = (cur as unknown as { AdornerLayer?: unknown }).AdornerLayer;
            if (candidate instanceof AdornerLayer) return candidate;
            cur = cur.GetVisualParent();
        }
        return undefined;
    }

    // DFS the subtree rooted at `visual` for the FIRST AdornerLayer
    // provider and return its layer. Useful when a top-level host
    // (PresentationTarget / HtmlTarget) wants to drop an adornment
    // but doesn't have a specific in-tree anchor to walk up from —
    // the outermost AdornerDecorator typically wraps the app root, so
    // a top-down DFS finds it on the first hit. Returns undefined
    // when no provider exists in the subtree. Same duck-typing as
    // GetAdornerLayer.
    public static FindFirstInSubtree(visual: Visual): AdornerLayer | undefined
    {
        const candidate = (visual as unknown as { AdornerLayer?: unknown }).AdornerLayer;
        if (candidate instanceof AdornerLayer) return candidate;
        for (const child of visual.visualChildren)
        {
            const found = AdornerLayer.FindFirstInSubtree(child);
            if (found !== undefined) return found;
        }
        return undefined;
    }
}

// AdornerDecorator — a single-Child host that provides an AdornerLayer
// painted on top of its Child. Wrap the part of the tree you want
// adornment scope over (typically a page body or pane) in an
// AdornerDecorator; behaviours attached to descendants then locate
// the layer via AdornerLayer.GetAdornerLayer(this) and add their
// adorners there.
//
// Layout: Child fills the decorator; AdornerLayer overlays at the same
// rect. Paint order matches visualChildren order — Child is index 0,
// the layer is index 1, so the renderer walks Child first and the
// layer's adorners paint on top.
// Extends Single (the µ-mural `Decorator` analog) so consumers get the
// standard Child slot machinery — SetChild, Single's visualChildren
// surface, namescope plumbing — without AdornerDecorator
// reimplementing any of it. The internal AdornerLayer is a SECOND
// visual child painted ON TOP of Child; we override visualChildren
// to expose both. logicalChildren stays at Single's [_child] so
// property inheritance / consumer-side iteration ignore the layer.
export class AdornerDecorator extends Single
{
    private readonly _adornerLayer: AdornerLayer;

    constructor()
    {
        super();
        this._adornerLayer = new AdornerLayer();
        this._adornerLayer._SetDecorator(this);
        this.AttachVisual(this._adornerLayer);
    }

    public get AdornerLayer(): AdornerLayer { return this._adornerLayer; }

    public get Child(): Visual | undefined { return this.child; }
    public set Child(value: Visual | undefined) { this.SetChild(value); }

    public override get visualChildren(): readonly Visual[]
    {
        const c = this.child;
        return c === undefined ? [this._adornerLayer] : [c, this._adornerLayer];
    }

    // logicalChildren falls through to Single's [_child] — the layer
    // is a visual-only host (resources / DataContext don't flow into
    // it logically).

    protected override MeasureOverride(availableSize: Size): Size
    {
        let desired = Size.Zero;
        const c = this.child;
        if (c !== undefined)
        {
            c.Measure(availableSize);
            desired = c.DesiredSize;
        }
        // Layer measured AFTER child so the child drives the
        // decorator's desired size; layer's measure pass just
        // resolves each adorner's DesiredSize for the arrange step.
        this._adornerLayer.Measure(desired);
        return desired;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const rect = new Rect(0, 0, finalSize.Width, finalSize.Height);
        this.child?.Arrange(rect);
        this._adornerLayer.Arrange(rect);
        return finalSize;
    }

    protected override RenderOverride(_dc: DrawingContext): void { }
}

// Cursor-anchored adorner. Hosts an optional content Visual; the
// adorner's Placement returns a rect at the layer-local position
// pinned via SetPosition. Used by HtmlTarget to host the drag-drop
// ghost inside an AdornerLayer when the visual tree carries an
// AdornerDecorator — the renderer's outer-translate mechanism then
// handles positioning instead of a surface-level overlay <g>.
//
// Content shape:
//   * `SetContent(visual)` — for mode C (DataTemplate-derived previews).
//     The hosted Visual is measured / arranged through the standard
//     visualChildren walk and the renderer paints its subtree under
//     this adorner's outer <g>.
//   * No content — for mode A (HtmlTarget appends a manually-cloned
//     <g> into this adorner's outer <g> after Flush). The adorner is
//     a positioning shell; nothing paints from its own subtree.
export class DragGhostAdorner extends Adorner
{
    private _content: Visual | undefined;
    private _x: number = 0;
    private _y: number = 0;
    private _w: number = 0;
    private _h: number = 0;

    public SetContent(content: Visual | undefined): void
    {
        if (this._content === content) return;
        if (this._content !== undefined) this.DetachVisual(this._content);
        this._content = content;
        if (content !== undefined) this.AttachVisual(content);
        this.InvalidateMeasure();
    }

    // Pin the adorner at (x, y) in the AdornerLayer's local frame.
    // The host (HtmlTarget) translates cursor host-coords to layer
    // coords once it has located the layer.
    public SetPosition(x: number, y: number): void
    {
        if (this._x === x && this._y === y) return;
        this._x = x;
        this._y = y;
        this.InvalidateArrange();
        // Bubble up so the layer's ArrangeOverride re-runs and picks
        // up the new Placement rect on the next layout pass.
        const parent = this.GetVisualParent();
        parent?.InvalidateArrange();
    }

    public override get visualChildren(): readonly Visual[]
    {
        return this._content === undefined ? [] : [this._content];
    }

    public override Placement(_adornedRect: Rect, _desired: Size): Rect
    {
        return new Rect(this._x, this._y, this._w, this._h);
    }

    protected override MeasureOverride(available: Size): Size
    {
        if (this._content === undefined) return Size.Zero;
        this._content.Measure(available);
        const d = this._content.DesiredSize;
        this._w = d.Width;
        this._h = d.Height;
        return d;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        this._w = finalSize.Width;
        this._h = finalSize.Height;
        this._content?.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
    }

    protected override RenderOverride(_dc: DrawingContext): void { }
}
