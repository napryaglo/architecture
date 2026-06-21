import {
    Color,
    Rect,
    Size,
    type Visual,
} from '../../../runtime/index.js';
import { Adorner, SolidColorBrush } from '../../../visual-engine/index.js';
import { Border } from '../../../basic/index.js';
import { Diagram } from '../diagram.js';
import type { AlignmentGuide } from './alignment-guides-behavior.js';

// Promoted from the demo's alignment-guides-adorner.mjs. Read-only
// overlay that paints dashed vertical / horizontal lines through the
// alignment-edge positions written by AlignmentGuidesBehavior. Lives
// in the AdornerLayer of the Diagram's ItemsPanel so it scrolls with
// the canvas automatically.
//
// Subscribes to Diagram.AlignmentGuidesKey. On change, InvalidateArrange
// so ArrangeOverride re-reads the guide list and re-positions the
// pooled line visuals.
//
// Pool size = 32; guide counts are bounded by 3 edges × N peers and
// in practice almost never > 12, so the pool absorbs every realistic
// scene without per-frame allocations.

const GUIDE_STROKE = new SolidColorBrush(Color.FromHex('#1976d2'));
const GUIDE_THICKNESS = 1;
const POOL_SIZE = 32;
const HIDE_OFFSCREEN = -10000;

export class AlignmentGuidesAdorner extends Adorner
{
    private readonly _diagram: Diagram;
    private readonly _pool:    Border[] = [];
    private readonly _onChange: () => void;

    constructor(adornedElement: Visual, diagram: Diagram)
    {
        super(adornedElement);
        this._diagram = diagram;
        // Adorner pad transparent → guide overlay never catches pointer
        // events. The guides are purely decorative.
        this.IsHitTestVisible = false;

        for (let i = 0; i < POOL_SIZE; i++)
        {
            const v = new Border();
            v.Background       = GUIDE_STROKE;
            v.IsHitTestVisible = false;
            v.Width            = 0;
            v.Height           = 0;
            this.AttachVisual(v);
            this._pool.push(v);
        }

        this._onChange = (): void => this.InvalidateArrange();
        diagram.AddPropertyChangedListener(Diagram.AlignmentGuidesKey, this._onChange);
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
        const guides: readonly AlignmentGuide[] = this._diagram.AlignmentGuides;
        const W = finalSize.Width;
        const H = finalSize.Height;
        const used = Math.min(guides.length, this._pool.length);
        for (let i = 0; i < used; i++)
        {
            const g = guides[i];
            const v = this._pool[i];
            if (g.axis === 'x')
            {
                // Vertical line at x = position
                v.Arrange(new Rect(g.position - GUIDE_THICKNESS / 2, 0, GUIDE_THICKNESS, H));
            }
            else
            {
                // Horizontal line at y = position
                v.Arrange(new Rect(0, g.position - GUIDE_THICKNESS / 2, W, GUIDE_THICKNESS));
            }
        }
        // Park unused pool slots off-screen so they don't get hit-tested
        // or affect bounding-rect math.
        for (let i = used; i < this._pool.length; i++)
        {
            this._pool[i].Arrange(new Rect(HIDE_OFFSCREEN, HIDE_OFFSCREEN, 0, 0));
        }
        return finalSize;
    }

    public Dispose(): void
    {
        this._diagram.RemovePropertyChangedListener(Diagram.AlignmentGuidesKey, this._onChange);
    }
}
