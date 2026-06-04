import type { Visual } from './visual.js';
import { DragDrop, DragDropEffects, type DataObject, type DragDropOptions, type DragSession } from './drag-drop.js';

// Routed-event infrastructure.
//
// Mirrors the WPF model: an event raised at a target Visual walks the
// visual tree twice — first as a "preview" tunnel from the root down
// to the target, then as a bubble from the target back up to the root.
// On each hop the dispatcher calls a `protected` virtual on the Visual
// (`OnPreviewPointerDown`, `OnPointerDown`, …) and stops the walk once
// any handler sets `args.Handled = true`.
//
// Distinct from the WPF API in a couple of ways:
//
//   * Virtuals are the only consumer surface in phase 1 (no
//     `AddHandler` / per-instance event hookups). Controls override
//     `OnPointerX` to implement input behaviour; consumers compose
//     Controls rather than attaching delegate-style handlers in
//     mural source. Per-instance handler registration arrives with
//     phase 2's event-binding syntax.
//
//   * Args are concrete classes carrying everything the handler might
//     need. No `RoutedEvent` registry / EventManager indirection —
//     the virtual dispatch table on Visual is the registry.

// Lookup keyed onto the dispatch direction. Pre-baked here so the
// dispatcher and InputManager can compose tunnel + bubble without
// duplicating string lists.
export type RoutedEventKind =
    | 'PointerEnter'
    | 'PointerLeave'
    | 'PointerMove'
    | 'PointerDown'
    | 'PointerUp'
    | 'PointerWheel'
    | 'KeyDown'
    | 'KeyUp'
    | 'TextInput'
    | 'GotFocus'
    | 'LostFocus'
    | 'DragEnter'
    | 'DragLeave'
    | 'DragOver'
    | 'Drop';

// Base for everything dispatched through the tree walker.
//
// `Source` is where the event originated (the hit-tested leaf for
// pointer events; the focused element for keyboard later); `Visual`
// is the current Visual on the route during dispatch, swapped by the
// walker on each hop. `Handled` short-circuits both passes.
//
// `Strategy` records which pass is currently in flight so handlers
// can branch (rare, but matches WPF and is useful when the same On*
// implementation services both Preview and main events).
export class RoutedEventArgs
{
    public readonly Kind: RoutedEventKind;
    /** The leaf Visual the dispatcher resolved as the event target. */
    public readonly Source: Visual;
    /** The Visual currently receiving the event during dispatch. The
     *  walker rewrites this on each hop. */
    public Visual: Visual;
    /** Set to `true` by any handler to stop further dispatch on both
     *  the tunnel and bubble passes for this event. */
    public Handled: boolean = false;
    /** Discriminates the in-flight pass for handlers that share a
     *  single `On*` body across Preview and bubble. */
    public Strategy: 'tunnel' | 'bubble' = 'bubble';

    constructor(kind: RoutedEventKind, source: Visual)
    {
        this.Kind   = kind;
        this.Source = source;
        this.Visual = source;
    }
}

// ── Pointer events ─────────────────────────────────────────────────

// Mouse buttons follow the PointerEvent.button standard:
//   0 = primary (left), 1 = middle (wheel), 2 = secondary (right),
//   3 = X1 (back), 4 = X2 (forward).
// `None` is used for events that don't carry a button (move without
// drag, enter, leave).
export enum PointerButton
{
    None     = -1,
    Primary  = 0,
    Middle   = 1,
    Secondary = 2,
    X1       = 3,
    X2       = 4,
}

// Modifier mask matching the four standard keyboard modifiers; carried
// on every PointerEventArgs so handlers don't need a separate Keyboard
// query at handler time.
export interface ModifierKeys
{
    Shift:   boolean;
    Control: boolean;
    Alt:     boolean;
    Meta:    boolean;
}

export const NoModifiers: ModifierKeys = Object.freeze({
    Shift: false, Control: false, Alt: false, Meta: false,
});

