// WPF-parity stylus façade (System.Windows.Input.Stylus / StylusDevice).
// The device owns live pen state; the InputManager pushes updates from
// pointer events whose PointerType is 'pen'. Stylus routed events
// (StylusDown/Up/Move + Preview) are promoted from the pointer pipeline.

import { Point } from '../primitives.js';
import type { Element } from '../element.js';
import { ModifierKeys, type PointerEventInit } from '../routed-event.js';
import { CaptureMode } from './input-enums.js';

interface CaptureSink
{
    CapturePointer(visual: Element, pointerId?: number, cursor?: string): void;
    ReleasePointerCapture(pointerId?: number): void;
}

export class StylusDevice
{
    private _x = 0;
    private _y = 0;
    private _pressure = 0;
    private _inAir = true;
    private _inverted = false;
    private _modifiers = ModifierKeys.None;
    private _directlyOver: Element | undefined;
    private _captured:     Element | undefined;
    private _captureMode = CaptureMode.None;
    private _sink: CaptureSink | undefined;

    /** True when the pen is detected but not in contact (hover). */
    public get InAir():        boolean             { return this._inAir; }
    /** True when the eraser end is active (not derivable from the DOM
     *  pointer model yet — always false until a host supplies it). */
    public get Inverted():     boolean             { return this._inverted; }
    public get Pressure():     number              { return this._pressure; }
    public get Modifiers():    ModifierKeys        { return this._modifiers; }
    public get DirectlyOver(): Element | undefined { return this._directlyOver; }
    public get Captured():     Element | undefined { return this._captured; }
    public get CaptureMode():  CaptureMode         { return this._captureMode; }

    public GetPosition(relativeTo?: Element): Point
    {
        if (relativeTo === undefined) return new Point(this._x, this._y);
        const o = absoluteOriginOf(relativeTo);
        return new Point(this._x - o.x, this._y - o.y);
    }

    public Capture(element: Element | undefined, mode: CaptureMode = CaptureMode.Element, pointerId = 0): boolean
    {
        if (this._sink === undefined) return false;
        if (element === undefined || mode === CaptureMode.None) { this._sink.ReleasePointerCapture(pointerId); return true; }
        this._sink.CapturePointer(element, pointerId);
        return true;
    }

    /** @internal */ public _attach(sink: CaptureSink): void { this._sink = sink; }
    /** @internal — `inContact` distinguishes Down/Move-with-contact from in-air move. */
    public _updateFromPointer(init: PointerEventInit, inContact: boolean): void
    {
        this._x = init.HostX; this._y = init.HostY;
        this._pressure = init.Pressure;
        this._modifiers = init.Modifiers;
        this._inAir = !inContact && init.Buttons === 0;
    }
    /** @internal */ public _setDirectlyOver(el: Element | undefined): void { this._directlyOver = el; }
    /** @internal */ public _setCaptured(el: Element | undefined, mode: CaptureMode): void
    {
        this._captured = el;
        this._captureMode = el === undefined ? CaptureMode.None : mode;
    }
}

function absoluteOriginOf(el: Element): { x: number; y: number }
{
    let x = 0, y = 0;
    let cur: Element | undefined = el;
    while (cur !== undefined) { x += cur.ArrangedRect.X; y += cur.ArrangedRect.Y; cur = cur.GetVisualParent() as Element | undefined; }
    return { x, y };
}

export class Stylus
{
    public static readonly PrimaryDevice = new StylusDevice();

    public static get InAir():        boolean             { return Stylus.PrimaryDevice.InAir; }
    public static get Inverted():     boolean             { return Stylus.PrimaryDevice.Inverted; }
    public static get DirectlyOver(): Element | undefined { return Stylus.PrimaryDevice.DirectlyOver; }
    public static get Captured():     Element | undefined { return Stylus.PrimaryDevice.Captured; }

    public static GetPosition(relativeTo?: Element): Point { return Stylus.PrimaryDevice.GetPosition(relativeTo); }
    public static Capture(element: Element | undefined, mode: CaptureMode = CaptureMode.Element): boolean
    {
        return Stylus.PrimaryDevice.Capture(element, mode);
    }
}
