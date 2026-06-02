import type { Visual } from '../../runtime/index.js';
import {
    InputManager,
    PointerButton,
    type PointerEventInit,
    type WheelEventInit,
    type WheelDeltaMode,
    type ModifierKeys,
} from '../../runtime/index.js';
import { PresentationTarget } from '../presentation-target.js';
import { SvgRenderer, VISUAL_BACKREF } from '../svg-renderer.js';

// VISUAL_BACKREF stamp lives in svg-renderer.ts; re-import here for
// the HitTest walk so the read side agrees with the write side.
// Re-export so consumers (tests / extensions) can read the stamp off
// any painted node without importing the renderer.
export { VISUAL_BACKREF };

interface BackrefHost { [VISUAL_BACKREF]?: Visual; }

// Normalise a browser PointerEvent into our runtime-side init record.
// PointerEvent.button is `-1` between presses (no button); we mirror
// that with PointerButton.None instead of leaking the negative value
// through the runtime types. `pressure` defaults to 0.5 for non-pressure
// pointers per the W3C spec — we forward whatever the event carries.
function pointerInit(e: PointerEvent, hostX: number, hostY: number): PointerEventInit
{
    return {
        HostX: hostX,
        HostY: hostY,
        Button: e.button < 0 ? PointerButton.None : (e.button as PointerButton),
        Buttons: e.buttons,
        Modifiers: extractModifiers(e),
        PointerId: e.pointerId,
        Pressure: e.pressure,
        PointerType: normalisePointerType(e.pointerType),
    };
}

function extractModifiers(e: MouseEvent | KeyboardEvent | WheelEvent): ModifierKeys
{
    return {
        Shift:   e.shiftKey,
        Control: e.ctrlKey,
        Alt:     e.altKey,
        Meta:    e.metaKey,
    };
}

function normalisePointerType(t: string): PointerEventInit['PointerType']
{
    if (t === 'mouse' || t === 'pen' || t === 'touch') return t;
    return 'unknown';
}

// WheelEvent.deltaMode is the integer constants 0 (pixel), 1 (line),
// 2 (page). The runtime types use the string forms to keep handler
// code readable; everything outside the spec range falls back to
// 'pixel' to avoid undefined behaviour on exotic devices.
function wheelDeltaMode(m: number): WheelDeltaMode
{
    if (m === 1) return 'line';
    if (m === 2) return 'page';
    return 'pixel';
}

// HtmlTarget construction options. `backend` picks the rendering pipeline
// inside the host element (SVG node tree for <=10k visible elements,
// Canvas commands for everything else). `devicePixelRatio` lets tests
// override the default `window.devicePixelRatio`.
export interface HtmlTargetOptions
{
    backend?: 'svg' | 'canvas';
    devicePixelRatio?: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// PresentationTarget for browser hosting. Owns:
//   * the host Element (passed by the consumer — a <div>, <section>, …)
//   * the rendering surface (<svg> or <canvas>) appended inside the host
//   * a ResizeObserver that translates host size changes into
//     Width / Height updates on the PresentationTarget
//   * a one-shot read of window.devicePixelRatio into DeviceScale
//   * (deferred until build-order step 12.8) the SvgRenderer /
//     CanvasRenderer instance that does the actual painting
//
// Until the renderer is wired up, setting `Content` has no visible
// effect — the DOM mount, resize observation, and DPI tracking are all
// live and observable through the inherited PresentationTarget
// property surface, but the Visual tree is not yet painted.
export class HtmlTarget extends PresentationTarget
{
    private readonly host: Element;
    private readonly surface: SVGSVGElement; // TODO: HTMLCanvasElement when backend='canvas'
    private readonly resize_observer: ResizeObserver;
    private readonly options: Required<Pick<HtmlTargetOptions, 'backend'>> & HtmlTargetOptions;
    private readonly renderer: SvgRenderer;

    // Input plumbing. One InputManager per target — owns hover-chain
    // diffing, IsMouseOver / IsPressed, and routes pointer events into
    // the visual tree. The bound listeners below are stored so Dispose
    // can detach them cleanly.
    private readonly inputManager: InputManager = new InputManager();
    private readonly onPointerMove:  (e: PointerEvent) => void;
    private readonly onPointerDown:  (e: PointerEvent) => void;
    private readonly onPointerUp:    (e: PointerEvent) => void;
    private readonly onPointerLeave: (e: PointerEvent) => void;
    private readonly onPointerWheel: (e: WheelEvent)   => void;

