import type { Element } from './element.js';
import { Key } from './input/key.js';
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
    // Button-specific mouse events (WPF parity). Derived by the
    // InputManager from a PointerDown / PointerUp whose Button is the
    // primary / secondary button; raised AFTER the generic event, with
    // their own tunnel (Preview) + bubble passes.
    | 'MouseLeftButtonDown'
    | 'MouseLeftButtonUp'
    | 'MouseRightButtonDown'
    | 'MouseRightButtonUp'
    // Mouse-capture events (WPF parity). Raised by the InputManager when
    // an element gains / loses pointer capture; tunnel (Preview) + bubble.
    | 'PreviewGotMouseCapture'
    | 'GotMouseCapture'
    | 'PreviewLostMouseCapture'
    | 'LostMouseCapture'
    | 'KeyDown'
    | 'KeyUp'
    | 'TextInput'
    | 'QueryCursor'
    | 'GotFocus'
    | 'LostFocus'
    // Keyboard-focus events (WPF parity). Distinct from the logical
    // GotFocus / LostFocus (bubble only): these tunnel (Preview) + bubble
    // and track the keyboard-focused element specifically.
    | 'PreviewGotKeyboardFocus'
    | 'GotKeyboardFocus'
    | 'PreviewLostKeyboardFocus'
    | 'LostKeyboardFocus'
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

// Which dispatch pass is in flight. Set on the args so a handler sharing one
// `On*` body across the Preview (tunnel) and main (bubble) routes can branch.
export enum RoutingStrategy
{
    Tunnel = 'tunnel',
    Bubble = 'bubble',
    /** Fires only on the source element — no tunnel, no bubble. WPF's
     *  RoutingStrategy.Direct (MouseEnter / MouseLeave, GotFocus /
     *  LostFocus are Direct in WPF; mural keeps focus on the bubble
     *  route, but Enter / Leave are genuinely Direct). */
    Direct = 'direct',
}

export class RoutedEventArgs
{
    public readonly Kind: RoutedEventKind;
    /** The leaf Element the dispatcher resolved as the event target. */
    public readonly Source: Element;
    /** The Element currently receiving the event during dispatch. The
     *  walker rewrites this on each hop. (Named `Visual` for the
     *  consumer-facing `args.Visual` API; typed `Element` since every
     *  routed node is an Element.) */
    public Visual: Element;
    /** Set to `true` by any handler to stop further dispatch on both
     *  the tunnel and bubble passes for this event. */
    public Handled: boolean = false;
    /** Discriminates the in-flight pass for handlers that share a
     *  single `On*` body across Preview and bubble. */
    public Strategy: RoutingStrategy = RoutingStrategy.Bubble;

    constructor(kind: RoutedEventKind, source: Element)
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

// WPF System.Windows.Input.ModifierKeys — [Flags]. Carried on every
// PointerEventArgs / KeyEventArgs so handlers don't need a separate
// Keyboard query at handler time. Numeric so modifiers compose with
// bitwise OR and test with `hasModifier`. `Windows` is the WPF name for
// the OS/Command key (DOM metaKey).
export enum ModifierKeys
{
    None    = 0,
    Alt     = 1 << 0,
    Control = 1 << 1,
    Shift   = 1 << 2,
    Windows = 1 << 3,
}

// `NoModifiers` retained as the canonical "nothing pressed" value
// (alias of ModifierKeys.None) so existing call sites keep reading.
export const NoModifiers: ModifierKeys = ModifierKeys.None;

// True when `mask` carries `flag`. The idiomatic read for the flags
// enum — replaces the old `modifiers.Shift` struct access.
export function hasModifier(mask: ModifierKeys, flag: ModifierKeys): boolean
{
    return (mask & flag) !== 0;
}

// Build a ModifierKeys mask from individual booleans. `meta` maps to
// `Windows` (DOM metaKey ≡ WPF Windows/Command). Convenience for host
// adapters building args from a DOM event and for tests.
export function toModifierKeys(
    parts: { shift?: boolean; control?: boolean; alt?: boolean; meta?: boolean },
): ModifierKeys
{
    let m = ModifierKeys.None;
    if (parts.shift)   m |= ModifierKeys.Shift;
    if (parts.control) m |= ModifierKeys.Control;
    if (parts.alt)     m |= ModifierKeys.Alt;
    if (parts.meta)    m |= ModifierKeys.Windows;
    return m;
}

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
    /** True when the host adapter has identified this PointerDown as
     *  the second press of a double-click sequence (same button, within
     *  the host's timing + distance threshold of the previous press).
     *  Synthetic events that don't supply the flag are treated as
     *  single clicks (`false`). MouseBinding's *DoubleClick variants
     *  match exclusively on this flag; the single-click variants
     *  ignore it (so both clicks of a double-click also fire a single-
     *  click binding — same dispatch shape as WPF's MouseDown). */
    IsDoubleClick?: boolean;
}