export interface PointerEventInit
{
    /** Position in the host's coordinate space — `(0,0)` at the top-
     *  left of the PresentationTarget's content area. The dispatcher
     *  does NOT translate this into per-Visual local coordinates;
     *  handlers that need a Visual-relative position translate
     *  themselves using their layout offsets. */
    HostX:    number;
    HostY:    number;
    Button:   PointerButton;
    /** Bitmask of currently-pressed buttons, mirroring
     *  PointerEvent.buttons. Stable between Down and Up; useful for
     *  drag detection. */
    Buttons:  number;
    Modifiers: ModifierKeys;
    /** Browser PointerEvent.pointerId — distinguishes simultaneous
     *  contacts in multi-touch. `0` for synthetic events. */
    PointerId: number;
    /** Browser PointerEvent.pressure (0..1). `0.5` for non-pressure
     *  pointers, matching the spec default; `0` for synthetic. */
    Pressure: number;
    /** Discriminates input modalities. PointerEvent.pointerType. */
    PointerType: 'mouse' | 'pen' | 'touch' | 'unknown';
}

// Minimal capture surface exposed on PointerEventArgs. The InputManager
// implements both methods; passing it through as a structural type
// avoids the routed-event module importing the manager (the manager
// already imports this file).
export interface PointerCaptureSink
{
    CapturePointer(visual: Visual, pointerId?: number): void;
    ReleasePointerCapture(pointerId?: number): void;
}

// Focus sink — same back-channel pattern as PointerCaptureSink. Lets a
// handler (typically a TextBox's OnPointerDown) take focus during event
// dispatch without reaching for the host. The InputManager implements
// it; args carry the reference through so handlers can call
// `args.SetFocus(this)` ergonomically.
export interface FocusSink
{
    SetFocus(visual: Visual | undefined): void;
    GetFocusedVisual(): Visual | undefined;
}

// Concrete args type for the six pointer events. Carries everything a
// handler typically needs without forcing the handler to reach back
// into the device. Mutable `Handled` is on the base; everything else
// is read-only.
export class PointerEventArgs extends RoutedEventArgs
{
    public readonly HostX:       number;
    public readonly HostY:       number;
    public readonly Button:      PointerButton;
    public readonly Buttons:     number;
    public readonly Modifiers:   ModifierKeys;
    public readonly PointerId:   number;
    public readonly Pressure:    number;
    public readonly PointerType: PointerEventInit['PointerType'];

    // Optional capture + focus hooks. Populated by the InputManager
    // when it dispatches an event; undefined for synthetic events
    // constructed in tests that don't exercise capture or focus.
    // Handlers call CapturePointer / SetFocus below rather than touching
    // these directly.
    private readonly _captureSink: PointerCaptureSink | undefined;
    private readonly _focusSink:   FocusSink          | undefined;

    constructor(
        kind: RoutedEventKind,
        source: Visual,
        init: PointerEventInit,
        captureSink?: PointerCaptureSink,
        focusSink?:   FocusSink,
    )
    {
        super(kind, source);
        this.HostX       = init.HostX;
        this.HostY       = init.HostY;
        this.Button      = init.Button;
        this.Buttons     = init.Buttons;
        this.Modifiers   = init.Modifiers;
        this.PointerId   = init.PointerId;
        this.Pressure    = init.Pressure;
        this.PointerType = init.PointerType;
        this._captureSink = captureSink;
        this._focusSink   = focusSink;
    }

    // Capture every subsequent Move / Up for this pointer to `target`
    // (defaults to the event's Source Visual — the natural pick for a
    // thumb starting a drag). Capture auto-releases on the matching
    // PointerUp; long-lived captures call ReleasePointerCapture earlier.
    public CapturePointer(target?: Visual): void
    {
        this._captureSink?.CapturePointer(target ?? this.Source, this.PointerId);
    }

    public ReleasePointerCapture(): void
    {
        this._captureSink?.ReleasePointerCapture(this.PointerId);
    }

    // Take focus during event dispatch. Defaults to the event's Source
    // (the natural pick when a TextBox's OnPointerDown wants the click
    // to focus itself); pass `undefined` to clear focus. No-op when the
    // args were constructed without a focus sink (tests that don't
    // exercise focus).
    public SetFocus(target?: Visual): void
    {
        this._focusSink?.SetFocus(target ?? this.Source);
    }

