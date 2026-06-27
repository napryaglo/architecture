import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    NoModifiers,
    PointerButton,
    Stylus,
    Touch,
    Visual,
    type PointerEventInit,
} from '../../runtime/index.js';
import { Control, InputManager } from '../index.js';

function pen(overrides: Partial<PointerEventInit> = {}): PointerEventInit
{
    return {
        HostX: 0, HostY: 0, Button: PointerButton.Primary, Buttons: 1,
        Modifiers: NoModifiers, PointerId: 1, Pressure: 0.5, PointerType: 'pen',
        ...overrides,
    };
}

function touch(overrides: Partial<PointerEventInit> = {}): PointerEventInit
{
    return {
        HostX: 0, HostY: 0, Button: PointerButton.Primary, Buttons: 1,
        Modifiers: NoModifiers, PointerId: 7, Pressure: 0, PointerType: 'touch',
        ...overrides,
    };
}

class El extends Control { constructor() { super(); this.Focusable = true; } }
function on(el: El, name: string, fn: (a: unknown) => void): void { el.AddRoutedEventListener(name, fn); }

describe('Phase 5a — Stylus', () => {
    beforeEach(() => { Application.current = null; });

    test('pen PointerDown/Move/Up promote to StylusDown/Move/Up + update device', () => {
        const el = new El();
        const log: string[] = [];
        on(el, 'StylusDown', () => log.push('down'));
        on(el, 'StylusMove', () => log.push('move'));
        on(el, 'StylusUp',   () => log.push('up'));
        const im = new InputManager();
        im.InjectPointerDown(el, pen({ HostX: 10, HostY: 20, Pressure: 0.7 }));
        assert.equal(Stylus.DirectlyOver, el);
        assert.equal(Stylus.PrimaryDevice.Pressure, 0.7);
        assert.equal(Stylus.InAir, false);
        im.InjectPointerMove(el, pen({ HostX: 11, HostY: 21 }));
        im.InjectPointerUp(el, pen({ Buttons: 0 }));
        assert.deepEqual(log, ['down', 'move', 'up']);
        const p = Stylus.GetPosition();
        assert.equal(p.X, 0); // last Up was at 0,0
    });

    test('a pen move with no buttons reports InAir', () => {
        const el = new El();
        const im = new InputManager();
        im.InjectPointerMove(el, pen({ Buttons: 0 }));
        assert.equal(Stylus.InAir, true);
    });

    test('mouse pointer events do NOT raise stylus events', () => {
        const el = new El();
        let fired = 0;
        on(el, 'StylusDown', () => fired++);
        const im = new InputManager();
        im.InjectPointerDown(el, { ...pen(), PointerType: 'mouse' });
        assert.equal(fired, 0);
    });
});

describe('Phase 5b — Touch', () => {
    beforeEach(() => { Application.current = null; });

    test('touch PointerDown/Move/Up promote to TouchDown/Move/Up + update device', () => {
        const el = new El();
        const log: string[] = [];
        on(el, 'TouchDown', () => log.push('down'));
        on(el, 'TouchMove', () => log.push('move'));
        on(el, 'TouchUp',   () => log.push('up'));
        const im = new InputManager();
        im.InjectPointerDown(el, touch({ HostX: 30, HostY: 40, PointerId: 7 }));
        assert.equal(Touch.DirectlyOver, el);
        assert.equal(Touch.PrimaryDevice.Id, 7);
        im.InjectPointerMove(el, touch({ HostX: 31, HostY: 41 }));
        im.InjectPointerUp(el, touch({ Buttons: 0 }));
        assert.deepEqual(log, ['down', 'move', 'up']);
    });

    test('mouse pointer events do NOT raise touch events', () => {
        const el = new El();
        let fired = 0;
        on(el, 'TouchDown', () => fired++);
        const im = new InputManager();
        im.InjectPointerDown(el, { ...touch(), PointerType: 'mouse' });
        assert.equal(fired, 0);
    });
});
