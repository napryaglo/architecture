// WPF-parity mouse façade. `Mouse` is the static entry point
// (System.Windows.Input.Mouse); `MouseDevice` is the live-state object it
// reads (System.Windows.Input.MouseDevice).
//
// The device OWNS the live mouse state — button states, cursor position,
// the element directly under the cursor, and the capture target. The
// InputManager PUSHES updates into it on every pointer event (it's the
// only writer), and also registers itself so capture ACTIONS
// (`Mouse.Capture`) can flow back to whichever InputManager is driving
// the current interaction.

import { Point } from '../primitives.js';
import type { Element } from '../element.js';
import { ModifierKeys, type PointerEventInit } from '../routed-event.js';
import { MouseButton, MouseButtonState, CaptureMode } from './input-enums.js';

// DOM PointerEvent.buttons bitmask (mirrored in PointerEventInit.Buttons):
// 1 = left, 2 = right, 4 = middle, 8 = X1 (back), 16 = X2 (forward).
const BUTTON_BIT_LEFT   = 1;
const BUTTON_BIT_RIGHT  = 2;
const BUTTON_BIT_MIDDLE = 4;
const BUTTON_BIT_X1     = 8;
const BUTTON_BIT_X2     = 16;

// Minimal back-channel the device uses to drive capture into the
// InputManager that's currently feeding it. Declared here (not imported
// from framework) so visual-engine stays free of a framework dependency;
// the InputManager structurally satisfies it.
interface MouseCaptureSink
{
    CapturePointer(visual: Element, pointerId?: number, cursor?: string): void;
    ReleasePointerCapture(pointerId?: number): void;
}

export class MouseDevice
{
    private _left   = MouseButtonState.Released;
    private _right  = MouseButtonState.Released;
    private _middle = MouseButtonState.Released;
    private _x1     = MouseButtonState.Released;
    private _x2     = MouseButtonState.Released;

    private _x = 0;
    private _y = 0;
    private _modifiers = ModifierKeys.None;

    private _directlyOver: Element | undefined;
    private _captured:     Element | undefined;
    private _captureMode = CaptureMode.None;

    // The InputManager currently feeding this device. Set on every push;
    // used so `Capture` / `ReleaseCapture` reach the right manager.
    private _sink: MouseCaptureSink | undefined;

    public get LeftButton():   MouseButtonState { return this._left; }
    public get RightButton():  MouseButtonState { return this._right; }
    public get MiddleButton(): MouseButtonState { return this._middle; }
    public get XButton1():     MouseButtonState { return this._x1; }
    public get XButton2():     MouseButtonState { return this._x2; }

    public get Modifiers():    ModifierKeys        { return this._modifiers; }
    /** The element directly under the cursor (the leaf hit). */
    public get DirectlyOver(): Element | undefined { return this._directlyOver; }
    /** The element that has captured the mouse, or undefined. */
    public get Captured():     Element | undefined { return this._captured; }
    public get CaptureMode():  CaptureMode         { return this._captureMode; }

    public GetButtonState(button: MouseButton): MouseButtonState
    {
        switch (button)
        {
            case MouseButton.Left:     return this._left;
            case MouseButton.Right:    return this._right;
            case MouseButton.Middle:   return this._middle;
            case MouseButton.XButton1: return this._x1;
            case MouseButton.XButton2: return this._x2;
            default:                   return MouseButtonState.Released;
        }
    }

    // Cursor position in host coordinates, or relative to `relativeTo`'s
    // absolute top-left origin when supplied (WPF's
    // MouseDevice.GetPosition(IInputElement)).
    public GetPosition(relativeTo?: Element): Point
    {
        if (relativeTo === undefined) return new Point(this._x, this._y);
        const origin = absoluteOriginOf(relativeTo);
        return new Point(this._x - origin.x, this._y - origin.y);
    }

    // Capture the mouse to `element` (Mouse.Capture). Delegates to the
    // driving InputManager; no-op when no interaction has been seen yet
    // (no sink registered). `pointerId` defaults to the primary pointer.
    public Capture(element: Element | undefined, mode: CaptureMode = CaptureMode.Element, pointerId = 0): boolean
    {
        if (this._sink === undefined) return false;
        if (element === undefined || mode === CaptureMode.None)
        {
            this._sink.ReleasePointerCapture(pointerId);
            return true;
        }
        this._sink.CapturePointer(element, pointerId);
        return true;
    }

    // ── @internal — InputManager push surface ───────────────────────

    /** @internal */ public _attach(sink: MouseCaptureSink): void { this._sink = sink; }

    /** @internal — refresh position / modifiers / button states from a
     *  raw pointer event. */
    public _updateFromPointer(init: PointerEventInit): void
    {
        this._x = init.HostX;
        this._y = init.HostY;
        this._modifiers = init.Modifiers;
        const b = init.Buttons;
        this._left   = (b & BUTTON_BIT_LEFT)   ? MouseButtonState.Pressed : MouseButtonState.Released;
        this._right  = (b & BUTTON_BIT_RIGHT)  ? MouseButtonState.Pressed : MouseButtonState.Released;
        this._middle = (b & BUTTON_BIT_MIDDLE) ? MouseButtonState.Pressed : MouseButtonState.Released;
        this._x1     = (b & BUTTON_BIT_X1)     ? MouseButtonState.Pressed : MouseButtonState.Released;
        this._x2     = (b & BUTTON_BIT_X2)     ? MouseButtonState.Pressed : MouseButtonState.Released;
    }

    /** @internal */ public _setDirectlyOver(el: Element | undefined): void { this._directlyOver = el; }

    /** @internal */ public _setCaptured(el: Element | undefined, mode: CaptureMode): void
    {
        this._captured    = el;
        this._captureMode = el === undefined ? CaptureMode.None : mode;
    }
}

// Walk the visual-parent chain accumulating ArrangedRect offsets to the
// element's absolute top-left in host space. Mirrors the per-control
// `absoluteOriginOf` helpers; centralised here for GetPosition.
function absoluteOriginOf(el: Element): { x: number; y: number }
{
    let x = 0;
    let y = 0;
    let cur: Element | undefined = el;
    while (cur !== undefined)
    {
        x += cur.ArrangedRect.X;
        y += cur.ArrangedRect.Y;
        cur = cur.GetVisualParent() as Element | undefined;
    }
    return { x, y };
}

// Static façade — WPF System.Windows.Input.Mouse. Thin reader over the
// primary device plus the Capture action.
export class Mouse
{
    public static readonly PrimaryDevice = new MouseDevice();

    public static get LeftButton():   MouseButtonState { return Mouse.PrimaryDevice.LeftButton; }
    public static get RightButton():  MouseButtonState { return Mouse.PrimaryDevice.RightButton; }
    public static get MiddleButton(): MouseButtonState { return Mouse.PrimaryDevice.MiddleButton; }
    public static get XButton1():     MouseButtonState { return Mouse.PrimaryDevice.XButton1; }
    public static get XButton2():     MouseButtonState { return Mouse.PrimaryDevice.XButton2; }

    public static get DirectlyOver(): Element | undefined { return Mouse.PrimaryDevice.DirectlyOver; }
    public static get Captured():     Element | undefined { return Mouse.PrimaryDevice.Captured; }

    public static GetPosition(relativeTo?: Element): Point
    {
        return Mouse.PrimaryDevice.GetPosition(relativeTo);
    }

    public static Capture(element: Element | undefined, mode: CaptureMode = CaptureMode.Element): boolean
    {
        return Mouse.PrimaryDevice.Capture(element, mode);
    }
}
