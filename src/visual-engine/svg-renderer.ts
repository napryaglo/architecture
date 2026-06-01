import type { Visual } from '../runtime/index.js';
import { SvgDomDrawingContext } from './svg-dom-drawing-context.js';

// Live-DOM renderer that paints a Visual tree into an `<svg>` surface
// and keeps the painted result in lock-step with the visual tree on
// subsequent layout / render invalidations.
//
// Document structure per visual:
//
//   <g class="mural-visual" [transform=…] [clip-path=…]>
//     <g class="mural-own">           // own primitives — cleared and
//       … RenderOverride emissions …  // re-emitted on render-dirty
//     </g>
//     … child visuals' outer <g>s …
//   </g>
//
// The outer `<g>` carries the per-visual translate (from ArrangedRect)
// and clip-path (from the Visual.Clip DP) so child visuals inherit
// both transforms. The inner `<g class="mural-own">` is the only thing
// touched on a render-only invalidation — child outers stay put.
//
// Each outer `<g>` is stamped with the VISUAL_BACKREF symbol so the
// HtmlTarget's pointer hit-test (event.target → ancestor walk → back
// reference) can recover the Visual that owns any painted node.
//
// Lifecycle:
//   1. The first Render() walks the whole tree, creating outer + own
//      groups for every Visual and emitting primitives.
//   2. Subsequent Render()s drain the PresentationTarget's renderDirty
//      and arrangeDirty Sets:
//        * render-dirty visuals → own group cleared + re-emitted
//        * arrange-dirty visuals → outer group's transform updated
//        * brand-new visuals    → outer + own created and inserted at
//                                  the right position in the parent
//        * removed visuals      → outer detached and dropped from the map
//
// Limitations / deferred:
//   * No render-tree partition for templated subtrees — the renderer
//     walks `visualChildren`, which already gives the post-template
//     view. Template internals get one `<g>` each like any other Visual.
//   * No measurement / arrange — that's the PresentationTarget's job
//     and runs in Flush() before the render pass.

const SVG_NS = 'http://www.w3.org/2000/svg';

// Stamped on every visual's outer `<g>` so HtmlTarget.HitTest can walk
// `event.target`'s ancestors to recover the owning Visual.
// `Symbol.for` keeps the stamp the same across module boundaries —
// extensions or other packages that grab the same registry symbol
// see the same key.
export const VISUAL_BACKREF: unique symbol = Symbol.for('@visualisation-sub/mural:visual-backref');

interface BackrefHost { [VISUAL_BACKREF]?: Visual; }

interface VisualNodes
{
    outer: SVGGElement;
    own:   SVGGElement;
}

export interface SvgRendererOptions
{
    /** Owner document used to create elements. Defaults to globalThis
     *  .document; tests using jsdom can pass an explicit document. */
    document?: Document;
}

// Companion accessors the renderer needs from each Visual. Declared as
// a structural interface so this file doesn't depend on the concrete
// Visual class (which would cycle through runtime/visual-engine).
interface RenderableVisual extends BackrefHost
{
    readonly ArrangedRect: { X: number; Y: number };
    readonly Clip:         unknown;
    readonly visualChildren: Iterable<RenderableVisual>;
    Render(dc: SvgDomDrawingContext): void;
}

export class SvgRenderer
{
    private readonly surface: SVGSVGElement;
    private readonly defs:    SVGDefsElement;
    private readonly doc:     Document;

    // Visual → its outer + own `<g>` pair. Populated lazily on first
    // visit, kept stable across re-render passes so DOM identity (and
    // any consumer-side references to elements) survive incremental
    // updates.
    private readonly nodes: Map<RenderableVisual, VisualNodes> = new Map();

    // Monotonic counter for `<clipPath>` ids — passed to every
    // SvgDomDrawingContext instance so siblings rendering into the
    // same surface don't collide on identifiers.
    private clipCounter: number = 0;

    constructor(surface: SVGSVGElement, options: SvgRendererOptions = {})
    {
        this.surface = surface;
        this.doc     = options.document ?? globalThis.document;

        // Single `<defs>` block for the surface. Created once,
        // re-used by every DC instance. Cleared during Dispose; the
        // renderer never empties it mid-session because clip-path ids
        // could still be referenced by retained nodes from prior
        // passes (incremental updates keep some clip groups alive).
        //
        // localName test (not `instanceof SVGDefsElement`) so the
        // check works in test environments — jsdom defines the
        // element but not the constructor as a global.
        const existing = surface.querySelector('defs');
        if (existing !== null && existing.localName === 'defs')
        {
            this.defs = existing as SVGDefsElement;
        }
        else
        {
            this.defs = this.doc.createElementNS(SVG_NS, 'defs') as SVGDefsElement;
            surface.insertBefore(this.defs, surface.firstChild);
        }
    }

