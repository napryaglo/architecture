import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from './test-app.js';

import { Application, NoModifiers, PointerButton, Rect, Size, type KeyEventInit, type PointerEventInit } from '../../runtime/index.js';
import { InputManager } from '../../framework/index.js';;
import { Thumb } from '../scroll/thumb.js';

function pointer(overrides: Partial<PointerEventInit> = {}): PointerEventInit
{
    return {
        HostX:       0,
        HostY:       0,
        Button:      PointerButton.Primary,
        Buttons:     1,
        Modifiers:   NoModifiers,
        PointerId:   0,
        Pressure:    0,
        PointerType: 'mouse',
        ...overrides,
    };
}

function key(k: string): KeyEventInit
{
    return {
        Key:       k,
        Code:      k,
        Modifiers: NoModifiers,
        IsRepeat:  false,
    };
}

function makeThumb(): Thumb
{
    const t = new Thumb();
    t.Measure(new Size(40, 16));
    t.Arrange(new Rect(0, 0, 40, 16));
    return t;
}

describe('Thumb — defaults', () => {
    beforeEach(() => { initTestApp(); });

    test('IsDragging defaults to false', () => {
        const t = new Thumb();
        assert.equal(t.IsDragging, false);
    });

    test('Cursor default is undefined (subclasses set their own)', () => {
        const t = new Thumb();
        assert.equal(t.Cursor, undefined);
    });

    test('Focusable so keyboard nudges and Esc reach the thumb', () => {
        const t = new Thumb();
        assert.equal(t.Focusable, true);
    });
});

describe('Thumb — drag lifecycle', () => {
    beforeEach(() => { initTestApp(); });

    test('PointerDown fires DragStarted with the press offset INSIDE the thumb', () => {
        const t = makeThumb();
        const im = new InputManager();
        let started: { HorizontalOffset: number; VerticalOffset: number } | undefined;
        t.AddDragStartedListener(args => { started = { HorizontalOffset: args.HorizontalOffset, VerticalOffset: args.VerticalOffset }; });

        im.InjectPointerDown(t, pointer({ HostX: 10, HostY: 4 }));
        assert.equal(t.IsDragging, true);
        assert.ok(started);
        assert.equal(started!.HorizontalOffset, 10);
        assert.equal(started!.VerticalOffset, 4);
        im.InjectPointerUp(t, pointer({ HostX: 10, HostY: 4 }));
    });

    test('PointerMove fires DragDelta with INCREMENTAL change since the previous sample', () => {
        const t = makeThumb();
        const im = new InputManager();
        const deltas: Array<{ dx: number; dy: number }> = [];
        t.AddDragDeltaListener(args => deltas.push({ dx: args.HorizontalChange, dy: args.VerticalChange }));

        im.InjectPointerDown(t, pointer({ HostX: 0, HostY: 0 }));
        im.InjectPointerMove(t, pointer({ HostX: 10, HostY: 0 }));
        im.InjectPointerMove(t, pointer({ HostX: 25, HostY: 3 }));
        im.InjectPointerUp(t,   pointer({ HostX: 25, HostY: 3 }));

        // Each Delta is the change SINCE the previous sample, not the total.
        assert.deepEqual(deltas, [
            { dx: 10, dy: 0 },
            { dx: 15, dy: 3 },
        ]);
    });

    test('PointerUp fires DragCompleted with TOTAL delta and Canceled=false', () => {
        const t = makeThumb();
        const im = new InputManager();
        let completed: { dx: number; dy: number; canceled: boolean } | undefined;
        t.AddDragCompletedListener(args => { completed = { dx: args.HorizontalChange, dy: args.VerticalChange, canceled: args.Canceled }; });

        im.InjectPointerDown(t, pointer({ HostX: 5, HostY: 2 }));
        im.InjectPointerMove(t, pointer({ HostX: 30, HostY: 8 }));
        im.InjectPointerUp(t,   pointer({ HostX: 35, HostY: 10 }));

        assert.equal(t.IsDragging, false);
        assert.ok(completed);
        assert.equal(completed!.dx, 30);    // 35 - 5
        assert.equal(completed!.dy, 8);     // 10 - 2
        assert.equal(completed!.canceled, false);
    });

    test('CancelDrag fires DragCompleted with Canceled=true and clears IsDragging', () => {
        const t = makeThumb();
        const im = new InputManager();
        let completed: { canceled: boolean } | undefined;
        t.AddDragCompletedListener(args => { completed = { canceled: args.Canceled }; });

        im.InjectPointerDown(t, pointer({ HostX: 0, HostY: 0 }));
        im.InjectPointerMove(t, pointer({ HostX: 12, HostY: 0 }));
        t.CancelDrag();

        assert.equal(t.IsDragging, false);
        assert.ok(completed);
        assert.equal(completed!.canceled, true);
    });

    test('Escape during drag triggers CancelDrag (Canceled=true)', () => {
        const t = makeThumb();
        const im = new InputManager();
        let completed: { canceled: boolean } | undefined;
        t.AddDragCompletedListener(args => { completed = { canceled: args.Canceled }; });

        im.InjectPointerDown(t, pointer({ HostX: 0, HostY: 0 }));
        // Pointer capture transfers focus implicitly via SetFocus on
        // OnPointerDown — but the headless InputManager wires focus
        // through its own focusedVisual store, so set it explicitly so
        // InjectKeyDown has a routing target.
        im.SetFocus(t);
        im.InjectKeyDown(key('Escape'));
        assert.equal(t.IsDragging, false);
        assert.ok(completed);
        assert.equal(completed!.canceled, true);
    });

    test('Move samples with zero change do NOT fire DragDelta', () => {
        const t = makeThumb();
        const im = new InputManager();
        const deltas: Array<{ dx: number; dy: number }> = [];
        t.AddDragDeltaListener(args => deltas.push({ dx: args.HorizontalChange, dy: args.VerticalChange }));

        im.InjectPointerDown(t, pointer({ HostX: 0, HostY: 0 }));
        im.InjectPointerMove(t, pointer({ HostX: 0, HostY: 0 }));   // same point — no delta
        im.InjectPointerUp(t,   pointer({ HostX: 0, HostY: 0 }));

        assert.equal(deltas.length, 0);
    });

    test('Listener add/remove balance is symmetric', () => {
        const t = makeThumb();
        const im = new InputManager();
        let count = 0;
        const cb = (): void => { count++; };
        t.AddDragDeltaListener(cb);
        im.InjectPointerDown(t, pointer({ HostX: 0, HostY: 0 }));
        im.InjectPointerMove(t, pointer({ HostX: 5, HostY: 0 }));
        assert.equal(count, 1);
        t.RemoveDragDeltaListener(cb);
        im.InjectPointerMove(t, pointer({ HostX: 10, HostY: 0 }));
        assert.equal(count, 1, 'removed listener must not fire');
        im.InjectPointerUp(t, pointer({ HostX: 10, HostY: 0 }));
    });
});
