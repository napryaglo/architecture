import {
    HorizontalAlignment,
    Panel,
    Rect,
    Size,
    VerticalAlignment,
} from '../runtime/index.js';

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
    }

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