    // Render (or re-render) the given root Visual subtree into the
    // surface. Idempotent: calling Render again after no invalidations
    // does nothing observable; calling it after invalidations brings
    // the DOM up to date with the current visual tree.
    //
    // `root` is the PresentationTarget's Content — passed explicitly
    // so the renderer doesn't depend on the target type. The renderer
    // walks every reachable visual and reconciles its DOM presence:
    //
    //   * Visit a known visual → maybe update transform / clip, maybe
    //     re-emit own primitives if render-dirty.
    //   * Visit a new visual   → create outer + own groups, insert at
    //     the right position under its parent's outer.
    //   * After walking everything reachable, any leftover entry in
    //     `nodes` is an orphan from a tree mutation → detach + drop.
    //
    // The renderer accepts the renderDirty / arrangeDirty Sets from
    // the PresentationTarget and drains them. Passing `null` for both
    // means "full re-render of the whole subtree" — used on the very
    // first paint when nothing is in the map yet.
    public Render(
        root:        Visual | undefined,
        renderDirty: Set<Visual> | null,
        arrangeDirty: Set<Visual> | null,
    ): void
    {
        // Track which visuals were visited so we can reap orphans.
        const visited = new Set<RenderableVisual>();
        if (root !== undefined)
        {
            this.walk(
                root as unknown as RenderableVisual,
                this.surface,
                renderDirty as unknown as Set<RenderableVisual> | null,
                arrangeDirty as unknown as Set<RenderableVisual> | null,
                visited,
            );
        }
        // Reap orphans — visuals in the map but not visited this pass.
        for (const v of this.nodes.keys())
        {
            if (!visited.has(v))
            {
                const info = this.nodes.get(v)!;
                info.outer.remove();
                this.nodes.delete(v);
            }
        }
        renderDirty?.clear();
        arrangeDirty?.clear();
    }

    // Walk the visual subtree depth-first, reconciling the DOM
    // against `visual` and recursing into its visualChildren. Returns
    // the visual's outer `<g>` so the caller can insert it into the
    // parent if it's new.
    private walk(
        visual:       RenderableVisual,
        parentNode:   SVGElement,
        renderDirty:  Set<RenderableVisual> | null,
        arrangeDirty: Set<RenderableVisual> | null,
        visited:      Set<RenderableVisual>,
    ): void
    {
        visited.add(visual);

        let info = this.nodes.get(visual);
        const isNew = info === undefined;

        if (info === undefined)
        {
            info = {
                outer: this.doc.createElementNS(SVG_NS, 'g') as SVGGElement,
                own:   this.doc.createElementNS(SVG_NS, 'g') as SVGGElement,
            };
            info.outer.setAttribute('class', 'mural-visual');
            info.own  .setAttribute('class', 'mural-own');
            (info.outer as unknown as BackrefHost)[VISUAL_BACKREF] = visual as unknown as Visual;
            info.outer.appendChild(info.own);
            this.nodes.set(visual, info);
            parentNode.appendChild(info.outer);
        }

        // Transform — apply on first paint or when arrange-dirty.
        // ArrangedRect changes are the only thing that move a visual
        // within its parent's coord space, so re-reading on every
        // pass where arrangeDirty mentions us is enough.
        if (isNew || renderDirty === null || arrangeDirty === null
            || arrangeDirty.has(visual))
        {
            this.applyTransform(info.outer, visual);
        }
        // Clip — same trigger conditions.
        if (isNew || renderDirty === null || arrangeDirty === null
            || arrangeDirty.has(visual))
        {
            this.applyClip(info.outer, visual);
        }

        // Own primitives — re-emit on first paint or when render-dirty.
        if (isNew || renderDirty === null || renderDirty.has(visual))
        {
            this.repaintOwn(info.own, visual);
        }

        // Recurse into children. Each child's walk will either re-use
        // an existing outer (no DOM move needed) or create + insert.
        for (const child of visual.visualChildren)
        {
            this.walk(child, info.outer, renderDirty, arrangeDirty, visited);
        }
    }