    // Sugar for DragDrop.DoDragDrop(this.Source, data, effects, opts).
    // Authors call this from a PointerDown / PointerMove handler when
    // they want to start a drag without importing the static class.
    // Returns the same DragSession that DoDragDrop returns.
    public BeginDragDrop(
        data: DataObject,
        allowedEffects: DragDropEffects,
        opts?: DragDropOptions,
    ): DragSession
    {
        return DragDrop.DoDragDrop(this.Source, data, allowedEffects, opts);
    }
}

// ── Wheel events ───────────────────────────────────────────────────

// Granularity of wheel deltas, mirroring WheelEvent.deltaMode:
//   * 'pixel' — DeltaX/Y are in CSS pixels (most modern mice / trackpads)
//   * 'line'  — DeltaX/Y are in scroll lines (older mice on some OSes)
//   * 'page'  — DeltaX/Y are in pages (rare; Page Up / Page Down emulators)
// Handlers that need raw pixels apply a small multiplier based on this.
export type WheelDeltaMode = 'pixel' | 'line' | 'page';

export interface WheelEventInit extends PointerEventInit
{
    DeltaX:    number;
    DeltaY:    number;
    DeltaZ:    number;
    DeltaMode: WheelDeltaMode;
}

// PointerWheel args. Extends PointerEventArgs so existing handler
// surfaces accept it; the dispatcher tables route this through the
// PointerWheel slot. Handlers that override OnPointerWheel see the
// concrete WheelEventArgs and can read scroll deltas directly.
export class WheelEventArgs extends PointerEventArgs
{
    public readonly DeltaX:    number;
    public readonly DeltaY:    number;
    public readonly DeltaZ:    number;
    public readonly DeltaMode: WheelDeltaMode;

    constructor(
        source: Visual,
        init: WheelEventInit,
        captureSink?: PointerCaptureSink,
        focusSink?:   FocusSink,
    )
    {
        super('PointerWheel', source, init, captureSink, focusSink);
        this.DeltaX    = init.DeltaX;
        this.DeltaY    = init.DeltaY;
        this.DeltaZ    = init.DeltaZ;
        this.DeltaMode = init.DeltaMode;
    }
}

// ── Keyboard events ────────────────────────────────────────────────

// Raw key + modifier state for a single keydown / keyup. `Key` mirrors
// DOM KeyboardEvent.key — the logical character produced by the press
// (e.g. 'a', 'A', 'Shift', 'Enter', 'ArrowLeft'). `Code` mirrors
// KeyboardEvent.code — the physical key on the keyboard (e.g. 'KeyA',
// 'ShiftLeft', 'Enter'), invariant of the active keyboard layout. Most
// handlers want `Key`; keyboard-layout-sensitive controls (game input,
// Cmd-bindings on macOS where ⌘ + Z must hit the physical 'Z' regardless
// of layout) reach for `Code`.
export interface KeyEventInit
{
    Key:       string;
    Code:      string;
    Modifiers: ModifierKeys;
    /** True when the platform reports this as an auto-repeat
     *  (KeyboardEvent.repeat). Lets a TextBox swallow held-arrow drift
     *  to a single-line move when desired. */
    IsRepeat:  boolean;
}

export class KeyEventArgs extends RoutedEventArgs
{
    public readonly Key:       string;
    public readonly Code:      string;
    public readonly Modifiers: ModifierKeys;
    public readonly IsRepeat:  boolean;

    constructor(kind: 'KeyDown' | 'KeyUp', source: Visual, init: KeyEventInit)
    {
        super(kind, source);
        this.Key       = init.Key;
        this.Code      = init.Code;
        this.Modifiers = init.Modifiers;
        this.IsRepeat  = init.IsRepeat;
    }
}

// Text-input event. Distinct from KeyDown — fires AFTER the keydown
// pass for a printable character so handlers see the textual content
// (already composed by IME if present) without re-deriving it from
// (key + modifiers). Matches WPF's PreviewTextInput / TextInput pair.
export interface TextInputEventInit
{
    /** The committed text. Single character for normal typing; multi-
     *  character for IME composition commits and paste-style inputs. */
    Text: string;
}

export class TextInputEventArgs extends RoutedEventArgs
{
    public readonly Text: string;