// Minimal capture surface exposed on PointerEventArgs. The InputManager
// implements both methods; passing it through as a structural type
// avoids the routed-event module importing the manager (the manager
// already imports this file).
export interface PointerCaptureSink
{
    CapturePointer(visual: Element, pointerId?: number, cursor?: string): void;
    ReleasePointerCapture(pointerId?: number): void;
}

// Focus sink — same back-channel pattern as PointerCaptureSink. Lets a
// handler (typically a TextBox's OnPointerDown) take focus during event
// dispatch without reaching for the host. The InputManager implements
// it; args carry the reference through so handlers can call
// `args.SetFocus(this)` ergonomically.
export interface FocusSink
{
    SetFocus(visual: Element | undefined): void;
    GetFocusedVisual(): Element | undefined;
}

// Concrete args type for the six pointer events. Carries everything a
// handler typically needs without forcing the handler to reach back
// into the device. Mutable `Handled` is on the base; everything else
// is read-only.
export class PointerEventArgs extends RoutedEventArgs
{
    public readonly HostX:         number;
    public readonly HostY:         number;
    public readonly Button:        PointerButton;
    public readonly Buttons:       number;
    public readonly Modifiers:     ModifierKeys;
    public readonly PointerId:     number;
    public readonly Pressure:      number;
    public readonly PointerType:   PointerEventInit['PointerType'];
    public readonly IsDoubleClick: boolean;

    // Optional capture + focus hooks. Populated by the InputManager
    // when it dispatches an event; undefined for synthetic events
    // constructed in tests that don't exercise capture or focus.
    // Handlers call CapturePointer / SetFocus below rather than touching
    // these directly.
    private readonly _captureSink: PointerCaptureSink | undefined;
    private readonly _focusSink:   FocusSink          | undefined;

    constructor(
        kind: RoutedEventKind,
        source: Element,
        init: PointerEventInit,
        captureSink?: PointerCaptureSink,
        focusSink?:   FocusSink,
    )
    {
        super(kind, source);
        this.HostX         = init.HostX;
        this.HostY         = init.HostY;
        this.Button        = init.Button;
        this.Buttons       = init.Buttons;
        this.Modifiers     = init.Modifiers;
        this.PointerId     = init.PointerId;
        this.Pressure      = init.Pressure;
        this.PointerType   = init.PointerType;
        this.IsDoubleClick = init.IsDoubleClick === true;
        this._captureSink = captureSink;
        this._focusSink   = focusSink;
    }

