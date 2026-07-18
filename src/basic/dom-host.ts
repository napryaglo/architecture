import { Element, Size, type DrawingContext } from '../runtime/index.js';

// DomHost — a leaf Visual that hosts a live HTML element inside mural's SVG
// surface via a <foreignObject>.
//
// mural paints its whole UI into one <svg>; it has no DOM to drop a component
// like Monaco into. DomHost bridges that: the SvgRenderer wraps this control's
// `HostElement` in a persistent <foreignObject> sized to the control's arranged
// box. Crucially the wrapper lives in the visual's OUTER group (not the
// repaint-cleared `own` group), so a stateful embed — a Monaco editor, a
// webview, a charting canvas — survives every layout / render invalidation
// instead of being torn down and recreated on each paint.
//
// Usage: place a DomHost in a bounded slot (a document-tab body, a fixed pane),
// let it arrange, then mount your DOM component into `HostElement`:
//
//     const host = new DomHost();
//     // ...host is in the tree and arranged...
//     monaco.editor.create(host.HostElement, { ... });
//
// Sizing: MeasureOverride fills its slot. A DOM host has no intrinsic content
// size mural can measure, so an unbounded (auto) axis collapses to 0 — give a
// DomHost a bounded slot, don't rely on it to auto-size.
//
// Input: the embedded DOM paints on top of the mural hit pad, so it receives
// native focus / keyboard / mouse. mural still routes its own pointer events to
// the DomHost via the outer-group back-reference; a host that must fully own
// input should stop propagation at its element boundary.
export class DomHost extends Element
{
    private _host: HTMLElement | undefined;

    // Document the host element is created in. Defaults to the ambient
    // globalThis.document (the Electron renderer / browser). Off-screen or
    // multi-document hosts (and tests, which run in Node with no global DOM)
    // assign a specific document before the first `HostElement` access; the
    // renderer adopts the element into the surface's document if they differ.
    public OwnerDocument: Document | undefined;

    // The live element consumers mount their content into. Created lazily on
    // first access — a DomHost built during markup instantiation has no
    // document yet. Stable for the control's lifetime: the renderer wraps this
    // exact node in a <foreignObject> and never recreates it.
    public get HostElement(): HTMLElement
    {
        if (this._host === undefined)
        {
            const doc = this.OwnerDocument ?? (globalThis as { document?: Document }).document;
            if (doc === undefined)
            {
                throw new Error(
                    'DomHost.HostElement: no document available — set OwnerDocument '
                    + 'before access in a non-DOM environment.',
                );
            }
            this._host = this.CreateHostElement(doc);
        }
        return this._host;
    }

    // Builds the element that gets wrapped in the <foreignObject>. The base
    // returns an empty slot-filling div; a subclass overrides this to host a
    // real foreign component (a Monaco editor, a webview, a chart) — call
    // `super.CreateHostElement(document)` for the sized container, mount your
    // component into it, and return it. Runs once per control, from the
    // `HostElement` getter, so the returned node is the stable host the
    // renderer never recreates.
    protected CreateHostElement(document: Document): HTMLElement
    {
        const el = document.createElement('div');
        el.style.width    = '100%';
        el.style.height   = '100%';
        el.style.overflow = 'hidden';
        return el;
    }

    // Renderer-facing hook (structural `RenderableVisual.ForeignElement`).
    // Undefined until `HostElement` is first materialised, so the renderer
    // only creates the <foreignObject> once a consumer has something to host.
    public get ForeignElement(): HTMLElement | undefined { return this._host; }

    // Fill the slot. An unbounded (Infinity) axis has no intrinsic content
    // size to report, so it collapses to 0 — a DOM host must be given a
    // bounded slot rather than auto-sized.
    protected override MeasureOverride(available: Size): Size
    {
        const w = Number.isFinite(available.Width)  ? available.Width  : 0;
        const h = Number.isFinite(available.Height) ? available.Height : 0;
        return new Size(w, h);
    }

    // No own primitives — the <foreignObject> is managed by the renderer, not
    // emitted through the DrawingContext.
    protected override RenderOverride(_dc: DrawingContext): void { }
}
