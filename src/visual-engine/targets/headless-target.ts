import {
    Panel,
    Rect,
    Single,
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
export class HeadlessTarget extends PresentationTarget
{
    constructor(width: number, height: number, content?: Visual, deviceScale: number = 1)
    {
        super(width, height, content);
        this.DeviceScale = deviceScale;
    }

    // Drives one full layout + render pass into the given DC:
    //   1. Paint Background (if set) over the full surface rect.
    //   2. Measure(surface) → Arrange(Rect(0, 0, Width, Height)) on Content.
    //   3. Walk Content's tree depth-first, calling Visual.Render(dc) on
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
        const surface = new Size(this.Width, this.Height);

        if (this.Background !== undefined)
        {
            dc.DrawRectangle(this.Background, undefined, new Rect(0, 0, surface.Width, surface.Height));
        }

        const content = this.Content;
        if (content === undefined) return;

        content.Measure(surface);
        content.Arrange(new Rect(0, 0, surface.Width, surface.Height));
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
        visual.Render(dc);
        for (const child of HeadlessTarget.childrenOf(visual))
        {
            this.renderTree(child, dc);
        }
        if (needs_translate)
        {
            dc.Pop();
        }
    }

    private static childrenOf(visual: Visual): readonly Visual[]
    {
        if (visual instanceof Single)
        {
            return visual.child !== undefined ? [visual.child] : [];
        }
        if (visual instanceof Panel)
        {
            return visual.children;
        }
        return [];
    }
}
