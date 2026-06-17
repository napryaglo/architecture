// AlignmentGuidesAdorner — read-only overlay that paints dashed
// vertical / horizontal lines through the alignment-edge positions
// computed by `attachAlignEdges`. Lives in the SCP's inner
// AdornerLayer alongside SelectionResizeAdorner so it scrolls with
// the canvas automatically.
//
// Subscribes to vm.AlignmentGuides. On change, InvalidateArrange so
// ArrangeOverride re-reads the guide list and positions the line
// visuals accordingly. Per-pointer-move re-arrange is cheap; the
// guide count is bounded by 3 (min/mid/max) × 3 × O(others).
//
// Lines use a thin colored Rectangle (1 px) extending across the
// canvas extent. StrokeDashArray would be the WPF / SVG-native form;
// since basic Line shape doesn't ship a dash DP yet, we fake the look
// with thin solid lines at a recognisable color (#1976d2 @Primary).

import { Adorner, SolidColorBrush } from '@visualisation-sub/mural/visual-engine';
import { Border } from '@visualisation-sub/mural/basic';
import { Color, Rect, Size, Thickness } from '@visualisation-sub/mural/runtime';
import { DiagramVM } from './diagram-vm.mjs';

const GUIDE_STROKE = new SolidColorBrush(Color.FromHex('#1976d2'));
const GUIDE_THICKNESS = 1;

// Maximum number of pooled line visuals. Demo guide count is small
// (3 edges × N peers, almost never > 12); a fixed pool keeps Visual
// allocations off the hot path.
const POOL_SIZE = 32;
const HIDE_OFFSCREEN = -10000;

export class AlignmentGuidesAdorner extends Adorner
{
    constructor(itemsPanel, vm)
    {
        super(itemsPanel);
        this._vm = vm;
        // Adorner pad transparent → guide overlay never catches pointer
        // events. The guides are purely decorative.
        this.IsHitTestVisible = false;

        // Pool the line visuals up-front so subsequent arranges only
        // mutate Width / Height rather than allocate.
        this._pool = [];
        for (let i = 0; i < POOL_SIZE; i++)
        {
            const v = new Border();
            v.Background        = GUIDE_STROKE;
            v.IsHitTestVisible  = false;
            v.Width             = 0;
            v.Height            = 0;
            this.AttachVisual(v);
            this._pool.push(v);
        }

        this._onChange = () => this.InvalidateArrange();
        vm.AddPropertyChangedListener(DiagramVM.AlignmentGuidesKey, this._onChange);
    }

    get visualChildren() { return this._pool.slice(); }

    MeasureOverride(_available)
    {
        const big = new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        for (const v of this._pool) v.Measure(big);
        return Size.Zero;
    }

    ArrangeOverride(finalSize)
    {
        const guides = this._vm.AlignmentGuides;
        const W = finalSize.Width;
        const H = finalSize.Height;
        const used = Math.min(guides.length, this._pool.length);
        for (let i = 0; i < used; i++)
        {
            const g = guides[i];
            const v = this._pool[i];
            // Vertical guide line for 'x' axis (perpendicular to X).
            // Horizontal guide line for 'y' axis (perpendicular to Y).
            if (g.axis === 'x')
            {
                v.Arrange(new Rect(g.position - GUIDE_THICKNESS / 2, 0, GUIDE_THICKNESS, H));
            }
            else
            {
                v.Arrange(new Rect(0, g.position - GUIDE_THICKNESS / 2, W, GUIDE_THICKNESS));
            }
        }
        // Park the unused pool slots off-screen.
        for (let i = used; i < this._pool.length; i++)
        {
            this._pool[i].Arrange(new Rect(HIDE_OFFSCREEN, HIDE_OFFSCREEN, 0, 0));
        }
        return finalSize;
    }

    Dispose()
    {
        this._vm.RemovePropertyChangedListener(DiagramVM.AlignmentGuidesKey, this._onChange);
    }
}

// Suppress the warning that DiagramVM appears unused — it's the
// PropertyKey holder for AlignmentGuides.
void Thickness;
