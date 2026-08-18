import {
    Point,
    Size,
    type DrawingContext,
    type PropertyDescriptor,
} from '../runtime/index.js';
import {
    CubicBezierSegment,
    Geometry,
    PathFigure,
    PathGeometry,
} from '../visual-engine/index.js';
import { ContentPresenter } from './templates/content-presenter.js';

// A ContentPresenter that paints a heart, confines picking to the heart
// outline, and (via the inherited ClipChildren) can trim its content to inside
// the stroke. Fill / Stroke / ClipChildren are the inherited Visual DPs; the
// heart geometry feeds the base hooks:
//
//   * buildClipGeometry  — the OUTER heart (inset 0): hit region + ClipToBounds.
//   * buildPaintGeometry  — the heart inset by `inset`. The paint uses t/2 (a
//                           centred stroke lands inside the outline); the
//                           inherited buildChildClipGeometry uses the FULL pen
//                           (the stroke's inner edge), driving ChildClip.
//   * RenderOverride      — paints the chrome. ContentPresenter's RenderOverride
//                           is empty (presenters don't paint), so the heart is
//                           drawn here rather than delegated to the base.
//
// The base ContentPresenter sizes to its content (or to explicit Width / Height
// when empty — the demo's case), so the heart chrome slots in without fighting
// a template.
export class HeartPresenter extends ContentPresenter
{
    // The heart silhouette filling the slot, inset uniformly by `inset` px on
    // every edge. Control points as fractions of w × h (matches
    // src/basic/shapes/heart.ts; kept independent so the shape catalogue isn't
    // touched). No (dx, dy) translation — the children clip lives in this
    // Visual's own space (the renderer's mural-children group), not a child's.
    private buildHeart(size: Size, inset: number): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const w = Math.max(0, size.Width  - 2 * inset);
        const h = Math.max(0, size.Height - 2 * inset);
        const P = (fx: number, fy: number): Point => new Point(inset + w * fx, inset + h * fy);

        const figure = new PathFigure(P(0.5, 0.25) /* top-centre valley */, [
            new CubicBezierSegment(P(0.20, 0.00), P(-0.10, 0.15), P(0.0, 0.30)),  // valley → lobeL
            new CubicBezierSegment(P(-0.05, 0.55), P(0.30, 0.90), P(0.5, 1.0)),   // lobeL → point
            new CubicBezierSegment(P(0.70, 0.90), P(1.05, 0.55), P(1.0, 0.30)),   // point → lobeR
            new CubicBezierSegment(P(1.10, 0.15), P(0.80, 0.00), P(0.5, 0.25)),   // lobeR → valley
        ], true);

        return new PathGeometry([figure]);
    }

    // Outer heart (inset 0) — the hit / clip outline.
    protected override buildClipGeometry(size: Size): Geometry
    {
        return this.buildHeart(size, 0) ?? super.buildClipGeometry(size);
    }

    // The heart inset by `inset` — paint (t/2) and child clip (full pen).
    protected override buildPaintGeometry(size: Size, inset: number): Geometry
    {
        return this.buildHeart(size, inset) ?? super.buildPaintGeometry(size, inset);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        // Base arranges the presented content into the slot.
        super.ArrangeOverride(finalSize);
        // Publish the OUTER heart as the hit region — picking consults
        // Geometry.Contains instead of the AABB. MetaData.None so this never
        // re-invalidates layout. ChildClip is set by the base syncChildClip.
        this.HitTestGeometry = this.buildHeart(finalSize, 0);
        return finalSize;
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const s = this.RenderSize;
        if (s.Width <= 0 || s.Height <= 0) return;
        // Draw the heart HALF a pen inside the outline so the full stroke
        // width stays within it. Presented content renders on top via the
        // visual-child walk, clipped to ChildClip when ClipChildren is on.
        dc.DrawGeometry(this.Fill, this.Stroke, this.buildPaintGeometry(s, (this.Stroke?.Thickness ?? 0) / 2));
    }

    // Stroke is MetaData.Render, but ChildClip (the full-pen inset) is rebuilt at
    // arrange — so a thickness change needs a re-arrange to refresh it. Same
    // render-only-input refresh pattern Border uses for CornerRadius.
    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'Stroke') this.InvalidateArrange();
    }
}