    constructor(source: Visual, init: TextInputEventInit)
    {
        super('TextInput', source);
        this.Text = init.Text;
    }
}

// ── Focus events ───────────────────────────────────────────────────

// Fired when a Visual gains / loses keyboard focus. Bubble only — no
// preview pair (matching WPF's GotFocus / LostFocus RoutingStrategy).
// Source is the Visual whose IsFocused flipped.
export class FocusEventArgs extends RoutedEventArgs
{
    constructor(kind: 'GotFocus' | 'LostFocus', source: Visual)
    {
        super(kind, source);
    }
}

// ── Drag events ────────────────────────────────────────────────────

export interface DragEventInit
{
    HostX:           number;
    HostY:           number;
    Modifiers:       ModifierKeys;
    Data:            DataObject;
    AllowedEffects:  DragDropEffects;
}

// Per the spec § 5 — receivers handle DragOver and set args.Effect to a
// subset of AllowedEffects (default None). The framework reads Effect
// to drive cursor feedback and to decide whether Drop fires on
// pointer-up.
export class DragEventArgs extends RoutedEventArgs
{
    public readonly HostX:          number;
    public readonly HostY:          number;
    public readonly Modifiers:      ModifierKeys;
    public readonly Data:           DataObject;
    public readonly AllowedEffects: DragDropEffects;
    public          Effect:         DragDropEffects = DragDropEffects.None;

    constructor(
        kind: 'DragEnter' | 'DragLeave' | 'DragOver' | 'Drop',
        source: Visual,
        init: DragEventInit,
    )
    {
        super(kind, source);
        this.HostX          = init.HostX;
        this.HostY          = init.HostY;
        this.Modifiers      = init.Modifiers;
        this.Data           = init.Data;
        this.AllowedEffects = init.AllowedEffects;
    }
}

// ── Visual-side virtual surface ─────────────────────────────────────

// Names of the virtual methods the dispatcher invokes. Kept in one
// place so the dispatcher tables stay consistent with Visual's
// protected surface. Subclasses override the methods they care about;
// the default Visual implementations are no-ops.
//
// Note the asymmetry: Move / Down / Up / Wheel each have a tunnel
// (OnPreview*) and a bubble (On*) virtual; Enter / Leave have only
// the bubble virtual because direct events don't tunnel.
export interface PointerEventHandlers
{
    OnPointerEnter       (args: PointerEventArgs): void;
    OnPointerLeave       (args: PointerEventArgs): void;
    OnPreviewPointerMove (args: PointerEventArgs): void;
    OnPointerMove        (args: PointerEventArgs): void;
    OnPreviewPointerDown (args: PointerEventArgs): void;
    OnPointerDown        (args: PointerEventArgs): void;
    OnPreviewPointerUp   (args: PointerEventArgs): void;
    OnPointerUp          (args: PointerEventArgs): void;
    OnPreviewPointerWheel(args: WheelEventArgs): void;
    OnPointerWheel       (args: WheelEventArgs): void;
}

export interface KeyboardEventHandlers
{
    OnPreviewKeyDown   (args: KeyEventArgs): void;
    OnKeyDown          (args: KeyEventArgs): void;
    OnPreviewKeyUp     (args: KeyEventArgs): void;
    OnKeyUp            (args: KeyEventArgs): void;
    OnPreviewTextInput (args: TextInputEventArgs): void;
    OnTextInput        (args: TextInputEventArgs): void;
}

export interface FocusEventHandlers
{
    OnGotFocus  (args: FocusEventArgs): void;
    OnLostFocus (args: FocusEventArgs): void;
}

// Method-name tables consumed by the dispatcher. Indexed by event kind
// so the walker can pick the right virtual without a switch per event.
// `as const` so TS treats each tuple as the readonly literal pair —
// the dispatcher's `target[name]` call is exhaustive against
// PointerEventHandlers.
//
// PointerEnter / PointerLeave are NOT in these tables — they're
// dispatched via `dispatchPointerDirect` (no Preview pair, no route
// walk), matching WPF's MouseEnter / MouseLeave RoutingStrategy.Direct.
// The remaining four events tunnel + bubble.
// Tunnel/bubble pointer events only. PointerEnter / PointerLeave are
// direct (handled by POINTER_DIRECT_HANDLERS); the new keyboard / focus
// kinds aren't pointer events at all and have their own tables /
// dispatch functions, so they're excluded from this pointer-tier
// lookup. Listing the four explicitly is more maintainable than
// `Exclude<RoutedEventKind, …>` once non-pointer kinds joined the
// union.
type PointerTunnelBubbleKind = 'PointerMove' | 'PointerDown' | 'PointerUp' | 'PointerWheel';

