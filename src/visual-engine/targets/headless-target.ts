import {
    Rect,
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
    //   1. Drain any pending layout invalidations via Flush() — this
    //      performs the measure pass (Content with auto-axis +Infinity)
    //      and the arrange pass, and publishes ActualWidth / ActualHeight
    //      via SetActualSize. On a fresh target with no prior renders,
    //      Visual's invalid caches drive a full pass; on a re-render
    //      with no changes, every Visual short-circuits and Flush is
    //      effectively free.
    //   2. Paint Background (if set) over the resolved surface rect.
    //   3. Walk Content's tree depth-first, calling Visual.Render(dc) on
    //      every node. Composition (parent → child) follows the visual
    //      tree's structural classes — Single contributes its `child`,
    //      Panel contributes its `children`.
    //   4. Drain the render-dirty set — the renderer just painted, so
    //      any visuals queued for repaint are now satisfied.
    //
    // Child positioning: each child's ArrangedRect.{X,Y} is its top-left
    // in the parent's coordinate space. Before recursing, the walk pushes
    // a TranslateTransform onto the DC so the child's Render runs in its
    // own local (0,0) origin, then pops on return. Children arranged at
    // (0, 0) skip the push/pop entirely.
    public Render(dc: DrawingContext): void
    {
        this.Flush();

        const surfaceW = this.ActualWidth;
        const surfaceH = this.ActualHeight;

        if (this.Background !== undefined)
        {
            dc.DrawRectangle(this.Background, undefined, new Rect(0, 0, surfaceW, surfaceH));
        }

        const content = this.Content;
        if (content !== undefined)
        {
            this.renderTree(content, dc);
        }

        this.renderDirty.clear();
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
