import {
    APPROXIMATE_TEXT_MEASURER,
    Color,
    Point,
    Size,
    Visual,
    type DrawingContext,
    type TextMetrics,
} from '../../runtime/index.js';
import {
    EllipseGeometry,
    FontStyle,
    FontWeight,
    FormattedText,
    LineGeometry,
    Pen,
    SolidColorBrush,
} from '../../visual-engine/index.js';
import { Canvas } from '../../Controls/index.js';
import type { Graph } from './graph.js';

// One filled circle, optionally with a centered text label. Sized to
// its bounding box (Radius * 2 each side); MeasureOverride pre-measures
// the label so RenderOverride can center it without re-measuring.
//
// Knows nothing about its position in the parent — placement is the
// Canvas's job, done via Canvas.SetLeft / Canvas.SetTop on the
// instance. The ellipse always renders at local (Radius, Radius), so
// the visible center lands at (Canvas.Left + Radius, Canvas.Top + Radius)
// in the parent's coord space.
export class NodeVisual extends Visual
{
    public Radius: number          = 24;
    public Label: string | undefined;
    public FillColor: Color        = Color.FromHex('#CCE5FF');
    public StrokeColor: Color      = Color.Black;
    public StrokeThickness: number = 1.5;
    public LabelFontFamily: string = 'system-ui, sans-serif';
    public LabelFontSize: number   = 12;
    public LabelColor: Color       = Color.Black;

    private _labelMetrics: TextMetrics | undefined;

    constructor(label?: string)
    {
        super();
        this.Label = label;
    }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        if (this.Label !== undefined && this.Label.length > 0)
        {
            // Use the host's TextMeasurer when attached (real font
            // metrics when a font is loaded). Falls back to the
            // approximation for unattached / no-font scenarios.
            const measurer = this.target?.TextMeasurer ?? APPROXIMATE_TEXT_MEASURER;
            this._labelMetrics = measurer.Measure(
                this.Label,
                this.LabelFontFamily,
                this.LabelFontSize,
                FontWeight.Normal,
                FontStyle.Normal,
            );
        }
        else
        {
            this._labelMetrics = undefined;
        }
        return new Size(this.Radius * 2, this.Radius * 2);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const r = this.Radius;
        dc.DrawGeometry(
            new SolidColorBrush(this.FillColor),
            new Pen(new SolidColorBrush(this.StrokeColor), this.StrokeThickness),
            new EllipseGeometry(new Point(r, r), r, r),
        );

        if (this._labelMetrics !== undefined && this.Label !== undefined)
        {
            const m = this._labelMetrics;
            const text = new FormattedText(
                this.Label,
                this.LabelFontFamily,
                this.LabelFontSize,
                new SolidColorBrush(this.LabelColor),
                FontWeight.Normal,
                FontStyle.Normal,
                m,
            );
            dc.DrawText(text, new Point(r - m.Width / 2, r - m.Height / 2));
        }
    }
}

// Straight line between two points expressed in the EdgeVisual's own
// local coordinate space (origin at the visual's top-left). Sized to
// the axis-aligned bounding box of those two points.
//
// Positioning in the parent is the Canvas's job — the scene builder
// computes the top-left of the line's bounding box in canvas coords,
// passes the line in local coords to this constructor, and stamps
// Canvas.SetLeft / Canvas.SetTop on the resulting instance.
export class EdgeVisual extends Visual
{
    public Color:     Color  = Color.FromHex('#888888');
    public Thickness: number = 1;

    constructor(
        public LocalStart: Point,
        public LocalEnd:   Point,
    )
    {
        super();
    }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        return new Size(
            Math.abs(this.LocalEnd.X - this.LocalStart.X),
            Math.abs(this.LocalEnd.Y - this.LocalStart.Y),
        );
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        dc.DrawGeometry(
            undefined,
            new Pen(new SolidColorBrush(this.Color), this.Thickness),
            new LineGeometry(this.LocalStart, this.LocalEnd),
        );
    }
}

// Style knobs applied to every node / edge in the scene. Per-node
// customization can be done after BuildScene returns by walking the
// canvas's children and mutating fields directly.
export interface SceneStyle
{
    nodeRadius?:          number;
    nodeFillColor?:       Color;
    nodeStrokeColor?:     Color;
    nodeStrokeThickness?: number;
    nodeLabelFontFamily?: string;
    nodeLabelFontSize?:   number;
    nodeLabelColor?:      Color;
    edgeColor?:           Color;
    edgeThickness?:       number;
    // When true (default), each node falls back to displaying its id
    // when no label was set on the Node data. Set false to render
    // labelled circles only.
    labelFallsBackToId?:  boolean;
}

// Composes a Visual tree from a graph + positions. Edges go in first
// so node circles render on top (covering the line endpoints that
// would otherwise poke out of the circle). The returned Canvas is
// suitable as PresentationTarget.Content directly — paired with
// HeadlessTarget's auto-mode, the surface sizes to the bounding box
// of the layout.
//
// Nodes / edges in the graph whose ids aren't in `positions` are
// silently skipped — convenient for incremental layouts that haven't
// placed every node.
export function BuildScene(
    graph: Graph,
    positions: Map<string, Point>,
    style: SceneStyle = {},
): Canvas
{
    const canvas = new Canvas();

    for (const e of graph.edges)
    {
        const a = positions.get(e.from);
        const b = positions.get(e.to);
        if (a === undefined || b === undefined) continue;
        const left = Math.min(a.X, b.X);
        const top  = Math.min(a.Y, b.Y);
        const ev = new EdgeVisual(
            new Point(a.X - left, a.Y - top),
            new Point(b.X - left, b.Y - top),
        );
        if (style.edgeColor     !== undefined) ev.Color     = style.edgeColor;
        if (style.edgeThickness !== undefined) ev.Thickness = style.edgeThickness;
        Canvas.SetLeft(ev, left);
        Canvas.SetTop(ev,  top);
        canvas.AddChild(ev);
    }

    const fallbackToId = style.labelFallsBackToId ?? true;
    for (const n of graph.nodes)
    {
        const c = positions.get(n.id);
        if (c === undefined) continue;
        const label = n.label ?? (fallbackToId ? n.id : undefined);
        const nv = new NodeVisual(label);
        if (style.nodeRadius          !== undefined) nv.Radius          = style.nodeRadius;
        if (style.nodeFillColor       !== undefined) nv.FillColor       = style.nodeFillColor;
        if (style.nodeStrokeColor     !== undefined) nv.StrokeColor     = style.nodeStrokeColor;
        if (style.nodeStrokeThickness !== undefined) nv.StrokeThickness = style.nodeStrokeThickness;
        if (style.nodeLabelFontFamily !== undefined) nv.LabelFontFamily = style.nodeLabelFontFamily;
        if (style.nodeLabelFontSize   !== undefined) nv.LabelFontSize   = style.nodeLabelFontSize;
        if (style.nodeLabelColor      !== undefined) nv.LabelColor      = style.nodeLabelColor;
        // Center the circle on the layout's position — the node's local
        // (Radius, Radius) is where its visible center lands.
        Canvas.SetLeft(nv, c.X - nv.Radius);
        Canvas.SetTop(nv,  c.Y - nv.Radius);
        canvas.AddChild(nv);
    }

    return canvas;
}
