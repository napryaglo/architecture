// GeometryView — a Visual that fills + strokes an arbitrary
// `Geometry`. Demo-local helper for the text-on-path demo; if a third
// demo needs the same primitive it gets promoted to
// `src/basic/geometry-view.ts` and ported to .ts.
//
// Layout: zero-by-zero MeasureOverride — the host (a Canvas) is
// expected to position the view explicitly (Canvas.SetLeft/SetTop) so
// the inner Geometry's natural extent paints in place.
//
// Render: one DrawGeometry call per (fill, stroke) pair so consumers
// can paint a fill-only, stroke-only, or both surface in a single
// Visual.

import { MetaData, Model, Size, Visual } from '@visualisation-sub/mural/runtime';
import { Pen } from '@visualisation-sub/mural/visual-engine';

export class GeometryView extends Visual {
    static {
        Model.RegisterProperty(GeometryView, 'Geometry', undefined, MetaData.Render);
        Model.RegisterProperty(GeometryView, 'StrokeWidth', 1, MetaData.Render);
    }

    get Geometry()       { return this._get_property_value_by_name('Geometry'); }
    set Geometry(v)      { this._set_property_value_by_name('Geometry', v); }
    get StrokeWidth()    { return this._get_property_value_by_name('StrokeWidth'); }
    set StrokeWidth(v)   { this._set_property_value_by_name('StrokeWidth', v); }

    MeasureOverride(_) { return new Size(0, 0); }
    ArrangeOverride(finalSize) { return finalSize; }

    RenderOverride(dc) {
        const g = this.Geometry;
        if (g === undefined) return;
        const fill   = this.Fill;
        const stroke = this.Stroke;
        const width  = this.StrokeWidth;
        if (fill !== undefined) dc.DrawGeometry(fill, undefined, g);
        if (stroke !== undefined && width > 0)
        {
            dc.DrawGeometry(undefined, new Pen(stroke, width), g);
        }
    }
}
