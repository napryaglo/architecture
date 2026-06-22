import {
    HorizontalAlignment,
    Panel,
    VerticalAlignment,
    type Visual,
} from '../../runtime/index.js';
import { Rect, Size } from '../primitives.js';

// The host-side container for visuals that paint above the main Content
// tree — popups, dropdowns, drawers in Temporary mode. One per
// PresentationTarget, created lazily on the first AttachOverlay call.
//
// Layout contract: every child is measured with the surface's full
// available size and arranged at (0, 0, surfaceW, surfaceH). Consumers
// position themselves *inside* that slot — a Drawer scrim fills it
// edge-to-edge while a pane sits anchored at one edge; a ComboBox
// popup places itself at the originating selection-box coordinates via
// a Canvas-like child of its own.
//
// CRUCIAL: when EMPTY (the common case after every overlay-bearing
// control detaches its host), MeasureOverride returns Size.Zero. Paired
// with Top-Left alignment that locks the layer's render size to its
// DesiredSize (rather than Stretching to fill the slot), this collapses
// the layer's ArrangedRect to 0×0 — and therefore its renderer-emitted
// `<rect class="mural-hit">` to 0×0. Without that collapse the layer
// would leave a full-surface invisible hit pad with `pointer-events: all`
// covering the underlying Content tree, swallowing every click that
// happened to land on what looked like blank space — the lingering-
// overlay bug that broke pointer input under closed Drawers and
// ComboBox popups.
//
// Hit-testing for visible overlays falls out of paint order: the
// SvgRenderer paints the overlay layer's `<g>` AFTER the main Content's
// `<g>`, so the browser's elementsFromPoint walk hits overlay nodes
// first. No special handling on the input side is needed.
export class OverlayLayer extends Panel
{
    constructor()
    {
        super();
        // Top-Left alignment makes Visual.Arrange use DesiredSize
        // (rather than the parent's full slot) when computing renderW /
        // renderH. With MeasureOverride returning Size.Zero on empty,
        // this is what shrinks the layer's ArrangedRect to 0×0.
        this.HorizontalAlignment = HorizontalAlignment.Left;
        this.VerticalAlignment   = VerticalAlignment.Top;
        // The layer is a positioning container — never a hit target itself.
        // When non-empty its ArrangedRect spans the full surface, and the
        // renderer-emitted `<rect class="mural-hit">` would otherwise carry
        // `pointer-events: all`, swallowing every click that lands on the
        // overlay surface OUTSIDE any popup child. Popups (ToolTip,
        // ContextMenu, Drawer) keep their own explicit `pointer-events`
        // via their own outers, so children that ARE hit-testable still
        // receive events; only the layer's own pad falls out of the walk.
        this.IsHitTestVisible = false;
    }

    // Overlay-layer children are VISUAL-only — their logical parent is
    // the control that mounted them (set by `Visual.AttachOverlayChild`),
    // never the OverlayLayer itself. Returning [] here keeps the
    // logical-tree walks (DataContext / resource cascades, FindName)
    // from dragging the overlay layer into hops it doesn't own. See the
    // _overlayChildren docstring on Visual for the full split.
    public override get logicalChildren(): readonly Visual[] { return []; }

    protected override MeasureOverride(availableSize: Size): Size
    {
        // No children → no need for surface-sized geometry. Reporting
        // zero (combined with Top-Left alignment) collapses the layer
        // to a non-hit-testable 0×0 rect.
        if (this.visualChildren.length === 0) return Size.Zero;

        const w = Number.isFinite(availableSize.Width)  ? availableSize.Width  : 0;
        const h = Number.isFinite(availableSize.Height) ? availableSize.Height : 0;
        const childAvail = new Size(w, h);
        for (const child of this.visualChildren)
        {
            child.Measure(childAvail);
        }
        return new Size(w, h);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        if (this.visualChildren.length === 0) return Size.Zero;
        const slot = new Rect(0, 0, finalSize.Width, finalSize.Height);
        for (const child of this.visualChildren)
        {
            child.Arrange(slot);
        }
        return finalSize;
    }
}
