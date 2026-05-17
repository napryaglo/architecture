import {
    Rect,
    Size,
    type DrawingContext,
    type Visual,
} from '../../runtime/index.js';
import { PresentationTarget } from '../presentation-target.js';
import { TranslateTransform } from '../transform.js';

// PresentationTarget with no host — used by tests, build-time SVG/PNG
// export, and server-side rendering. Owns nothing in the DOM; just
// carries the scene description plus a fixed device-pixel scale.
//
// Unlike HtmlTarget, there's no event loop, no dirty queue, no
// ResizeObserver — Render(dc) is an explicit one-shot pass driven by
// the caller. Plays the role an SvgRenderer / CanvasRenderer would
// play under HtmlTarget, but flattened into a single synchronous call
// since there's no host to coordinate with.
//
// Sizing: pass numbers for fixed-size output, or omit / pass undefined
// to let the axis size to Content.DesiredSize at Render time. Per-axis,
// independent — `new HeadlessTarget(800)` pins width and lets height
// grow with content.
export class HeadlessTarget extends PresentationTarget
{
    constructor(width?: number, height?: number, content?: Visual, deviceScale: number = 1)
    {
        super(width, height, content);
        this.DeviceScale = deviceScale;
    }

    // Drives one full layout + render pass into the given DC:
    //   1. Measure Content with the user-set Width / Height, swapping in
    //      +Infinity on any auto axis so Content reports its natural
    //      DesiredSize.
    //   2. Resolve the surface size — auto axes adopt the matching
    //      Content.DesiredSize component; fixed axes keep their value.
    //      Result is published via SetActualSize so callers can read
    //      ActualWidth / ActualHeight after Render returns.
    //   3. Paint Background (if set) over the resolved surface rect.
    //   4. Arrange Content at (0, 0, ActualWidth, ActualHeight).
    //   5. Walk Content's tree depth-first, calling Visual.Render(dc) on
    //      every node. Composition (parent → child) follows the visual
    //      tree's structural classes — Single contributes its `child`,
    //      Panel contributes its `children`.
    //
    // Child positioning: each child's ArrangedRect.{X,Y} is its top-left
    // in the parent's coordinate space. Before recursing, the walk pushes
    // a TranslateTransform onto the DC so the child's Render runs in its
    // own local (0,0) origin, then pops on return. Children arranged at
    // (0, 0) skip the push/pop entirely.
    public Render(dc: DrawingContext): void
    {
        const content = this.Content;
        const autoW = Number.isNaN(this.Width);
        const autoH = Number.isNaN(this.Height);

        let surfaceW: number;
        let surfaceH: number;

        if (content !== undefined)
        {
            // +Infinity on an auto axis tells the child "no upper bound" —
            // Visual.Measure clamps it through MinWidth/MaxWidth so
            // unconstrained naturally collapses to MaxWidth (default
            // +Infinity) and MeasureOverride returns a finite size based
            // on content.
            const availW = autoW ? Number.POSITIVE_INFINITY : this.Width;
            const availH = autoH ? Number.POSITIVE_INFINITY : this.Height;
            content.Measure(new Size(availW, availH));

            surfaceW = autoW ? content.DesiredSize.Width  : this.Width;
            surfaceH = autoH ? content.DesiredSize.Height : this.Height;
        }
        else
        {
            // No content: auto axes have nothing to measure → 0. Fixed
            // axes keep their value (Background still gets painted).
            surfaceW = autoW ? 0 : this.Width;
            surfaceH = autoH ? 0 : this.Height;
        }

        this.SetActualSize(surfaceW, surfaceH);

        if (this.Background !== undefined)
        {
            dc.DrawRectangle(this.Background, undefined, new Rect(0, 0, surfaceW, surfaceH));
        }

        if (content === undefined) return;

        content.Arrange(new Rect(0, 0, surfaceW, surfaceH));
        this.renderTree(content, dc);
    }

    private renderTree(visual: Visual, dc: DrawingContext): void
    {
        // ArrangedRect is the final aligned rect in the parent's
        // coordinate space (slot.X + alignment offset, renderSize). Push
        // the translate so this Visual's RenderOverride and its
        // descendants draw in the Visual's own (0, 0) local space.
        // Applies to the root too — when the root has explicit Width /
        // Height with default Stretch, alignment centers it inside the
        // target surface, so the root's ArrangedRect.X / Y are non-zero.
        const rect = visual.ArrangedRect;
        const needs_translate = rect.X !== 0 || rect.Y !== 0;
        if (needs_translate)
        {
            dc.PushTransform(new TranslateTransform(rect.X, rect.Y));
        }
        // Clip — applied AFTER the translate so the geometry is in the
        // Visual's local coordinate space (consistent with how
        // RenderOverride emits draw calls). Wraps both RenderOverride
        // AND the descendant walk, popped after children.
        const clip = visual.Clip;
        if (clip !== undefined)
        {
            dc.PushClip(clip as Parameters<DrawingContext['PushClip']>[0]);
        }
        visual.Render(dc);
        // Walk the VISUAL children — what the renderer sees, which
        // post-templating differs from the logical content. Every
        // Visual exposes this getter (default empty for leaves;
        // Single / Panel / future ContentPresenter override).
        for (const child of visual.visualChildren)
        {
            this.renderTree(child, dc);
        }
        if (clip !== undefined)
        {
            dc.Pop();
        }
        if (needs_translate)
        {
            dc.Pop();
        }
    }
}