    // Capture every subsequent Move / Up for this pointer to `target`
    // (defaults to the event's Source Visual — the natural pick for a
    // thumb starting a drag). Capture auto-releases on the matching
    // PointerUp; long-lived captures call ReleasePointerCapture earlier.
    //
    // Optional `cursor` is a CSS cursor keyword the host should display
    // globally for the drag's duration. Set it for direction-aware
    // resize handles and splitter thumbs — without a host-level cursor
    // override the OS reverts to its default the moment the user
    // actually presses the button or the pointer leaves the source
    // visual. Auto-cleared with the capture.
    public CapturePointer(target?: Element, cursor?: string): void
    {
        this._captureSink?.CapturePointer(target ?? this.Source, this.PointerId, cursor);
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
    public SetFocus(target?: Element): void
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
export enum WheelDeltaMode
{
    Pixel = 'pixel',
    Line  = 'line',
    Page  = 'page',
}

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
        source: Element,
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

// Raw key + modifier state for a single keydown / keyup.
//
//   * `Key` — the WPF-style virtual `Key` enum (layout-independent
//     identity, e.g. `Key.S`, `Key.Left`, `Key.Return`). This is what
//     command handlers compare against. The host derives it from the DOM
//     event via `keyFromDom(code, key)`.
//   * `KeyText` — the LOGICAL character the press produced (DOM
//     KeyboardEvent.key: 'a', 'A', 'Enter', 'ArrowLeft'). Text-entry and
//     letter-accelerator handlers want this, not the virtual key.
//   * `Code` — the PHYSICAL key (DOM KeyboardEvent.code: 'KeyA',
//     'ShiftLeft', 'Enter'), invariant of the active layout. For
//     layout-sensitive controls (game input, ⌘+Z hitting physical Z).
export interface KeyEventInit
{
    Key:       Key;
    KeyText:   string;
    Code:      string;
    Modifiers: ModifierKeys;
    /** True when the platform reports this as an auto-repeat
     *  (KeyboardEvent.repeat). Lets a TextBox swallow held-arrow drift
     *  to a single-line move when desired. */
    IsRepeat:  boolean;
}

export class KeyEventArgs extends RoutedEventArgs
{
    public readonly Key:       Key;
    public readonly KeyText:   string;
    public readonly Code:      string;
    public readonly Modifiers: ModifierKeys;
    public readonly IsRepeat:  boolean;

    // Focus sink — same back-channel shape PointerEventArgs uses. Lets
    // handlers (typically a MenuItem's OnKeyDown moving focus to a
    // sibling on ArrowDown) transfer focus during event dispatch
    // without reaching for the host. The InputManager implements it
    // and passes itself in when constructing the args; synthetic
    // events from tests that don't drive focus leave it undefined.
    private readonly _focusSink: FocusSink | undefined;

    constructor(kind: 'KeyDown' | 'KeyUp', source: Element, init: KeyEventInit, focusSink?: FocusSink)
    {
        super(kind, source);
        this.Key       = init.Key;
        this.KeyText   = init.KeyText;
        this.Code      = init.Code;
        this.Modifiers = init.Modifiers;
        this.IsRepeat  = init.IsRepeat;
        this._focusSink = focusSink;
    }

    /** Transfer keyboard focus to `target` (or to `args.Source` when
     *  omitted). Silent no-op when the dispatcher didn't supply a
     *  focus sink (synthetic test events without an InputManager). */
    public SetFocus(target?: Element): void
    {
        this._focusSink?.SetFocus(target ?? this.Source);
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

    constructor(source: Element, init: TextInputEventInit)
    {
        super('TextInput', source);
        this.Text = init.Text;
    }
}

// ── QueryCursor ────────────────────────────────────────────────────

// Raised on each pointer move, bubbling target → root, so a handler can
// choose the cursor for the element under the pointer (WPF's QueryCursor).
// A handler sets `Cursor` to a CSS cursor keyword and marks `Handled` to
// claim it; the innermost handler wins (bubble stops on Handled). The
// resolved cursor is applied to the host by the InputManager.
export class QueryCursorEventArgs extends RoutedEventArgs
{
    public readonly HostX:     number;
    public readonly HostY:     number;
    public readonly Modifiers: ModifierKeys;
    /** CSS cursor keyword chosen by a handler ('pointer', 'text',
     *  'ew-resize', …). Undefined leaves the host default. */
    public Cursor: string | undefined;

    constructor(source: Element, init: PointerEventInit)
    {
        super('QueryCursor', source);
        this.HostX     = init.HostX;
        this.HostY     = init.HostY;
        this.Modifiers = init.Modifiers;
    }
}

export interface QueryCursorEventHandlers
{
    OnQueryCursor(args: QueryCursorEventArgs): void;
}

// ── Focus events ───────────────────────────────────────────────────

// Fired when a Visual gains / loses keyboard focus. Bubble only — no
// preview pair (matching WPF's GotFocus / LostFocus RoutingStrategy).
// Source is the Visual whose IsFocused flipped.
export class FocusEventArgs extends RoutedEventArgs
{
    constructor(
        kind: 'GotFocus' | 'LostFocus'
            | 'PreviewGotKeyboardFocus' | 'GotKeyboardFocus'
            | 'PreviewLostKeyboardFocus' | 'LostKeyboardFocus',
        source: Element,
    )
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
    /** The active drag session — receivers that need source-side
     *  hooks (OnFeedback / OnMove) or auto-scroll wiring (8.4) read
     *  this. May be `undefined` for synthesized events fired outside
     *  the InputManager's normal dispatch path (tests, some adapter
     *  edge cases). */
    Session?:        DragSession;
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
    public readonly Session:        DragSession | undefined;
    public          Effect:         DragDropEffects = DragDropEffects.None;

    constructor(
        kind: 'DragEnter' | 'DragLeave' | 'DragOver' | 'Drop',
        source: Element,
        init: DragEventInit,
    )
    {
        super(kind, source);
        this.HostX          = init.HostX;
        this.HostY          = init.HostY;
        this.Modifiers      = init.Modifiers;
        this.Data           = init.Data;
        this.AllowedEffects = init.AllowedEffects;
        this.Session        = init.Session;
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
    OnPreviewMouseLeftButtonDown (args: PointerEventArgs): void;
    OnMouseLeftButtonDown        (args: PointerEventArgs): void;
    OnPreviewMouseLeftButtonUp   (args: PointerEventArgs): void;
    OnMouseLeftButtonUp          (args: PointerEventArgs): void;
    OnPreviewMouseRightButtonDown(args: PointerEventArgs): void;
    OnMouseRightButtonDown       (args: PointerEventArgs): void;
    OnPreviewMouseRightButtonUp  (args: PointerEventArgs): void;
    OnMouseRightButtonUp         (args: PointerEventArgs): void;
    OnPreviewGotMouseCapture     (args: PointerEventArgs): void;
    OnGotMouseCapture            (args: PointerEventArgs): void;
    OnPreviewLostMouseCapture    (args: PointerEventArgs): void;
    OnLostMouseCapture           (args: PointerEventArgs): void;
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
    OnPreviewGotKeyboardFocus  (args: FocusEventArgs): void;
    OnGotKeyboardFocus         (args: FocusEventArgs): void;
    OnPreviewLostKeyboardFocus (args: FocusEventArgs): void;
    OnLostKeyboardFocus        (args: FocusEventArgs): void;
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
type PointerTunnelBubbleKind =
    | 'PointerMove' | 'PointerDown' | 'PointerUp' | 'PointerWheel'
    | 'MouseLeftButtonDown'  | 'MouseLeftButtonUp'
    | 'MouseRightButtonDown' | 'MouseRightButtonUp'
    | 'GotMouseCapture' | 'LostMouseCapture';

export const POINTER_PREVIEW_HANDLERS: Readonly<Record<PointerTunnelBubbleKind, keyof PointerEventHandlers>> = {
    PointerMove:  'OnPreviewPointerMove',
    PointerDown:  'OnPreviewPointerDown',
    PointerUp:    'OnPreviewPointerUp',
    PointerWheel: 'OnPreviewPointerWheel',
    MouseLeftButtonDown:  'OnPreviewMouseLeftButtonDown',
    MouseLeftButtonUp:    'OnPreviewMouseLeftButtonUp',
    MouseRightButtonDown: 'OnPreviewMouseRightButtonDown',
    MouseRightButtonUp:   'OnPreviewMouseRightButtonUp',
    GotMouseCapture:      'OnPreviewGotMouseCapture',
    LostMouseCapture:     'OnPreviewLostMouseCapture',
} as const;

export const POINTER_BUBBLE_HANDLERS: Readonly<Record<PointerTunnelBubbleKind, keyof PointerEventHandlers>> = {
    PointerMove:  'OnPointerMove',
    PointerDown:  'OnPointerDown',
    PointerUp:    'OnPointerUp',
    PointerWheel: 'OnPointerWheel',
    MouseLeftButtonDown:  'OnMouseLeftButtonDown',
    MouseLeftButtonUp:    'OnMouseLeftButtonUp',
    MouseRightButtonDown: 'OnMouseRightButtonDown',
    MouseRightButtonUp:   'OnMouseRightButtonUp',
    GotMouseCapture:      'OnGotMouseCapture',
    LostMouseCapture:     'OnLostMouseCapture',
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

// Build the visual-tree route from a leaf Element up to the root.
// Index 0 is the leaf (Source); the last entry has no visual parent.
// Used by the dispatcher in both directions: reversed for the tunnel
// pass, in-order for the bubble pass.
//
// `GetVisualParent` is a public companion to Visual's protected
// `visualParent` getter; it returns `Visual | undefined`, but every
// concrete tree node is an Element (Element is the only instantiable
// Visual subclass), so the cast to `Element` is sound.
export function buildRoute(source: Element): Element[]
{
    const out: Element[] = [source];
    let cur = source.GetVisualParent() as Element | undefined;
    while (cur !== undefined)
    {
        out.push(cur);
        cur = cur.GetVisualParent() as Element | undefined;
    }
    return out;
}

// Disabled-state gate. WPF parity: a disabled Element swallows input
// across its entire subtree, including Enter / Leave (so IsMouseOver
// stays false on disabled rows — the `when (not IsEnabled)` trigger
// then wins outright without trigger-ordering surgery against hover).
// Walks the route once; bails the dispatch if any node on the chain
// from source to root reports IsEnabled=false. Used by every dispatch*
// function below.
function routeSuppressedByDisabled(route: readonly Element[]): boolean
{
    for (const v of route)
    {
        if (v.IsEnabled === false) return true;
    }
    return false;
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
    if (!(args.Kind in POINTER_BUBBLE_HANDLERS))
    {
        throw new Error(
            `dispatchPointer: ${args.Kind} is not a tunnel/bubble pointer event` +
            ' — use dispatchPointerDirect / dispatchKey / dispatchTextInput / dispatchFocus instead');
    }
    const kind        = args.Kind as PointerTunnelBubbleKind;
    const route       = buildRoute(args.Source);
    if (routeSuppressedByDisabled(route)) return;
    const previewName = POINTER_PREVIEW_HANDLERS[kind];
    const bubbleName  = POINTER_BUBBLE_HANDLERS [kind];

    // Tunnel: root → target.
    args.Strategy = RoutingStrategy.Tunnel;
    for (let i = route.length - 1; i >= 0; i--)
    {
        const v = route[i]!;
        // Skip non-hit-testable visuals in the route. Browser's
        // pointer-events:none excludes a visual from elementsFromPoint
        // hits, but a descendant with its own explicit pointer-events
        // (own hit pad) still bubbles UP through the non-hit-testable
        // ancestor. That ancestor must stay invisible to routed events
        // — its own OnPreview/On handler must not fire, its routed
        // listeners must not fire, and its InputBindings must not
        // match. Otherwise a Figure used as a toolbox preview (with
        // IsHitTestVisible=false) still consumes PointerDown for its
        // own canvas drag-to-move logic and the enclosing tile's drag
        // latch never sees the event.
        if (!v.IsHitTestVisible) continue;
        args.Visual = v;
        const handler = (v as unknown as PointerEventHandlers)[previewName] as (a: PointerEventArgs) => void;
        handler.call(v, args);
        if (args.Handled) return;
    }

    // Bubble: target → root.
    args.Strategy = RoutingStrategy.Bubble;
    for (const v of route)
    {
        if (!v.IsHitTestVisible) continue;
        args.Visual = v;
        const handler = (v as unknown as PointerEventHandlers)[bubbleName] as (a: PointerEventArgs) => void;
        handler.call(v, args);
        if (args.Handled) return;
        fireRoutedListeners(v, args.Kind, args);
        if (args.Handled) return;
        // InputBindings consultation — per-instance then per-class.
        // A MouseBinding whose Gesture (LeftClick / LeftDoubleClick /
        // …) matches the args fires its Command and marks
        // args.Handled. Innermost binding wins because the bubble
        // walk goes source → root and stops on Handled. Bound only
        // for PointerDown (single-click + double-click sequences fire
        // on Down; PointerUp / Move don't activate gestures).
        if (args.Kind === 'PointerDown')
        {
            tryFireInputBindings(v, args);
            if (args.Handled) return;
        }
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
    // Disabled subtree gate — same semantics as dispatchPointer. We
    // build the route here only for the gate check; Enter / Leave still
    // fire only on the source, not along the chain. The reason to
    // suppress on a disabled subtree is so IsMouseOver doesn't flip on
    // a disabled row, which would let a hover trigger fight the
    // disabled-state opacity dim.
    if (routeSuppressedByDisabled(buildRoute(args.Source))) return;
    args.Strategy = RoutingStrategy.Direct;   // fires on the source only
    args.Visual   = args.Source;
    const name    = POINTER_DIRECT_HANDLERS[args.Kind];
    const handler = (args.Source as unknown as PointerEventHandlers)[name] as (a: PointerEventArgs) => void;
    handler.call(args.Source, args);
    fireRoutedListeners(args.Source, args.Kind, args);
}

// Fire per-Element instance listeners for the bubble-phase event. The
// dispatcher calls this on each node after invoking the virtual so
// declarative EventTriggers (PointerDown / KeyDown / GotFocus / …)
// fire alongside subclass-defined virtuals — without forcing those
// subclasses to call `super.OnPointerDown` to keep listeners alive.
function fireRoutedListeners(v: Element, eventName: string, args: unknown): void
{
    v.FireRoutedListeners(eventName, args);
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
    if (routeSuppressedByDisabled(route)) return;
    const previewName = args.Kind === 'KeyDown' ? 'OnPreviewKeyDown' : 'OnPreviewKeyUp';
    const bubbleName  = args.Kind === 'KeyDown' ? 'OnKeyDown'        : 'OnKeyUp';

    args.Strategy = RoutingStrategy.Tunnel;
    for (let i = route.length - 1; i >= 0; i--)
    {
        const v = route[i]!;
        args.Visual = v;
        const handler = (v as unknown as KeyboardEventHandlers)[previewName] as (a: KeyEventArgs) => void;
        handler.call(v, args);
        if (args.Handled) return;
    }

    args.Strategy = RoutingStrategy.Bubble;
    for (const v of route)
    {
        args.Visual = v;
        const handler = (v as unknown as KeyboardEventHandlers)[bubbleName] as (a: KeyEventArgs) => void;
        handler.call(v, args);
        if (args.Handled) return;
        fireRoutedListeners(v, args.Kind, args);
        if (args.Handled) return;
        // InputBindings consultation — per-instance then per-class. A
        // KeyBinding whose gesture matches the args fires its Command
        // and marks args.Handled. Innermost binding wins because we
        // walk source → root and stop on Handled. Bypassed for KeyUp
        // (KeyBindings only ever fire on KeyDown).
        if (args.Kind === 'KeyDown')
        {
            tryFireInputBindings(v, args);
            if (args.Handled) return;
        }
    }
}

// Indirection so this module doesn't import input-binding.ts directly
// (input-binding imports CommandManager which imports CommandBinding
// which imports Visual — a cycle if routed-event.ts joins the chain).
// Duck-typed against the function exported by input-binding.ts; the
// runtime wires it via setInputBindingDispatcher at module init.
// Accepts either KeyEventArgs (KeyDown path) or PointerEventArgs
// (PointerDown path) — input-binding.ts's matchesBinding dispatches
// on which fields are present.
let _inputBindingDispatcher:
    ((v: Element, args: KeyEventArgs | PointerEventArgs) => void) | undefined;

export function _setInputBindingDispatcher(
    fn: (v: Element, args: KeyEventArgs | PointerEventArgs) => void,
): void
{
    _inputBindingDispatcher = fn;
}

function tryFireInputBindings(v: Element, args: KeyEventArgs | PointerEventArgs): void
{
    _inputBindingDispatcher?.(v, args);
}

// Tunnel-then-bubble dispatch for TextInput. Separate from KeyDown so
// a handler that wants only "textual" input (no arrow / function key
// chatter) can override OnTextInput and ignore OnKeyDown.
export function dispatchTextInput(args: TextInputEventArgs): void
{
    const route = buildRoute(args.Source);
    if (routeSuppressedByDisabled(route)) return;

    args.Strategy = RoutingStrategy.Tunnel;
    for (let i = route.length - 1; i >= 0; i--)
    {
        const v = route[i]!;
        args.Visual = v;
        (v as unknown as KeyboardEventHandlers).OnPreviewTextInput.call(v, args);
        if (args.Handled) return;
    }

    args.Strategy = RoutingStrategy.Bubble;
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
    args.Strategy = RoutingStrategy.Bubble;
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

// Tunnel-then-bubble dispatch for the keyboard-focus events
// (Preview)GotKeyboardFocus / (Preview)LostKeyboardFocus. Symmetric with
// dispatchPointer's two-pass walk; matches WPF where keyboard-focus
// events tunnel then bubble (unlike the bubble-only GotFocus/LostFocus).
export function dispatchKeyboardFocus(args: FocusEventArgs): void
{
    const isGot = args.Kind === 'GotKeyboardFocus';
    const isLost = args.Kind === 'LostKeyboardFocus';
    if (!isGot && !isLost)
    {
        throw new Error(
            `dispatchKeyboardFocus: ${args.Kind} is not GotKeyboardFocus / LostKeyboardFocus`);
    }
    const previewKind = isGot ? 'PreviewGotKeyboardFocus' : 'PreviewLostKeyboardFocus';
    const previewName = isGot ? 'OnPreviewGotKeyboardFocus' : 'OnPreviewLostKeyboardFocus';
    const bubbleName  = isGot ? 'OnGotKeyboardFocus'        : 'OnLostKeyboardFocus';
    const route = buildRoute(args.Source);

    // Tunnel: root → target, firing the Preview virtual + its listeners.
    args.Strategy = RoutingStrategy.Tunnel;
    for (let i = route.length - 1; i >= 0; i--)
    {
        const v = route[i]!;
        args.Visual = v;
        const handler = (v as unknown as FocusEventHandlers)[previewName] as (a: FocusEventArgs) => void;
        handler.call(v, args);
        if (args.Handled) return;
        fireRoutedListeners(v, previewKind, args);
        if (args.Handled) return;
    }

    // Bubble: target → root.
    args.Strategy = RoutingStrategy.Bubble;
    for (const v of route)
    {
        args.Visual = v;
        const handler = (v as unknown as FocusEventHandlers)[bubbleName] as (a: FocusEventArgs) => void;
        handler.call(v, args);
        if (args.Handled) return;
        fireRoutedListeners(v, args.Kind, args);
        if (args.Handled) return;
    }
}

// Bubble dispatch for QueryCursor. Walks target → root; the first
// handler to mark Handled fixes the cursor. Returns the resolved CSS
// cursor keyword (or undefined when no handler claimed one). The
// InputManager applies the result to the host surface.
export function dispatchQueryCursor(args: QueryCursorEventArgs): string | undefined
{
    const route = buildRoute(args.Source);
    if (routeSuppressedByDisabled(route)) return undefined;
    args.Strategy = RoutingStrategy.Bubble;
    for (const v of route)
    {
        if (!v.IsHitTestVisible) continue;
        args.Visual = v;
        (v as unknown as QueryCursorEventHandlers).OnQueryCursor.call(v, args);
        if (args.Handled) return args.Cursor;
        fireRoutedListeners(v, 'QueryCursor', args);
        if (args.Handled) return args.Cursor;
    }
    return args.Cursor;
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
    if (routeSuppressedByDisabled(route)) return;
    const previewName = DRAG_PREVIEW_HANDLERS[args.Kind];
    const bubbleName  = DRAG_BUBBLE_HANDLERS [args.Kind];

    args.Strategy = RoutingStrategy.Tunnel;
    for (let i = route.length - 1; i >= 0; i--)
    {
        const v = route[i]!;
        args.Visual = v;
        const handler = (v as unknown as DragEventHandlers)[previewName] as (a: DragEventArgs) => void;
        handler.call(v, args);
        if (args.Handled) return;
    }

    args.Strategy = RoutingStrategy.Bubble;
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
