import {
    MetaData,
    Model,
    Point,
    Size,
    type DrawingContext,
} from '../runtime/index.js';
import {
    Brush,
    CubicBezierSegment,
    Geometry,
    PathFigure,
    PathGeometry,
    Pen,
} from '../visual-engine/index.js';
import { ContentPresenter } from './templates/content-presenter.js';

// A ContentPresenter that paints a heart. It draws its own two-lobe-top +
// pointed-bottom silhouette (Fill + Stroke, like a Shape) and confines
// picking to that outline — so only clicks inside the heart register.
// Any presented Content renders on top, clipped to the heart.
//
//   * RenderOverride  — draws the heart chrome behind the content.
//   * ArrangeOverride — arranges the content (base), then publishes the
//                       silhouette as HitTestGeometry (hit confinement)
//                       and as Clip (content is trimmed to the heart).
//
// The base ContentPresenter contributes no paint of its own and sizes to
// its content (or to explicit Width / Height when empty — the demo's
// case), so the heart chrome slots in without fighting a template.
export class HeartPresenter extends ContentPresenter
{
    // Mirror Shape's Fill (interior brush) + Stroke (outline Pen) so the
    // same markup — Fill = <brush>, Stroke = <pen> — drives the heart.
    public static override readonly FillKey   = Model.RegisterProperty<Brush | undefined>(
        HeartPresenter, 'Fill',   undefined, MetaData.Render);
    
    public static override readonly StrokeKey = Model.RegisterProperty<Pen   | undefined>(
        HeartPresenter, 'Stroke', undefined, MetaData.Render);

    public override get Fill(): Brush | undefined { return this.get_property_value(HeartPresenter.FillKey); }
    public override set Fill(value: Brush | undefined) { this.set_property_value(HeartPresenter.FillKey, value); }

    public override get Stroke(): Pen | undefined { return this.get_property_value(HeartPresenter.StrokeKey); }
    public override set Stroke(value: Pen | undefined) { this.set_property_value(HeartPresenter.StrokeKey, value); }

    // When true, the presented Content is clipped to the heart inset by the
    // FULL pen thickness — i.e. to the stroke's inner edge — so content sits
    // inside the border rather than overlapping it. Off by default (content
    // overflows freely, like a plain ContentPresenter).
    public static override readonly ClipChildrenKey = Model.RegisterProperty<boolean>(
        HeartPresenter, 'ClipChildren', false, MetaData.Arrange);

    public override get ClipChildren(): boolean { return this.get_property_value(HeartPresenter.ClipChildrenKey); }
    public override set ClipChildren(value: boolean) { this.set_property_value(HeartPresenter.ClipChildrenKey, value); }

    // Heart silhouette filling the slot, inset uniformly by `inset` px on
    // every edge and translated by (dx, dy). Control points as fractions of
    // w × h. Replicated from src/basic/shapes/heart.ts (kept independent so
    // the shape catalogue isn't touched).
    //
    // Callers use different insets: HitTestGeometry uses the OUTER heart
    // (inset 0 — the full slot); the drawn fill + stroke inset by HALF the
    // pen (a centred stroke then lands fully inside the outline); the child
    // clip insets by the FULL pen (the stroke's inner edge). (dx, dy) shifts
    // the path into a child's local space when clipping aligned content.
    private buildHeart(size: Size, inset: number, dx = 0, dy = 0): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const w = Math.max(0, size.Width  - 2 * inset);
        const h = Math.max(0, size.Height - 2 * inset);
        // Point at fractions (fx, fy) of the inset box, shifted by (dx, dy).
        const P = (fx: number, fy: number): Point =>
            new Point(dx + inset + w * fx, dy + inset + h * fy);

        const figure = new PathFigure(P(0.5, 0.25) /* top-centre valley */, [
            new CubicBezierSegment(P(0.20, 0.00), P(-0.10, 0.15), P(0.0, 0.30)),  // valley → lobeL
            new CubicBezierSegment(P(-0.05, 0.55), P(0.30, 0.90), P(0.5, 1.0)),   // lobeL → point
            new CubicBezierSegment(P(0.70, 0.90), P(1.05, 0.55), P(1.0, 0.30)),   // point → lobeR
            new CubicBezierSegment(P(1.10, 0.15), P(0.80, 0.00), P(0.5, 0.25)),   // lobeR → valley
        ], true);

        return new PathGeometry([figure]);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        // Base arranges the presented content into the slot.
        super.ArrangeOverride(finalSize);
        // Publish the OUTER heart (inset 0) as the hit region — picking
        // consults Geometry.Contains instead of the AABB. MetaData.None so
        // this never re-invalidates layout.
        this.HitTestGeometry = this.buildHeart(finalSize, 0);
        this.clipContent(finalSize);
        return finalSize;
    }

    // Clip the presented content to the heart's inner edge when ClipChildren
    // is on. The clip goes on the CONTENT visual, not on us: our own Clip
    // would also trim the heart chrome and eat the stroke. The child's Clip
    // lives in the child's local space, so shift the heart by the child's
    // arranged offset (aligned / overflowing content sits off our origin).
    private clipContent(finalSize: Size): void
    {
        const child = this.visualChildren[0];
        if (child === undefined) return;
        if (!this.ClipChildren)
        {
            child.Clip = undefined;
            return;
        }
        const pen = this.Stroke?.Thickness ?? 0;
        const rect = child.ArrangedRect;
        child.Clip = this.buildHeart(finalSize, pen, -rect.X, -rect.Y);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        // Draw the heart HALF a pen inside the clip so the full stroke
        // width stays within the clipped region (see buildHeart).
        const half = (this.Stroke?.Thickness ?? 0) / 2;
        const geo = this.buildHeart(this.RenderSize, half);
        if (geo === undefined) return;
        // One call — the heart chrome. Presented content renders on top
        // via the visual-child walk, clipped by the Clip set in Arrange.
        dc.DrawGeometry(this.Fill, this.Stroke, geo);
    }
}
