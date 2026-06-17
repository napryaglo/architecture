// §19-deferred #4 — opentype.js glyph outline → PathFigure[].
//
// Used by FontMetricsMeasurer.BuildGeometry and text-on-path. The
// fundamental coordinate-system note: opentype.js paths use the
// font-design coordinate system where Y is UP (and the glyph's
// origin sits on its baseline). Mural is Y-DOWN. So we flip Y on the
// way through: every font (x, y) becomes (scale * x, -scale * y).
// Baseline placement is up to the caller — pass `originX` /
// `originY` to position each glyph in world space.
//
// opentype.js path commands:
//   { type: 'M', x, y }            — start a new contour
//   { type: 'L', x, y }            — lineTo
//   { type: 'Q', x1, y1, x, y }    — quadTo
//   { type: 'C', x1, y1, x2, y2, x, y } — cubicTo
//   { type: 'Z' }                  — close

import type opentype from 'opentype.js';

import { Point } from '../primitives.js';
import {
    CubicBezierSegment,
    LineSegment,
    PathFigure,
    type PathSegment,
    QuadraticBezierSegment,
} from '../geometry/geometry.js';

interface GlyphLowering
{
    figures: PathFigure[];
    /** width of the glyph in world units after `scale` (= advanceWidth * scale). */
    advance: number;
}

export function glyphToFigures(
    glyph: opentype.Glyph,
    scale: number,
    originX: number,
    originY: number,
): GlyphLowering
{
    const figures: PathFigure[] = [];
    const advance = (glyph.advanceWidth ?? 0) * scale;

    if (glyph.path === undefined || glyph.path.commands === undefined)
    {
        return { figures, advance };
    }

    const cmds = glyph.path.commands as ReadonlyArray<{
        type: 'M' | 'L' | 'Q' | 'C' | 'Z';
        x?: number; y?: number;
        x1?: number; y1?: number;
        x2?: number; y2?: number;
    }>;

    const px = (fx: number): number => originX + scale * fx;
    const py = (fy: number): number => originY - scale * fy;   // Y flip

    let segs: PathSegment[] = [];
    let start: Point | undefined = undefined;
    let pen:   Point | undefined = undefined;

    const flush = (closed: boolean): void => {
        if (start !== undefined && segs.length > 0)
        {
            figures.push(new PathFigure(start, segs, closed));
        }
        else if (start !== undefined && segs.length === 0 && closed === false)
        {
            // Lone moveTo (rare — degenerate glyph) — discard.
        }
        segs = [];
        start = undefined;
        pen   = undefined;
    };

    for (const cmd of cmds)
    {
        switch (cmd.type)
        {
            case 'M': {
                flush(false);
                const p = new Point(px(cmd.x!), py(cmd.y!));
                start = p;
                pen   = p;
                break;
            }
            case 'L': {
                if (start === undefined) break;
                const p = new Point(px(cmd.x!), py(cmd.y!));
                segs.push(new LineSegment(p));
                pen = p;
                break;
            }
            case 'Q': {
                if (start === undefined) break;
                const c1 = new Point(px(cmd.x1!), py(cmd.y1!));
                const p  = new Point(px(cmd.x!),  py(cmd.y!));
                segs.push(new QuadraticBezierSegment(c1, p));
                pen = p;
                break;
            }
            case 'C': {
                if (start === undefined) break;
                const c1 = new Point(px(cmd.x1!), py(cmd.y1!));
                const c2 = new Point(px(cmd.x2!), py(cmd.y2!));
                const p  = new Point(px(cmd.x!),  py(cmd.y!));
                segs.push(new CubicBezierSegment(c1, c2, p));
                pen = p;
                break;
            }
            case 'Z': {
                flush(true);
                break;
            }
        }
    }
    flush(false);
    void pen;
    return { figures, advance };
}
