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

import { MetaData, Model, Size, Visual } from 'mural/runtime';
import { Pen } from 'mural/visual-engine';

export class GeometryView extends Visual {
    static GeometryKey    = Model.RegisterProperty(GeometryView, 'Geometry',    undefined, MetaData.Render);
    static StrokeWidthKey = Model.RegisterProperty(GeometryView, 'StrokeWidth', 1,         MetaData.Render);
    // Fill / Stroke are MetaData.Render — re-render whenever the brush
    // identity changes so an updated SolidColorBrush from the bootstrap's
    // PathColorHex / GlyphColorHex listeners actually repaints the canvas.
    static FillKey        = Model.RegisterProperty(GeometryView, 'Fill',        undefined, MetaData.Render);
    static StrokeKey      = Model.RegisterProperty(GeometryView, 'Stroke',      undefined, MetaData.Render);

    get Geometry()       { return this.get_property_value(GeometryView.GeometryKey); }
    set Geometry(v)      { this.set_property_value(GeometryView.GeometryKey, v); }
    get StrokeWidth()    { return this.get_property_value(GeometryView.StrokeWidthKey); }
    set StrokeWidth(v)   { this.set_property_value(GeometryView.StrokeWidthKey, v); }
    get Fill()           { return this.get_property_value(GeometryView.FillKey); }
    set Fill(v)          { this.set_property_value(GeometryView.FillKey, v); }
    get Stroke()         { return this.get_property_value(GeometryView.StrokeKey); }
    set Stroke(v)        { this.set_property_value(GeometryView.StrokeKey, v); }

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
