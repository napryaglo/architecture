import { Point, Rect, Size, AlignmentAxis, type Visual, type PersistentGuide } from '../../../runtime/index.js';
import { Adorner } from '../../../visual-engine/index.js';
import { Border } from '../../../basic/index.js';
import { Diagram } from '../diagram.js';
import { DiagramSettings } from '../diagram-settings.js';

// Read-only overlay painting the durable user-placed guide lines. Lives in the
// AdornerLayer of the Diagram's ItemsPanel so it scrolls with the canvas, and
// projects each guide position through AdornedToLayerMatrix (camera zoom+pan) —
// the same mechanism the alignment-guides adorner uses. Distinct colour from the
// ephemeral alignment guides. NOT hit-test-visible: grabbing a guide for
// reposition is done by the behavior via pointer-proximity math, so the overlay
// never intercepts pointer events meant for the nodes beneath.
const POOL_SIZE = 64;
const HIDE_OFFSCREEN = -10000;

export class PersistentGuidesAdorner extends Adorner
{
    private readonly _diagram: Diagram;
    private readonly _pool:    Border[] = [];
    private readonly _onChange: () => void;

    constructor(adornedElement: Visual, diagram: Diagram)
    {
        super(adornedElement);
        this._diagram = diagram;
        this.IsHitTestVisible = false;
        for (let i = 0; i < POOL_SIZE; i++)
        {
            const v = new Border();
            v.IsHitTestVisible = false;
            // Leave Width/Height UNSET so Border's Stretch default fills the arrange
            // rect (pinning 0 would collapse every line — see the alignment adorner).
            // Fill is set per-guide in ArrangeOverride (selected vs normal colour).
            this.AttachVisual(v);
            this._pool.push(v);
        }
        this._onChange = (): void => this.InvalidateArrange();
        diagram.AddPropertyChangedListener(Diagram.GuidesKey, this._onChange);
        diagram.AddPropertyChangedListener(Diagram.SelectedGuideKey, this._onChange);
    }

    public override get visualChildren(): Visual[] { return this._pool.slice(); }

    public override MeasureOverride(_available: Size): Size
    {
        const big = new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        for (const v of this._pool) v.Measure(big);
        return Size.Zero;
    }

    public override ArrangeOverride(finalSize: Size): Size
    {
        const guides: readonly PersistentGuide[] = this._diagram.Guides;
        const W = finalSize.Width, H = finalSize.Height;
        const baseThickness = DiagramSettings.PersistentGuideThickness();
        const normal = DiagramSettings.PersistentGuideColor();
        const selected = DiagramSettings.PersistentGuideSelectedColor();
        const selIndex = this._diagram.SelectedGuide;
        const m = this.AdornedToLayerMatrix;
        const used = Math.min(guides.length, this._pool.length);
        for (let i = 0; i < used; i++)
        {
            const g = guides[i]!;
            const v = this._pool[i]!;
            const isSel = i === selIndex;
            v.Fill = isSel ? selected : normal;
            const thickness = isSel ? baseThickness + 2 : baseThickness;   // selected reads thicker
            if (g.axis === AlignmentAxis.X)
            {
                const x = m.IsIdentity ? g.position : m.Transform(new Point(g.position, 0)).X;
                v.Arrange(new Rect(x - thickness / 2, 0, thickness, H));
            }
            else
            {
                const y = m.IsIdentity ? g.position : m.Transform(new Point(0, g.position)).Y;
                v.Arrange(new Rect(0, y - thickness / 2, W, thickness));
            }
        }
        for (let i = used; i < this._pool.length; i++)
            this._pool[i]!.Arrange(new Rect(HIDE_OFFSCREEN, HIDE_OFFSCREEN, 0, 0));
        return finalSize;
    }

    public Dispose(): void
    {
        this._diagram.RemovePropertyChangedListener(Diagram.GuidesKey, this._onChange);
        this._diagram.RemovePropertyChangedListener(Diagram.SelectedGuideKey, this._onChange);
    }
}