    constructor(host: Element, options: HtmlTargetOptions = {})
    {
        super();
        this.host = host;
        this.options = { backend: 'svg', ...options };

        this.DeviceScale = options.devicePixelRatio ?? window.devicePixelRatio ?? 1;

        // Content box, not border box — the SVG mounts INSIDE the host's
        // padding edge, so any border / scrollbar width shouldn't widen
        // the surface. `clientWidth` / `clientHeight` give exactly that
        // in real browsers; jsdom returns 0 (no layout engine) so we
        // fall back to `getBoundingClientRect` for tests that patch the
        // bounding rect to drive layout.
        const cw = (host as HTMLElement).clientWidth;
        const ch = (host as HTMLElement).clientHeight;
        if (cw > 0 && ch > 0)
        {
            this.Width  = cw;
            this.Height = ch;
        }
        else
        {
            const rect = host.getBoundingClientRect();
            this.Width  = rect.width;
            this.Height = rect.height;
        }

        if (this.options.backend === 'svg')
        {
            this.surface = document.createElementNS(SVG_NS, 'svg');
            this.surface.style.display = 'block';
            this.surface.style.width = '100%';
            this.surface.style.height = '100%';
            // Mural surfaces present UI controls, not selectable
            // documents — disable native text selection so clicks +
            // drags don't trigger range selection on `<text>` nodes
            // (which would highlight button labels and steal pointer
            // focus mid-drag). Both the modern `user-select` and the
            // legacy WebKit prefix are set so Safari < 17 honours it.
            // Consumers building selectable surfaces (future text
            // editor / inspector) override this on the host element
            // they pass in.
            this.surface.style.userSelect = 'none';
            (this.surface.style as unknown as { webkitUserSelect: string })
                .webkitUserSelect = 'none';
            this.surface.setAttribute('width',  String(this.Width));
            this.surface.setAttribute('height', String(this.Height));
            host.appendChild(this.surface);
        }
        else
        {
            // Canvas backend lands with the CanvasRenderer in a later
            // step — for now reject so it fails loudly instead of
            // silently producing nothing.
            throw new Error("HtmlTarget: backend 'canvas' is not implemented yet (deferred to a later build-order step).");
        }

        this.resize_observer = new ResizeObserver(entries =>
        {
            // We only ever observe one element (the host), so the first
            // entry's contentRect is the new size.
            const entry = entries[0];
            if (entry === undefined) return;
            const { width, height } = entry.contentRect;
            this.Width = width;
            this.Height = height;
            this.surface.setAttribute('width',  String(width));
            this.surface.setAttribute('height', String(height));
        });
        this.resize_observer.observe(this.host);

        // PointerEvents listeners on the host. Using the host (not the
        // surface) keeps the listener set stable across re-renders
        // that swap the surface — and it makes leave detection work
        // for the whole content area instead of just the SVG node.
        this.onPointerMove  = (e) => this.handlePointer('move',  e);
        this.onPointerDown  = (e) => this.handlePointer('down',  e);
        this.onPointerUp    = (e) => this.handlePointer('up',    e);
        this.onPointerLeave = (e) => this.handlePointer('leave', e);
        this.onPointerWheel = (e) => this.handleWheel(e);
        this.host.addEventListener('pointermove',  this.onPointerMove  as EventListener);
        this.host.addEventListener('pointerdown',  this.onPointerDown  as EventListener);
        this.host.addEventListener('pointerup',    this.onPointerUp    as EventListener);
        this.host.addEventListener('pointerleave', this.onPointerLeave as EventListener);
        this.host.addEventListener('wheel',        this.onPointerWheel as EventListener);

        // SvgRenderer paints the visual tree into the SVG surface and
        // maintains DOM identity per visual across re-render passes.
        // The renderer is driven from Flush() below — every layout
        // flush triggers a paint that drains renderDirty + arrangeDirty.
        this.renderer = new SvgRenderer(this.surface, {
            document: this.host.ownerDocument ?? document,
        });
    }

    // Drive the renderer from the layout flush. Layout runs first
    // (super.Flush() resolves Measure / Arrange), then the renderer
    // walks the tree to paint everything that's render- or arrange-
    // dirty. Both Sets are cleared by the renderer after the walk.
    public override Flush(): void
    {
        super.Flush();
        // `as any` to reach the protected renderDirty Set without
        // adding a getter; the renderer is the only consumer that
        // needs raw access in v1. Adding a typed accessor is a
        // bigger refactor than the renderer wiring warrants.
        const renderDirty  = (this as unknown as { renderDirty: Set<Visual> }).renderDirty;
        const arrangeDirty = (this as unknown as { arrangeDirty: Set<Visual> }).arrangeDirty;
        this.renderer.Render(this.Content, this.OverlayRoot, renderDirty, arrangeDirty);
    }

