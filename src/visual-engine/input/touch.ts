// WPF-parity touch façade (System.Windows.Input.Touch / TouchDevice).
// The device owns live state for the primary touch contact; the
// InputManager pushes updates from pointer events whose PointerType is
// 'touch'. Touch routed events (TouchDown/Up/Move + Preview) are promoted
// from the pointer pipeline. Multi-touch contacts are distinguished by
// PointerId (carried on the event args); this primary device reflects the
// most-recent contact — full per-contact tracking is a follow-up.

import { Point } from '../primitives.js';
import type { Element } from '../element.js';
import type { PointerEventInit } from '../routed-event.js';

interface CaptureSink
{
    CapturePointer(visual: Element, pointerId?: number, cursor?: string): void;
    ReleasePointerCapture(pointerId?: number): void;
}

export class TouchDevice
{
    private _x = 0;
    private _y = 0;
    private _id = 0;
    private _directlyOver: Element | undefined;
    private _captured:     Element | undefined;
    private _sink: CaptureSink | undefined;

    /** PointerId of the contact this device currently reflects. */
    public get Id():           number              { return this._id; }
    public get DirectlyOver(): Element | undefined { return this._directlyOver; }
    public get Captured():     Element | undefined { return this._captured; }

    public GetTouchPoint(relativeTo?: Element): Point
    {
        if (relativeTo === undefined) return new Point(this._x, this._y);
        const o = absoluteOriginOf(relativeTo);
        return new Point(this._x - o.x, this._y - o.y);
    }

    public Capture(element: Element | undefined, pointerId?: number): boolean
    {
        if (this._sink === undefined) return false;
        const id = pointerId ?? this._id;
        if (element === undefined) { this._sink.ReleasePointerCapture(id); return true; }
        this._sink.CapturePointer(element, id);
        return true;
    }

    /** @internal */ public _attach(sink: CaptureSink): void { this._sink = sink; }
    /** @internal */ public _updateFromPointer(init: PointerEventInit): void
    {
        this._x = init.HostX; this._y = init.HostY; this._id = init.PointerId;
    }
    /** @internal */ public _setDirectlyOver(el: Element | undefined): void { this._directlyOver = el; }
    /** @internal */ public _setCaptured(el: Element | undefined): void { this._captured = el; }
}

function absoluteOriginOf(el: Element): { x: number; y: number }
{
    let x = 0, y = 0;
    let cur: Element | undefined = el;
    while (cur !== undefined) { x += cur.ArrangedRect.X; y += cur.ArrangedRect.Y; cur = cur.GetVisualParent() as Element | undefined; }
    return { x, y };
}

export class Touch
{
    public static readonly PrimaryDevice = new TouchDevice();

    public static get DirectlyOver(): Element | undefined { return Touch.PrimaryDevice.DirectlyOver; }
    public static get Captured():     Element | undefined { return Touch.PrimaryDevice.Captured; }

    public static GetTouchPoint(relativeTo?: Element): Point { return Touch.PrimaryDevice.GetTouchPoint(relativeTo); }
    public static Capture(element: Element | undefined): boolean { return Touch.PrimaryDevice.Capture(element); }
}