export const POINTER_PREVIEW_HANDLERS: Readonly<Record<PointerTunnelBubbleKind, keyof PointerEventHandlers>> = {
    PointerMove:  'OnPreviewPointerMove',
    PointerDown:  'OnPreviewPointerDown',
    PointerUp:    'OnPreviewPointerUp',
    PointerWheel: 'OnPreviewPointerWheel',
} as const;

export const POINTER_BUBBLE_HANDLERS: Readonly<Record<PointerTunnelBubbleKind, keyof PointerEventHandlers>> = {
    PointerMove:  'OnPointerMove',
    PointerDown:  'OnPointerDown',
    PointerUp:    'OnPointerUp',
    PointerWheel: 'OnPointerWheel',
} as const;

export const POINTER_DIRECT_HANDLERS: Readonly<Record<'PointerEnter' | 'PointerLeave', keyof PointerEventHandlers>> = {
    PointerEnter: 'OnPointerEnter',
    PointerLeave: 'OnPointerLeave',
} as const;

// ── Drag-event Visual-side surface ──────────────────────────────────

export interface DragEventHandlers
{
    OnPreviewDragEnter(args: DragEventArgs): void;
    OnDragEnter       (args: DragEventArgs): void;
    OnPreviewDragLeave(args: DragEventArgs): void;
    OnDragLeave       (args: DragEventArgs): void;
    OnPreviewDragOver (args: DragEventArgs): void;
    OnDragOver        (args: DragEventArgs): void;
    OnPreviewDrop     (args: DragEventArgs): void;
    OnDrop            (args: DragEventArgs): void;
}

type DragTunnelBubbleKind = 'DragEnter' | 'DragLeave' | 'DragOver' | 'Drop';

export const DRAG_PREVIEW_HANDLERS: Readonly<Record<DragTunnelBubbleKind, keyof DragEventHandlers>> = {
    DragEnter:  'OnPreviewDragEnter',
    DragLeave:  'OnPreviewDragLeave',
    DragOver:   'OnPreviewDragOver',
    Drop:       'OnPreviewDrop',
} as const;

export const DRAG_BUBBLE_HANDLERS: Readonly<Record<DragTunnelBubbleKind, keyof DragEventHandlers>> = {
    DragEnter:  'OnDragEnter',
    DragLeave:  'OnDragLeave',
    DragOver:   'OnDragOver',
    Drop:       'OnDrop',
} as const;

// ── Dispatcher ──────────────────────────────────────────────────────

// Build the visual-tree route from a leaf Visual up to the root.
// Index 0 is the leaf (Source); the last entry has no visual parent.
// Used by the dispatcher in both directions: reversed for the tunnel
// pass, in-order for the bubble pass.
export function buildRoute(source: Visual): Visual[]
{
    const out: Visual[] = [source];
    // The walker needs the visual parent chain. Visual exposes
    // `visualParent` as `protected`, but the dispatcher lives outside
    // the class. The runtime uses a public companion `GetVisualParent`
    // (added in the Visual edit below) to keep the chain readable from
    // anywhere without weakening the OO surface.
    let cur: Visual | undefined = (source as VisualWithParentAccessor).GetVisualParent();
    while (cur !== undefined)
    {
        out.push(cur);
        cur = (cur as VisualWithParentAccessor).GetVisualParent();
    }
    return out;
}

// Local structural type so this file doesn't import the full Visual
// class (which would cycle). The runtime adds `GetVisualParent` to
// Visual; the dispatcher only relies on that one method.
interface VisualWithParentAccessor
{
    GetVisualParent(): Visual | undefined;
}