    // Tear down DOM listeners and unmount the surface. Call before
    // discarding an HtmlTarget so the host element is left clean.
    public Dispose(): void
    {
        this.resize_observer.disconnect();
        this.host.removeEventListener('pointermove',  this.onPointerMove  as EventListener);
        this.host.removeEventListener('pointerdown',  this.onPointerDown  as EventListener);
        this.host.removeEventListener('pointerup',    this.onPointerUp    as EventListener);
        this.host.removeEventListener('pointerleave', this.onPointerLeave as EventListener);
        this.host.removeEventListener('wheel',        this.onPointerWheel as EventListener);
        this.renderer.Dispose();
        this.surface.remove();
    }

    // ── HitTest ────────────────────────────────────────────────────

    // SVG backend hit-test: ask the browser which DOM node sits at the
    // host coordinates, then climb to the nearest ancestor carrying a
    // VISUAL_BACKREF stamp from SvgDrawingContext. Returns undefined
    // if the pointer is outside the painted content or on a non-visual
    // DOM node (e.g., the host's chrome).
    public override HitTest(hostX: number, hostY: number): Visual | undefined
    {
        const rect = this.host.getBoundingClientRect();
        const clientX = rect.left + hostX;
        const clientY = rect.top  + hostY;
        // `elementsFromPoint` returns elements in front-to-back order;
        // the first one with a back-reference is the deepest painted
        // visual at that point.
        const stack = (this.host.ownerDocument ?? document)
            .elementsFromPoint(clientX, clientY);
        for (const el of stack)
        {
            for (let cur: Node | null = el; cur !== null; cur = cur.parentNode)
            {
                const back = (cur as unknown as BackrefHost)[VISUAL_BACKREF];
                if (back !== undefined) return back;
                if (cur === this.host) break;   // ran off the top of the host
            }
        }
        return undefined;
    }

    // ── Pointer adapters ───────────────────────────────────────────

    private handlePointer(
        phase: 'move' | 'down' | 'up' | 'leave',
        e: PointerEvent,
    ): void
    {
        const { hostX, hostY } = this.toHostCoords(e);
        const init = pointerInit(e, hostX, hostY);
        if (phase === 'leave')
        {
            this.inputManager.InjectPointerLeave(init);
            return;
        }
        const hit = this.HitTest(hostX, hostY);
        if (phase === 'down')
        {
            if (hit !== undefined) this.inputManager.InjectPointerDown(hit, init);
            return;
        }
        if (phase === 'up')
        {
            this.inputManager.InjectPointerUp(hit ?? null, init);
            return;
        }
        // move
        this.inputManager.InjectPointerMove(hit ?? null, init);
    }

    private handleWheel(e: WheelEvent): void
    {
        const { hostX, hostY } = this.toHostCoords(e);
        const hit = this.HitTest(hostX, hostY);
        if (hit === undefined) return;
        const init: WheelEventInit = {
            HostX:    hostX,
            HostY:    hostY,
            Button:   PointerButton.None,
            Buttons:  e.buttons,
            Modifiers: extractModifiers(e),
            PointerId: 0,
            Pressure:  0,
            PointerType: 'mouse',
            DeltaX:    e.deltaX,
            DeltaY:    e.deltaY,
            DeltaZ:    e.deltaZ,
            DeltaMode: wheelDeltaMode(e.deltaMode),
        };
        this.inputManager.InjectPointerWheel(hit, init);
    }

    // Convert client coordinates from a DOM event into the target's
    // content coordinate space (top-left of the host element = (0, 0)).
    // getBoundingClientRect reflects the host's current on-screen rect
    // INCLUDING any CSS transforms applied to ancestors, so this works
    // even when the surface is inside a scaled / translated container.
    private toHostCoords(e: { clientX: number; clientY: number }): { hostX: number; hostY: number }
    {
        const rect = this.host.getBoundingClientRect();
        return {
            hostX: e.clientX - rect.left,
            hostY: e.clientY - rect.top,
        };
    }

    // The host element passed to the constructor. Read-only access for
    // debugging and for event-routing code that needs to attach
    // listeners at the host root rather than the surface.
    public get Host(): Element { return this.host; }

    // Exposed for the renderer (when it lands) to walk the live mount
    // without going through getElementsByTagName or similar.
    public get Surface(): SVGSVGElement { return this.surface; }

    // Convenience for setting Content via constructor-style call,
    // matching the ergonomic example in the design doc:
    //   new HtmlTarget(host).Show(rootVisual);
    public Show(content: Visual): this
    {
        this.Content = content;
        return this;
    }
}
