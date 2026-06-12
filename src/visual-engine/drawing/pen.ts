import { MetaData, Model } from '../../runtime/index.js';
import type { Brush } from './brush.js';

// SVG / Canvas line-cap values. The string values are the actual SVG
// attribute / Canvas property values, so the renderer can pass them
// through without a translation table.
export enum LineCap
{
    Flat   = 'butt',
    Round  = 'round',
    Square = 'square',
}

// SVG / Canvas line-join values. Same naming convention as LineCap.
export enum LineJoin
{
    Miter = 'miter',
    Round = 'round',
    Bevel = 'bevel',
}

// Dash pattern + offset. Plain value type (not a Model) — mutate by
// constructing a new DashStyle and assigning it to Pen.DashStyle, which
// then fires the Render invalidation through Pen's property machinery.
//
// Dashes are measured in multiples of the Pen's Thickness, matching
// WPF semantics — this way a [2, 2] pattern looks consistent across
// pens of different thickness without per-pen tuning. The renderer
// scales by Thickness when emitting to SVG/Canvas.
export class DashStyle
{
    constructor(
        public readonly Dashes: readonly number[],
        public readonly Offset: number = 0,
    ) {}

    public static readonly Solid:      DashStyle = new DashStyle([]);
    public static readonly Dash:       DashStyle = new DashStyle([2, 2]);
    public static readonly Dot:        DashStyle = new DashStyle([0, 2]);
    public static readonly DashDot:    DashStyle = new DashStyle([2, 2, 0, 2]);
    public static readonly DashDotDot: DashStyle = new DashStyle([2, 2, 0, 2, 0, 2]);

    public Equals(other: DashStyle): boolean
    {
        if (this.Offset !== other.Offset) return false;
        if (this.Dashes.length !== other.Dashes.length) return false;
        for (let i = 0; i < this.Dashes.length; i++)
        {
            if (this.Dashes[i] !== other.Dashes[i]) return false;
        }
        return true;
    }
}

// Stroke spec consumed by DrawingContext draw calls. Pen is a Model so
// its attributes (Brush, Thickness, DashStyle, …) bind / animate / inherit
// like any other property — a binding that mutates Pen.Thickness fires
// InvalidateVisual on every Visual that holds this Pen through the
// existing property-change pipeline (caveat: the holding Visual still
// needs to listen on its Pen's properties; see design §11).
//
// Defaults match WPF Pen: Brush=undefined (no stroke painted),
// Thickness=1, DashStyle=Solid, LineCap=Flat, LineJoin=Miter,
// MiterLimit=10.
export class Pen extends Model
{
    public static readonly BrushKey      = Model.RegisterProperty<Brush | undefined>(Pen, 'Brush',      undefined,       MetaData.Render);
    public static readonly ThicknessKey  = Model.RegisterProperty<number>(           Pen, 'Thickness',  1,               MetaData.Render);
    public static readonly DashStyleKey  = Model.RegisterProperty<DashStyle>(        Pen, 'DashStyle',  DashStyle.Solid, MetaData.Render);
    public static readonly LineCapKey    = Model.RegisterProperty<LineCap>(          Pen, 'LineCap',    LineCap.Flat,    MetaData.Render);
    public static readonly LineJoinKey   = Model.RegisterProperty<LineJoin>(         Pen, 'LineJoin',   LineJoin.Miter,  MetaData.Render);
    public static readonly MiterLimitKey = Model.RegisterProperty<number>(           Pen, 'MiterLimit', 10,              MetaData.Render);

    // Convenience for the common cases — `new Pen()`, `new Pen(brush)`,
    // `new Pen(brush, 2)`. Anything beyond brush+thickness goes through
    // the typed setters.
    constructor(brush?: Brush, thickness?: number)
    {
        super();
        if (brush !== undefined) this.Brush = brush;
        if (thickness !== undefined) this.Thickness = thickness;
    }

    public get Brush(): Brush | undefined { return this.get_property_value(Pen.BrushKey); }
    public set Brush(value: Brush | undefined) { this.set_property_value(Pen.BrushKey, value); }

    public get Thickness(): number { return this.get_property_value(Pen.ThicknessKey); }
    public set Thickness(value: number) { this.set_property_value(Pen.ThicknessKey, value); }

    public get DashStyle(): DashStyle { return this.get_property_value(Pen.DashStyleKey); }
    public set DashStyle(value: DashStyle) { this.set_property_value(Pen.DashStyleKey, value); }

    public get LineCap(): LineCap { return this.get_property_value(Pen.LineCapKey); }
    public set LineCap(value: LineCap) { this.set_property_value(Pen.LineCapKey, value); }

    public get LineJoin(): LineJoin { return this.get_property_value(Pen.LineJoinKey); }
    public set LineJoin(value: LineJoin) { this.set_property_value(Pen.LineJoinKey, value); }

    public get MiterLimit(): number { return this.get_property_value(Pen.MiterLimitKey); }
    public set MiterLimit(value: number) { this.set_property_value(Pen.MiterLimitKey, value); }
}
