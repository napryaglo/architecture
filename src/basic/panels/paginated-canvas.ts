import { Color, MetaData, Model, Rect, Size, type DrawingContext } from '../../runtime/index.js';
import { Pen, SolidColorBrush } from '../../visual-engine/index.js';
import type { Brush } from '../../visual-engine/index.js';
import { Canvas } from './canvas.js';

// Visio-style paginated canvas. Same Canvas.Left / Canvas.Top placement,
// but the panel's measured size snaps to whole-page units in both axes,
// and the surface renders the page grid (paper + border per page) so the
// user sees where pages start and end.
//
// Why pages: a free-form Canvas grows by 1 px every time a child is
// moved 1 px past the previous max. When that growth feeds a wrapping
// ScrollViewer's autoscroll, the viewport edge keeps moving away from
// the cursor as the cursor approaches it — the scroll feels jittery.
// Quantizing growth to fixed page units gives autoscroll a stable
// target between thresholds. Visio shipped this in 1992; the trick
// stands.
//
// Pages tile starting at (0, 0) and extend right + down. Negative
// Canvas.Left / Canvas.Top still draw (children paint outside the
// page grid), but the page grid itself never extends backward.
//
// DPs:
//   * PageWidth / PageHeight       — page size in dp (default 800×600).
//   * PaperBrush                   — fill for each page. Default white.
//   * PageBorderBrush              — stroke. Default light gray.
//   * PageBorderThickness          — stroke thickness in dp. 0 disables
//                                    the border (just the paper fill).
//
// The standard `Background` DP from Visual paints UNDER the page grid;
// it shows as the desk color when the surrounding viewport is bigger
// than the panel.

const DEFAULT_PAPER_BRUSH        = new SolidColorBrush(Color.FromHex('#ffffff'));
const DEFAULT_PAGE_BORDER_BRUSH  = new SolidColorBrush(Color.FromHex('#d0d0d0'));

export class PaginatedCanvas extends Canvas
{
    public static readonly PageWidthKey            = Model.RegisterProperty<number>(           PaginatedCanvas, 'PageWidth',            800, MetaData.Measure | MetaData.Render);
    public static readonly PageHeightKey           = Model.RegisterProperty<number>(           PaginatedCanvas, 'PageHeight',           600, MetaData.Measure | MetaData.Render);
    public static readonly PaperBrushKey           = Model.RegisterProperty<Brush | undefined>(PaginatedCanvas, 'PaperBrush',           undefined, MetaData.Render);
    public static readonly PageBorderBrushKey      = Model.RegisterProperty<Brush | undefined>(PaginatedCanvas, 'PageBorderBrush',      undefined, MetaData.Render);
    public static readonly PageBorderThicknessKey  = Model.RegisterProperty<number>(           PaginatedCanvas, 'PageBorderThickness',  1,         MetaData.Render);

    public get PageWidth(): number              { return this.get_property_value(PaginatedCanvas.PageWidthKey); }
    public set PageWidth(value: number)         { this.set_property_value(PaginatedCanvas.PageWidthKey, value); }

    public get PageHeight(): number             { return this.get_property_value(PaginatedCanvas.PageHeightKey); }
    public set PageHeight(value: number)        { this.set_property_value(PaginatedCanvas.PageHeightKey, value); }

    public get PaperBrush(): Brush | undefined           { return this.get_property_value(PaginatedCanvas.PaperBrushKey); }
    public set PaperBrush(value: Brush | undefined)      { this.set_property_value(PaginatedCanvas.PaperBrushKey, value); }

    public get PageBorderBrush(): Brush | undefined      { return this.get_property_value(PaginatedCanvas.PageBorderBrushKey); }
    public set PageBorderBrush(value: Brush | undefined) { this.set_property_value(PaginatedCanvas.PageBorderBrushKey, value); }

    public get PageBorderThickness(): number             { return this.get_property_value(PaginatedCanvas.PageBorderThicknessKey); }
    public set PageBorderThickness(value: number)        { this.set_property_value(PaginatedCanvas.PageBorderThicknessKey, value); }

    protected override MeasureOverride(availableSize: Size): Size
    {
        // super computes the union bbox of children — same logic Canvas
        // uses, including child Measure with unbounded available size.
        const union = super.MeasureOverride(availableSize);
        const pw = Math.max(1, this.PageWidth);
        const ph = Math.max(1, this.PageHeight);
        // ceil(union / page) clamped to ≥ 1 — empty canvas still shows
        // one page so the user has somewhere to drop the first node.
        const cols = Math.max(1, Math.ceil(union.Width  / pw));
        const rows = Math.max(1, Math.ceil(union.Height / ph));
        return new Size(cols * pw, rows * ph);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        // Paint the desk (Visual.Background) UNDER the pages first. Same
        // call Canvas.RenderOverride would have made — done explicitly
        // here because we override the whole method.
        super.RenderOverride(dc);

        const size = this.RenderSize;
        const pw   = Math.max(1, this.PageWidth);
        const ph   = Math.max(1, this.PageHeight);
        // The panel measured to whole-page units, so size / page rounds
        // to an integer in the common case. Round + clamp guards against
        // a sub-page final-arrange slot from an outer container.
        const cols = Math.max(1, Math.round(size.Width  / pw));
        const rows = Math.max(1, Math.round(size.Height / ph));
        const paper       = this.PaperBrush       ?? DEFAULT_PAPER_BRUSH;
        const borderBrush = this.PageBorderBrush  ?? DEFAULT_PAGE_BORDER_BRUSH;
        const thickness   = Math.max(0, this.PageBorderThickness);
        const pen         = thickness > 0 ? new Pen(borderBrush, thickness) : undefined;
        for (let r = 0; r < rows; r++)
        {
            for (let c = 0; c < cols; c++)
            {
                dc.DrawRectangle(paper, pen, new Rect(c * pw, r * ph, pw, ph));
            }
        }
    }
}
