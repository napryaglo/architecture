import { Rect } from '../visual-engine/primitives.js';

// §19.3 — alignment-edges math.
//
// Given a `moving` rectangle (e.g., the AABB of a node being dragged)
// and a list of `others` (the AABBs of every static peer node), find
// the alignment guides whose displayed position is within `tolerance`
// pixels of any pairing of moving-edge × other-edge under the chosen
// `edges` set, then compute the snapped rectangle by applying the
// closest matching delta independently per axis.
//
// Pure functions — no Visual / DP / Model dependencies. The diagram
// behavior (`attachAlignEdges`) is the consumer.

// Which edge of a rectangle a guide line passes through:
//   * 'min'  — left edge (X axis) or top edge (Y axis)
//   * 'mid'  — horizontal/vertical center line
//   * 'max'  — right edge (X axis) or bottom edge (Y axis)
export type EdgeKind = 'min' | 'mid' | 'max';

export interface AlignmentGuide
{
    // Which axis the guide line is perpendicular to. An 'x' guide is a
    // VERTICAL line at the named position; a 'y' guide is a horizontal
    // line. Consumers visualise it as a line extending across the
    // diagram surface at the guide's `position` coordinate.
    axis: 'x' | 'y';

    // The coordinate value where the guide line should be drawn. In
    // the diagram's content-coordinate space (canvas coords).
    position: number;

    // Which edges of the moving and other rectangles aligned. Useful
    // for consumers that want to render different chrome per edge kind
    // (e.g., dashed for mid, solid for min/max).
    movingEdge: EdgeKind;
    otherEdge:  EdgeKind;

    // The static rectangle the moving rect aligned with. Lets the
    // consumer extend the guide line only across the relevant peer
    // (not full-canvas) for cleaner visual feedback.
    otherRect: Rect;
}

export interface AlignmentResult
{
    guides: readonly AlignmentGuide[];
    snapped: Rect;
}

export interface AlignmentOptions
{
    tolerance?: number;
    edges?:     readonly EdgeKind[];
}

const DEFAULT_TOLERANCE = 5;
const DEFAULT_EDGES: readonly EdgeKind[] = ['min', 'mid', 'max'];

function edgeCoord(rect: Rect, axis: 'x' | 'y', edge: EdgeKind): number
{
    if (axis === 'x')
    {
        if (edge === 'min') return rect.X;
        if (edge === 'max') return rect.X + rect.Width;
        return rect.X + rect.Width / 2;
    }
    if (edge === 'min') return rect.Y;
    if (edge === 'max') return rect.Y + rect.Height;
    return rect.Y + rect.Height / 2;
}

// findAlignmentGuides: scan every (movingEdge × otherEdge × other) triple
// per axis; emit a guide whenever the displayed edge coordinate is
// within `tolerance` of the moving edge. The snap step picks the
// closest-magnitude delta per axis (first-wins on ties — guides emitted
// earlier in iteration order win) and applies it to the moving rect.
export function findAlignmentGuides(
    moving: Rect,
    others: readonly Rect[],
    opts: AlignmentOptions = {}): AlignmentResult
{
    const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
    const edges     = opts.edges     ?? DEFAULT_EDGES;

    const guides: AlignmentGuide[] = [];
    let bestDx: number | undefined = undefined;
    let bestDy: number | undefined = undefined;

    for (const axis of ['x', 'y'] as const)
    {
        for (const me of edges)
        {
            const mc = edgeCoord(moving, axis, me);
            for (const other of others)
            {
                for (const oe of edges)
                {
                    const oc = edgeCoord(other, axis, oe);
                    const d  = oc - mc;
                    if (Math.abs(d) > tolerance) continue;
                    guides.push({ axis, position: oc, movingEdge: me, otherEdge: oe, otherRect: other });
                    if (axis === 'x')
                    {
                        if (bestDx === undefined || Math.abs(d) < Math.abs(bestDx)) bestDx = d;
                    }
                    else
                    {
                        if (bestDy === undefined || Math.abs(d) < Math.abs(bestDy)) bestDy = d;
                    }
                }
            }
        }
    }

    const snapped = new Rect(
        moving.X + (bestDx ?? 0),
        moving.Y + (bestDy ?? 0),
        moving.Width,
        moving.Height,
    );
    return { guides, snapped };
}
