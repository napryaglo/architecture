import { MetaData, MuralBase, Panel, Rect, Size, Visual } from '../../runtime/index.js';
import { Canvas } from '../../basic/panels/canvas.js';

// Z-order discriminator for DiagramLayersPanel children. Connectors
// land in the bottom layer (rendered FIRST, so figures paint over
// them). Figures land in the top layer (rendered SECOND).
//
// Adorners (selection rings, edit handles, drag-create ghost, port-
// discovery overlays) ride on the framework's existing AdornerLayer
// overlay — see § 3.7 of
// [docs/connectors.md](../../../docs/connectors.md).
export enum DiagramLayer
{
    Connectors = 'Connectors',
    Figures    = 'Figures',
}

// A 2-layer Canvas-shaped Panel. Owns two internal Canvas instances
// (connectors / figures) and routes externally-added children to the
// appropriate inner Canvas based on the [DiagramLayersPanel.Layer]
// attached property. Connectors layer renders first → painted behind
// figures.
//
// Each inner Canvas honours Canvas.Left / Canvas.Top on its children
// — Connectors paint at (0, 0) and carry absolute diagram-host
// coordinates in their Geometry per § 5; Figures carry their position
// via Canvas.Left / Top from Figure.Left / Top mirroring per
// [figure.ts:308-315](./figure.ts#L308-L315).
//
// Layer attached property changes are NOT live-reactive in v1 — once
// a child is routed it stays. The typical use is "add once, leave
// alone"; live re-routing can be added when a real consumer needs it.
export class DiagramLayersPanel extends Panel
{
    public static readonly LayerKey = MuralBase.RegisterAttachedProperty<DiagramLayer>(
        DiagramLayersPanel, 'Layer', DiagramLayer.Figures, MetaData.None);

    public static GetLayer(v: Visual): DiagramLayer
    {
        return v.get_property_value(DiagramLayersPanel.LayerKey);
    }
    public static SetLayer(v: Visual, value: DiagramLayer): void
    {
        v.set_property_value(DiagramLayersPanel.LayerKey, value);
    }

    private readonly _connectorsLayer: Canvas;
    private readonly _figuresLayer:    Canvas;

    constructor()
    {
        super();
        this._connectorsLayer = new Canvas();
        this._figuresLayer    = new Canvas();
        // Insertion order = paint order. Connectors first (back),
        // figures second (front). super.AddChild routes through the
        // base Panel's _children — the per-child override below is
        // for EXTERNAL adds.
        super.AddChild(this._connectorsLayer);
        super.AddChild(this._figuresLayer);
    }

    public get ConnectorsLayer(): Canvas { return this._connectorsLayer; }
    public get FiguresLayer():    Canvas { return this._figuresLayer; }

    // Route logical child adds (consumer markup → AddChild) to the
    // appropriate inner Canvas. Items-control AddVisualChild calls
    // route through `AddVisualChild` below.
    public override AddChild(child: Visual): void
    {
        this._targetLayer(child).AddChild(child);
    }

    public override RemoveChild(child: Visual): void
    {
        // Try both layers — a child could have been routed to either
        // depending on the Layer attached property at AddChild time.
        if (this._connectorsLayer.Children.IndexOf(child) !== -1)
        {
            this._connectorsLayer.RemoveChild(child);
            return;
        }
        if (this._figuresLayer.Children.IndexOf(child) !== -1)
        {
            this._figuresLayer.RemoveChild(child);
        }
    }

    public override AddVisualChild(child: Visual): void
    {
        this._targetLayer(child).AddVisualChild(child);
    }

    public override RemoveVisualChild(child: Visual): void
    {
        if (this._connectorsLayer.Children.IndexOf(child) !== -1)
        {
            this._connectorsLayer.RemoveVisualChild(child);
            return;
        }
        if (this._figuresLayer.Children.IndexOf(child) !== -1)
        {
            this._figuresLayer.RemoveVisualChild(child);
        }
    }

    private _targetLayer(child: Visual): Canvas
    {
        return DiagramLayersPanel.GetLayer(child) === DiagramLayer.Connectors
            ? this._connectorsLayer
            : this._figuresLayer;
    }

    // Both inner Canvases stretch to fill the panel; the panel's own
    // DesiredSize is the union of both. Mirrors the Canvas behaviour
    // for "tight to children" sizing — a surrounding ScrollViewer can
    // observe an extent that grows with whichever layer is largest.
    protected override MeasureOverride(availableSize: Size): Size
    {
        this._connectorsLayer.Measure(availableSize);
        this._figuresLayer.Measure(availableSize);
        return new Size(
            Math.max(this._connectorsLayer.DesiredSize.Width,  this._figuresLayer.DesiredSize.Width),
            Math.max(this._connectorsLayer.DesiredSize.Height, this._figuresLayer.DesiredSize.Height),
        );
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const r = new Rect(0, 0, finalSize.Width, finalSize.Height);
        this._connectorsLayer.Arrange(r);
        this._figuresLayer.Arrange(r);
        return finalSize;
    }
}
