import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    CaptureMode,
    FocusManager,
    Key,
    Keyboard,
    KeyStates,
    ModifierKeys,
    Mouse,
    MouseButtonState,
    NoModifiers,
    PointerButton,
    type KeyEventInit,
    type PointerEventInit,
} from '../../runtime/index.js';
import { Control, InputManager } from '../index.js';

function key(overrides: Partial<KeyEventInit> = {}): KeyEventInit
{
    return { Key: Key.A, KeyText: 'a', Code: 'KeyA', Modifiers: NoModifiers, IsRepeat: false, ...overrides };
}

function pointer(overrides: Partial<PointerEventInit> = {}): PointerEventInit
{
    return {
        HostX: 0, HostY: 0,
        Button: PointerButton.Primary, Buttons: 1,
        Modifiers: NoModifiers, PointerId: 0, Pressure: 0,
        PointerType: 'mouse',
        ...overrides,
    };
}

class Focusable extends Control
{
    constructor() { super(); this.Focusable = true; }
}

describe('Keyboard device façade', () => {
    beforeEach(() => { Application.current = null; });

    test('Modifiers + key-down set reflect the latest key event', () => {
        const im = new InputManager();
        im.InjectKeyDown(key({ Key: Key.S, Code: 'KeyS', Modifiers: ModifierKeys.Control }));
        assert.equal(Keyboard.Modifiers, ModifierKeys.Control);
        assert.equal(Keyboard.IsKeyDown(Key.S), true);
        assert.equal(Keyboard.IsKeyUp(Key.S), false);
        assert.equal(Keyboard.GetKeyStates(Key.S), KeyStates.Down);

        im.InjectKeyUp(key({ Key: Key.S, Code: 'KeyS', Modifiers: ModifierKeys.None }));
        assert.equal(Keyboard.IsKeyDown(Key.S), false);
        assert.equal(Keyboard.GetKeyStates(Key.S), KeyStates.None);
        assert.equal(Keyboard.Modifiers, ModifierKeys.None);
    });

    test('FocusedElement tracks InputManager focus; FocusManager mirrors it', () => {
        const a = new Focusable();
        const im = new InputManager();
        im.SetFocus(a);
        assert.equal(Keyboard.FocusedElement, a);
        assert.equal(FocusManager.GetFocusedElement(), a);

        im.SetFocus(undefined);
        assert.equal(Keyboard.FocusedElement, undefined);
    });

    test('Keyboard.Focus delegates to Element.Focus (no-op without a target, no throw)', () => {
        // Keyboard.Focus → element.Focus() → target.SetFocus. With no
        // attached target the redirect is a silent no-op (the redirect
        // itself is covered by Element focus tests); assert it doesn't
        // throw and leaves focus unchanged.
        const a = new Focusable();
        assert.doesNotThrow(() => Keyboard.Focus(a));
        assert.equal(Keyboard.FocusedElement, undefined);
    });
});

describe('Mouse device façade', () => {
    beforeEach(() => { Application.current = null; });

    test('Button states derive from the pointer Buttons bitmask', () => {
        const root = new Focusable();
        const im = new InputManager();
        im.InjectPointerDown(root, pointer({ Buttons: 1 }));     // left
        assert.equal(Mouse.LeftButton, MouseButtonState.Pressed);
        assert.equal(Mouse.RightButton, MouseButtonState.Released);

        im.InjectPointerUp(root, pointer({ Buttons: 0 }));
        assert.equal(Mouse.LeftButton, MouseButtonState.Released);

        im.InjectPointerDown(root, pointer({ Buttons: 2 }));     // right
        assert.equal(Mouse.RightButton, MouseButtonState.Pressed);
        assert.equal(Mouse.LeftButton, MouseButtonState.Released);
    });

    test('DirectlyOver + GetPosition reflect the last pointer event', () => {
        const root = new Focusable();
        const im = new InputManager();
        im.InjectPointerMove(root, pointer({ HostX: 40, HostY: 25 }));
        assert.equal(Mouse.DirectlyOver, root);
        const p = Mouse.GetPosition();
        assert.equal(p.X, 40);
        assert.equal(p.Y, 25);
    });

    test('Captured reflects pointer capture; Mouse.Capture(undefined) releases', () => {
        const root = new Focusable();
        const im = new InputManager();
        // Seed the device with a pointer event so it knows its sink.
        im.InjectPointerDown(root, pointer());
        im.CapturePointer(root);
        assert.equal(Mouse.Captured, root);
        assert.equal(Mouse.PrimaryDevice.CaptureMode, CaptureMode.Element);

        Mouse.Capture(undefined);
        assert.equal(Mouse.Captured, undefined);
        assert.equal(im.GetCapturedVisual(), undefined);
    });
});