// Tunnel-then-bubble dispatch for Move / Down / Up / Wheel. Tunnel
// runs root → target calling `OnPreview*`; bubble runs target → root
// calling the matching `On*`. `args.Handled = true` at any hop stops
// the remainder of BOTH passes — a Preview handler can swallow an
// event before the bubble handler ever sees it.
//
// The dispatcher rewrites `args.Visual` on each hop so handlers see
// "self" without a separate parameter, and it sets `args.Strategy`
// to `'tunnel'` / `'bubble'` so a shared handler body can branch.
export function dispatchPointer(args: PointerEventArgs): void
{
    if (args.Kind !== 'PointerMove' && args.Kind !== 'PointerDown'
        && args.Kind !== 'PointerUp' && args.Kind !== 'PointerWheel')
    {
        throw new Error(
            `dispatchPointer: ${args.Kind} is not a tunnel/bubble pointer event` +
            ' — use dispatchPointerDirect / dispatchKey / dispatchTextInput / dispatchFocus instead');
    }
    const route       = buildRoute(args.Source);
    const previewName = POINTER_PREVIEW_HANDLERS[args.Kind];
    const bubbleName  = POINTER_BUBBLE_HANDLERS [args.Kind];

    // Tunnel: root → target.
    args.Strategy = 'tunnel';
    for (let i = route.length - 1; i >= 0; i--)
    {
        const v = route[i]!;
        args.Visual = v;
        const handler = (v as unknown as PointerEventHandlers)[previewName] as (a: PointerEventArgs) => void;
        handler.call(v, args);
        if (args.Handled) return;
    }

    // Bubble: target → root.
    args.Strategy = 'bubble';
    for (const v of route)
    {
        args.Visual = v;
        const handler = (v as unknown as PointerEventHandlers)[bubbleName] as (a: PointerEventArgs) => void;
        handler.call(v, args);
        if (args.Handled) return;
        fireRoutedListeners(v, args.Kind, args);
        if (args.Handled) return;
    }
}

// Direct-strategy dispatch for Enter / Leave: fires on the source
// only, no tunnel, no bubble. Matches WPF's MouseEnter / MouseLeave
// RoutingStrategy.Direct — IsMouseOver propagation up the ancestor
// chain is the InputManager's job, not the event walker's.
export function dispatchPointerDirect(args: PointerEventArgs): void
{
    if (args.Kind !== 'PointerEnter' && args.Kind !== 'PointerLeave')
    {
        throw new Error(
            'dispatchPointerDirect: only Enter / Leave are direct events; the rest go through dispatchPointer');
    }
    args.Strategy = 'bubble';   // single hop — "bubble" by convention
    args.Visual   = args.Source;
    const name    = POINTER_DIRECT_HANDLERS[args.Kind];
    const handler = (args.Source as unknown as PointerEventHandlers)[name] as (a: PointerEventArgs) => void;
    handler.call(args.Source, args);
    fireRoutedListeners(args.Source, args.Kind, args);
}

// Fire per-Visual instance listeners for the bubble-phase event. The
// dispatcher calls this on each node after invoking the virtual so
// declarative EventTriggers (PointerDown / KeyDown / GotFocus / …)
// fire alongside subclass-defined virtuals — without forcing those
// subclasses to call `super.OnPointerDown` to keep listeners alive.
// Duck-typed against the optional FireRoutedListeners method so this
// module doesn't import Visual (and create a cycle).
interface RoutedListenerHost
{
    FireRoutedListeners?(eventName: string, args: unknown): void;
}
function fireRoutedListeners(v: Visual, eventName: string, args: unknown): void
{
    (v as RoutedListenerHost).FireRoutedListeners?.(eventName, args);
}

// ── Keyboard dispatch ──────────────────────────────────────────────

