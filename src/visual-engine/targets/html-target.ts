import type { Visual } from '../../runtime/index.js';
import {
    AnimationManager,
    ManualClock,
    PointerButton,
    type KeyEventInit,
    type PointerEventInit,
    type WheelEventInit,
    type WheelDeltaMode,
    type ModifierKeys,
} from '../../runtime/index.js';
import { CanvasTextMeasurer } from '../canvas-text-measurer.js';
import { PresentationTarget } from '../presentation-target.js';
import { RafClock } from '../raf-clock.js';
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

// "Printable" = produces a single character ready to insert into the
// document — excludes modifier keys ('Shift', 'Control', …), navigation
// ('ArrowLeft', 'Home'), editing ('Backspace', 'Delete'), function keys
// ('F1'), and anything else whose `key` string is longer than one
// glyph. Also gates out Ctrl/Meta chords (Ctrl+C, ⌘+V) so the chord
// reaches OnKeyDown as a single command instead of leaking through as
// stray text input. Alt+letter combinations DO flow through (matches
// macOS option-key special characters); a TextBox that wants to
// suppress them can filter in OnTextInput.
function isPrintableKey(e: KeyboardEvent): boolean
{
    if (e.ctrlKey || e.metaKey) return false;
    if (e.key.length !== 1)     return false;
    return true;
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

    // Input plumbing. The InputManager owning hover-chain diffing,
    // IsMouseOver / IsPressed, pointer capture AND keyboard focus
    // lives on the base PresentationTarget — accessed below as
    // `this.InputManager`. The bound listeners below are stored so
    // Dispose can detach them cleanly.
    private readonly onPointerMove:  (e: PointerEvent) => void;
    private readonly onPointerDown:  (e: PointerEvent) => void;
    private readonly onPointerUp:    (e: PointerEvent) => void;
    private readonly onPointerLeave: (e: PointerEvent) => void;
    private readonly onPointerWheel: (e: WheelEvent)   => void;
    private readonly onKeyDown:      (e: KeyboardEvent) => void;
    private readonly onKeyUp:        (e: KeyboardEvent) => void;

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

        // Make the host element programmatically focusable so it can
        // receive keyboard events. tabindex=0 also puts it in the
        // natural Tab order so users can Tab into a mural surface from
        // surrounding page chrome. Consumers that want different Tab
        // semantics override the attribute on the host element AFTER
        // construction — we only set it when the consumer hasn't.
        //
        // We deliberately do NOT set tabindex on the inner <svg>
        // surface: leaving SVG and its children unfocusable means a
        // click inside the surface won't compete with the host for the
        // browser's "transfer focus on click" walk. Instead we call
        // host.focus() explicitly on every pointer-down (see
        // handlePointer) so DOM focus follows wherever the user
        // clicked. Without that explicit focus call, keydown events
        // would fire on document.body (the previously-focused element)
        // and never reach our host-level listener.
        if (!(host as HTMLElement).hasAttribute('tabindex'))
        {
            (host as HTMLElement).tabIndex = 0;
        }
        // Drop the dotted focus ring the browser draws by default —
        // mural controls render their own focus visuals.
        (host as HTMLElement).style.outline = 'none';

        // PointerEvents listeners on the host. Using the host (not the
        // surface) keeps the listener set stable across re-renders
        // that swap the surface — and it makes leave detection work
        // for the whole content area instead of just the SVG node.
        this.onPointerMove  = (e) => this.handlePointer('move',  e);
        this.onPointerDown  = (e) => this.handlePointer('down',  e);
        this.onPointerUp    = (e) => this.handlePointer('up',    e);
        this.onPointerLeave = (e) => this.handlePointer('leave', e);
        this.onPointerWheel = (e) => this.handleWheel(e);
        this.onKeyDown      = (e) => this.handleKey('down', e);
        this.onKeyUp        = (e) => this.handleKey('up',   e);
        this.host.addEventListener('pointermove',  this.onPointerMove  as EventListener);
        this.host.addEventListener('pointerdown',  this.onPointerDown  as EventListener);
        this.host.addEventListener('pointerup',    this.onPointerUp    as EventListener);
        this.host.addEventListener('pointerleave', this.onPointerLeave as EventListener);
        this.host.addEventListener('wheel',        this.onPointerWheel as EventListener);
        this.host.addEventListener('keydown',      this.onKeyDown      as EventListener);
        this.host.addEventListener('keyup',        this.onKeyUp        as EventListener);

        // SvgRenderer paints the visual tree into the SVG surface and
        // maintains DOM identity per visual across re-render passes.
        // The renderer is driven from Flush() below — every layout
        // flush triggers a paint that drains renderDirty + arrangeDirty.
        this.renderer = new SvgRenderer(this.surface, {
            document: this.host.ownerDocument ?? document,
        });

        // Swap the base-class default (ApproximateTextMeasurer) for the
        // Canvas-backed measurer. Canvas 2D's measureText uses the same
        // browser font engine the SVG renderer paints with, so widths
        // line up closely with the painted glyphs while taking only a
        // few microseconds per call — fast enough to re-measure the
        // whole TextBox on every keystroke.
        //
        // SvgTextMeasurer (using `<text>.getSubStringLength`) gives
        // pixel-exact widths because it IS the renderer, but each call
        // forces a synchronous layout flush — for a multi-line TextBox
        // that turns every keystroke into hundreds of layouts and a
        // visibly stuttery editor. The export stays available for
        // consumers who need exact accuracy and aren't doing live
        // editing.
        //
        // Consumers wanting FontMetricsMeasurer (PDF / Node parity,
        // off-screen rendering) overwrite TextMeasurer after
        // construction and pair it with a LoadFont call.
        try
        {
            this.TextMeasurer = new CanvasTextMeasurer(this.host.ownerDocument ?? document);
        }
        catch
        {
            // Canvas 2D unavailable. Stick with the approximate
            // measurer rather than failing construction.
        }

        // Animation engine ticks against AnimationManager.Instance.Clock.
        // The default ManualClock is great for tests but goes nowhere on
        // its own; a browser host expects rAF. Swap in a RafClock IFF the
        // current clock is still the default ManualClock — never stomp a
        // clock the consumer (or an earlier HtmlTarget in a multi-target
        // app) has already installed. Two HtmlTargets in one app share
        // the same RafClock instance and the same animation tick, which
        // is what we want — multiple surfaces, one frame loop.
        if (AnimationManager.Instance.Clock instanceof ManualClock)
        {
            AnimationManager.Instance.Clock = new RafClock();
        }
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
        this.host.removeEventListener('keydown',      this.onKeyDown      as EventListener);
        this.host.removeEventListener('keyup',        this.onKeyUp        as EventListener);
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
            this.InputManager.InjectPointerLeave(init);
            return;
        }
        const hit = this.HitTest(hostX, hostY);
        if (phase === 'down')
        {
            // Transfer DOM focus to the host so subsequent keydown /
            // keyup events fire on it (and reach our host-level
            // listener through normal bubble). Clicking inside the SVG
            // surface doesn't auto-focus the host — SVG descendants
            // aren't focusable, so the browser leaves focus wherever
            // it was (usually document.body), and keydowns would never
            // reach this target without this explicit call. The
            // `preventScroll` option keeps the page from jumping in
            // case the host happens to be outside the viewport.
            (this.host as HTMLElement).focus({ preventScroll: true });
            if (hit !== undefined) this.InputManager.InjectPointerDown(hit, init);
            return;
        }
        if (phase === 'up')
        {
            this.InputManager.InjectPointerUp(hit ?? null, init);
            return;
        }
        // move
        this.InputManager.InjectPointerMove(hit ?? null, init);
    }

    // Keyboard dispatch. KeyDown / KeyUp route to the InputManager's
    // focused Visual. For KeyDown, if the key is a printable character
    // that isn't part of a Ctrl/Meta chord, we also synthesise a
    // TextInput event right after — matches WPF's KeyDown → TextInput
    // ordering and means a TextBox can subscribe just to OnTextInput
    // for character insertion while leaving OnKeyDown for editing
    // commands (arrows, Backspace, Delete, …).
    //
    // preventDefault is called when the focused Visual handled the
    // event — that's how we suppress the browser's page-scroll on
    // Space / arrow keys, tab navigation when AcceptsTab is true, and
    // the like, without globally swallowing every key on a focused
    // mural surface.
    private handleKey(phase: 'down' | 'up', e: KeyboardEvent): void
    {
        const init: KeyEventInit = {
            Key:       e.key,
            Code:      e.code,
            Modifiers: extractModifiers(e),
            IsRepeat:  e.repeat,
        };
        let handled = phase === 'down'
            ? this.InputManager.InjectKeyDown(init)
            : this.InputManager.InjectKeyUp(init);

        if (phase === 'down' && isPrintableKey(e))
        {
            // Synthesise the TextInput pass for normal typing. IME
            // composition would normally route through compositionend /
            // beforeinput on a contenteditable element; v1 mural surfaces
            // aren't contenteditable, so dead keys / IME composes degrade
            // to whatever `e.key` produces. That's good enough for ASCII
            // typing today; a follow-up can layer a hidden contenteditable
            // proxy for full IME support.
            const tiHandled = this.InputManager.InjectTextInput({ Text: e.key });
            handled = handled || tiHandled;
        }

        if (handled) e.preventDefault();
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
        this.InputManager.InjectPointerWheel(hit, init);
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