    private applyTransform(outer: SVGGElement, visual: RenderableVisual): void
    {
        const rect = visual.ArrangedRect;
        if (rect.X === 0 && rect.Y === 0)
        {
            outer.removeAttribute('transform');
        }
        else
        {
            outer.setAttribute(
                'transform',
                `translate(${formatNumber(rect.X)},${formatNumber(rect.Y)})`,
            );
        }
    }

    // Clip handling: when Visual.Clip is set, emit a `<clipPath>` in
    // <defs> and reference it from the outer `<g>`. When clearing, drop
    // both the reference and any prior clip-path def the renderer owns
    // for this visual. Tracked via a WeakMap so we can find and remove
    // the prior def without scanning <defs>.
    private clipDefs = new WeakMap<RenderableVisual, SVGElement>();

    private applyClip(outer: SVGGElement, visual: RenderableVisual): void
    {
        // Tear down any prior clip-path def we own for this visual.
        const prior = this.clipDefs.get(visual);
        if (prior !== undefined)
        {
            prior.remove();
            this.clipDefs.delete(visual);
            outer.removeAttribute('clip-path');
        }
        const clip = visual.Clip as { Rect?: unknown; Center?: unknown } | undefined;
        if (clip === undefined || clip === null) return;

        // Build a fresh <clipPath> off the same geometry classes the
        // DC recognises. We deliberately don't share the DC's PushClip
        // here — clip on the visual wraps the WHOLE subtree (own +
        // children), so it lives on the outer <g>, not nested inside
        // the own group.
        const id = `mural-clip-${this.clipCounter++}`;
        const cp = this.doc.createElementNS(SVG_NS, 'clipPath') as SVGElement;
        cp.setAttribute('id', id);

        if ('Rect' in (clip as object))
        {
            const r = clip as { Rect: { X: number; Y: number; Width: number; Height: number };
                                 RadiusX: number; RadiusY: number };
            const shape = this.doc.createElementNS(SVG_NS, 'rect') as SVGElement;
            shape.setAttribute('x',      formatNumber(r.Rect.X));
            shape.setAttribute('y',      formatNumber(r.Rect.Y));
            shape.setAttribute('width',  formatNumber(r.Rect.Width));
            shape.setAttribute('height', formatNumber(r.Rect.Height));
            if (r.RadiusX > 0) shape.setAttribute('rx', formatNumber(r.RadiusX));
            if (r.RadiusY > 0) shape.setAttribute('ry', formatNumber(r.RadiusY));
            cp.appendChild(shape);
        }
        else if ('Center' in (clip as object))
        {
            const e = clip as { Center: { X: number; Y: number }; RadiusX: number; RadiusY: number };
            const shape = this.doc.createElementNS(SVG_NS, 'ellipse') as SVGElement;
            shape.setAttribute('cx', formatNumber(e.Center.X));
            shape.setAttribute('cy', formatNumber(e.Center.Y));
            shape.setAttribute('rx', formatNumber(e.RadiusX));
            shape.setAttribute('ry', formatNumber(e.RadiusY));
            cp.appendChild(shape);
        }
        else
        {
            return;   // Unsupported clip shape — leave outer unclipped.
        }

        this.defs.appendChild(cp);
        this.clipDefs.set(visual, cp);
        outer.setAttribute('clip-path', `url(#${id})`);
    }

    private repaintOwn(own: SVGGElement, visual: RenderableVisual): void
    {
        // Drop everything we drew last pass — child outers live in
        // the outer group, NOT inside `own`, so this clear is safe.
        while (own.firstChild !== null) own.removeChild(own.firstChild);

        const dc = new SvgDomDrawingContext(own, {
            defs:       this.defs,
            nextClipId: () => `mural-dc-clip-${this.clipCounter++}`,
            document:   this.doc,
        });
        visual.Render(dc);
    }

    // Detach everything the renderer added; leaves the surface itself
    // intact for HtmlTarget.Dispose to remove. Called when the host
    // discards the target or when Content swaps to a different root.
    public Dispose(): void
    {
        for (const info of this.nodes.values())
        {
            info.outer.remove();
        }
        this.nodes.clear();
        // <defs> stays — HtmlTarget removes the surface entirely.
    }
}

function formatNumber(n: number): string { return n.toString(); }