// Tunnel-then-bubble dispatch for KeyDown / KeyUp. Same shape as
// dispatchPointer — the route is built from the source (the currently
// focused Visual when the InputManager is the caller), root → source
// for the Preview pass, source → root for the bubble pass. Setting
// `args.Handled = true` short-circuits both passes.
export function dispatchKey(args: KeyEventArgs): void
{
    const route       = buildRoute(args.Source);
    const previewName = args.Kind === 'KeyDown' ? 'OnPreviewKeyDown' : 'OnPreviewKeyUp';
    const bubbleName  = args.Kind === 'KeyDown' ? 'OnKeyDown'        : 'OnKeyUp';

    args.Strategy = 'tunnel';
    for (let i = route.length - 1; i >= 0; i--)
    {
        const v = route[i]!;
        args.Visual = v;
        const handler = (v as unknown as KeyboardEventHandlers)[previewName] as (a: KeyEventArgs) => void;
        handler.call(v, args);
        if (args.Handled) return;
    }

    args.Strategy = 'bubble';
    for (const v of route)
    {
        args.Visual = v;
        const handler = (v as unknown as KeyboardEventHandlers)[bubbleName] as (a: KeyEventArgs) => void;
        handler.call(v, args);
        if (args.Handled) return;
        fireRoutedListeners(v, args.Kind, args);
        if (args.Handled) return;
    }
}

// Tunnel-then-bubble dispatch for TextInput. Separate from KeyDown so
// a handler that wants only "textual" input (no arrow / function key
// chatter) can override OnTextInput and ignore OnKeyDown.
export function dispatchTextInput(args: TextInputEventArgs): void
{
    const route = buildRoute(args.Source);

    args.Strategy = 'tunnel';
    for (let i = route.length - 1; i >= 0; i--)
    {
        const v = route[i]!;
        args.Visual = v;
        (v as unknown as KeyboardEventHandlers).OnPreviewTextInput.call(v, args);
        if (args.Handled) return;
    }

    args.Strategy = 'bubble';
    for (const v of route)
    {
        args.Visual = v;
        (v as unknown as KeyboardEventHandlers).OnTextInput.call(v, args);
        if (args.Handled) return;
        fireRoutedListeners(v, 'TextInput', args);
        if (args.Handled) return;
    }
}

// Bubble dispatch for GotFocus / LostFocus. Matches WPF's GotFocus /
// LostFocus RoutingStrategy.Bubble — a parent Visual (e.g. a form
// container watching for any descendant focus change) can observe
// without each child wiring its own listener. No Preview pair; focus
// is a discrete event with no tunnel-stage opportunity to cancel.
export function dispatchFocus(args: FocusEventArgs): void
{
    const route = buildRoute(args.Source);
    args.Strategy = 'bubble';
    const name = args.Kind === 'GotFocus' ? 'OnGotFocus' : 'OnLostFocus';
    for (const v of route)
    {
        args.Visual = v;
        const handler = (v as unknown as FocusEventHandlers)[name] as (a: FocusEventArgs) => void;
        handler.call(v, args);
        if (args.Handled) return;
        fireRoutedListeners(v, args.Kind, args);
        if (args.Handled) return;
    }
}

// Tunnel-then-bubble dispatch for DragEnter / DragLeave / DragOver /
// Drop. Symmetric with dispatchPointer; uses the drag-specific
// handler tables. args.Handled = true at any hop stops both passes.
export function dispatchDrag(args: DragEventArgs): void
{
    if (args.Kind !== 'DragEnter' && args.Kind !== 'DragLeave'
        && args.Kind !== 'DragOver' && args.Kind !== 'Drop')
    {
        throw new Error(
            `dispatchDrag: ${args.Kind} is not a drag event` +
            ' — use dispatchPointer / dispatchKey / dispatchFocus instead');
    }
    const route       = buildRoute(args.Source);
    const previewName = DRAG_PREVIEW_HANDLERS[args.Kind];
    const bubbleName  = DRAG_BUBBLE_HANDLERS [args.Kind];

    args.Strategy = 'tunnel';
    for (let i = route.length - 1; i >= 0; i--)
    {
        const v = route[i]!;
        args.Visual = v;
        const handler = (v as unknown as DragEventHandlers)[previewName] as (a: DragEventArgs) => void;
        handler.call(v, args);
        if (args.Handled) return;
    }

    args.Strategy = 'bubble';
    for (const v of route)
    {
        args.Visual = v;
        const handler = (v as unknown as DragEventHandlers)[bubbleName] as (a: DragEventArgs) => void;
        handler.call(v, args);
        if (args.Handled) return;
        fireRoutedListeners(v, args.Kind, args);
        if (args.Handled) return;
    }
}
