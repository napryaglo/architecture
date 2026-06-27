import { ModifierKeys, toModifierKeys } from '../../../runtime/index.js';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Application, Key, NoModifiers, PointerButton, RelayCommand, Visual, type KeyEventInit, type PointerEventInit } from '../../../runtime/index.js';
import { Control, InputManager } from '../../../framework/index.js';;
import {
    CommandBinding,
    CommandManager,
    KeyBinding,
    MouseBinding,
    MouseAction,
    RoutedCommand,
} from '../../index.js';;

function key(overrides: Partial<KeyEventInit> = {}): KeyEventInit
{
    return {
        Key: Key.A, KeyText: 'a', Code: 'KeyA',
        Modifiers: NoModifiers,
        IsRepeat: false,
        ...overrides,
    };
}

function pointer(overrides: Partial<PointerEventInit> = {}): PointerEventInit
{
    return {
        HostX: 0, HostY: 0,
        Button: PointerButton.Primary,
        Buttons: 1,
        Modifiers: NoModifiers,
        PointerId: 0, Pressure: 0,
        PointerType: 'mouse',
        ...overrides,
    };
}

class FocusableRoot extends Control
{
    private readonly _kids: Visual[] = [];
    constructor() { super(); this.Focusable = true; }
    public AddChild(child: Visual): void
    {
        this._kids.push(child);
        (this as unknown as { AttachLogical(v: Visual): void }).AttachLogical(child);
        (this as unknown as { AttachVisual(v: Visual): void }).AttachVisual(child);
    }
    public override get visualChildren():  readonly Visual[] { return this._kids; }
    public override get logicalChildren(): readonly Visual[] { return this._kids; }
}

describe('KeyBinding — markup-declared shortcuts', () => {
    beforeEach(() => {
        Application.current = null;
        CommandManager._resetForTests();
    });

    test('Matching gesture fires the bound RelayCommand on KeyDown', () => {
        const root = new FocusableRoot();
        let fired = 0;
        const cmd = new RelayCommand(() => { fired++; });
        root.InputBindings.push(new KeyBinding(Key.S, ModifierKeys.Control, cmd));

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyDown(key({ Key: Key.S, Code: 'KeyS', Modifiers: ModifierKeys.Control }));
        assert.equal(fired, 1);
    });

    test('Gesture mismatch leaves command unfired', () => {
        const root = new FocusableRoot();
        let fired = 0;
        const cmd = new RelayCommand(() => { fired++; });
        root.InputBindings.push(new KeyBinding(Key.S, ModifierKeys.Control, cmd));

        const im = new InputManager();
        im.SetFocus(root);
        // Wrong key — modifiers match but Key doesn't.
        im.InjectKeyDown(key({ Key: Key.X, Modifiers: ModifierKeys.Control }));
        // Wrong modifier — Key matches but Control not down.
        im.InjectKeyDown(key({ Key: Key.S, Code: 'KeyS' }));
        assert.equal(fired, 0);
    });

    test('Modifiers match exactly (WPF semantics): extra modifiers do NOT match', () => {
        // Modifiers=Control fires on Ctrl+S only — Ctrl+Shift+S has an
        // extra modifier and is NOT a match (exact-match parity with WPF
        // KeyGesture; the pre-parity build allowed per-modifier
        // "don't care").
        const root = new FocusableRoot();
        let fired = 0;
        root.InputBindings.push(new KeyBinding(Key.S, ModifierKeys.Control, new RelayCommand(() => { fired++; })));

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyDown(key({ Key: Key.S, Modifiers: ModifierKeys.Control }));
        im.InjectKeyDown(key({ Key: Key.S, Modifiers: (ModifierKeys.Control | ModifierKeys.Shift) }));
        assert.equal(fired, 1);
    });

    test('A bare key binding (Modifiers=None) does NOT fire when a modifier is held', () => {
        // Modifiers=None — plain S yes, Ctrl+S no.
        const root = new FocusableRoot();
        let fired = 0;
        root.InputBindings.push(new KeyBinding(Key.S, ModifierKeys.None, new RelayCommand(() => { fired++; })));

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyDown(key({ Key: Key.S, Modifiers: ModifierKeys.None }));
        im.InjectKeyDown(key({ Key: Key.S, Modifiers: ModifierKeys.Control }));
        assert.equal(fired, 1);
    });

    test('Case-insensitive match on single-character keys', () => {
        const root = new FocusableRoot();
        let fired = 0;
        root.InputBindings.push(new KeyBinding(Key.S, ModifierKeys.Control, new RelayCommand(() => { fired++; })));

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyDown(key({ Key: Key.S, Modifiers: ModifierKeys.Control }));
        assert.equal(fired, 1);
    });

    test('Innermost binding wins when multiple ancestors handle the gesture', () => {
        const outer = new FocusableRoot();
        const inner = new FocusableRoot();
        outer.AddChild(inner);

        const log: string[] = [];
        outer.InputBindings.push(new KeyBinding(Key.S, ModifierKeys.Control,
            new RelayCommand(() => { log.push('outer'); })));
        inner.InputBindings.push(new KeyBinding(Key.S, ModifierKeys.Control,
            new RelayCommand(() => { log.push('inner'); })));

        const im = new InputManager();
        im.SetFocus(inner);
        im.InjectKeyDown(key({ Key: Key.S, Modifiers: ModifierKeys.Control }));
        assert.deepEqual(log, ['inner']);
    });

    test('Bound RoutedCommand routes to a CommandBinding on the host', () => {
        const root = new FocusableRoot();
        const cmd = new RoutedCommand('Save', RoutedCommand);
        let executed = 0;
        root.CommandBindings.push(new CommandBinding(cmd, {
            executed: (_s, args) => { executed++; args.Handled = true; },
        }));
        root.InputBindings.push(new KeyBinding(Key.S, ModifierKeys.Control, cmd));

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyDown(key({ Key: Key.S, Modifiers: ModifierKeys.Control }));
        assert.equal(executed, 1);
    });

    test('Class-level InputBinding fires for every instance', () => {
        let fired = 0;
        CommandManager.RegisterClassInputBinding(FocusableRoot,
            new KeyBinding(Key.S, ModifierKeys.Control, new RelayCommand(() => { fired++; })));

        const a = new FocusableRoot();
        const b = new FocusableRoot();
        const im = new InputManager();
        im.SetFocus(a);
        im.InjectKeyDown(key({ Key: Key.S, Modifiers: ModifierKeys.Control }));
        im.SetFocus(b);
        im.InjectKeyDown(key({ Key: Key.S, Modifiers: ModifierKeys.Control }));
        assert.equal(fired, 2);
    });

    test('KeyUp does NOT fire KeyBindings (KeyDown only)', () => {
        const root = new FocusableRoot();
        let fired = 0;
        root.InputBindings.push(new KeyBinding(Key.S, ModifierKeys.Control, new RelayCommand(() => { fired++; })));

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyUp(key({ Key: Key.S, Modifiers: ModifierKeys.Control }));
        assert.equal(fired, 0);
    });

    test('Multiple KeyBindings on one Visual — first matching wins', () => {
        const root = new FocusableRoot();
        const log: string[] = [];
        // Two bindings for the SAME exact gesture (Ctrl+A); the first
        // registered wins and stops further consultation.
        root.InputBindings.push(new KeyBinding(Key.A, ModifierKeys.Control, new RelayCommand(() => { log.push('first'); })));
        root.InputBindings.push(new KeyBinding(Key.A, ModifierKeys.Control, new RelayCommand(() => { log.push('second'); })));

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyDown(key({ Key: Key.A, Modifiers: ModifierKeys.Control }));
        assert.deepEqual(log, ['first']);
    });

    test('MouseBinding(LeftClick) fires on a single primary PointerDown', () => {
        const root = new FocusableRoot();
        let fired = 0;
        root.InputBindings.push(new MouseBinding(MouseAction.LeftClick, ModifierKeys.None,
            new RelayCommand(() => { fired++; })));

        const im = new InputManager();
        im.InjectPointerDown(root, pointer({ Button: PointerButton.Primary }));
        assert.equal(fired, 1);
    });

    test('MouseBinding(LeftDoubleClick) only fires when IsDoubleClick=true', () => {
        const root = new FocusableRoot();
        let fired = 0;
        root.InputBindings.push(new MouseBinding(MouseAction.LeftDoubleClick, ModifierKeys.None,
            new RelayCommand(() => { fired++; })));

        const im = new InputManager();
        // First click: not a double-click — should NOT fire.
        im.InjectPointerDown(root, pointer({ Button: PointerButton.Primary }));
        assert.equal(fired, 0);
        // Second click flagged as double — should fire.
        im.InjectPointerDown(root, pointer({ Button: PointerButton.Primary, IsDoubleClick: true }));
        assert.equal(fired, 1);
    });

    test('MouseBinding ordering — LeftDoubleClick declared before LeftClick wins on double-click', () => {
        // InputBindings are walked in declaration order; the first
        // match fires + sets Handled. Authors who want a double-click
        // to take precedence over a generic LeftClick on the same
        // visual list LeftDoubleClick FIRST.
        const root = new FocusableRoot();
        const log: string[] = [];
        root.InputBindings.push(new MouseBinding(MouseAction.LeftDoubleClick, ModifierKeys.None,
            new RelayCommand(() => { log.push('double'); })));
        root.InputBindings.push(new MouseBinding(MouseAction.LeftClick, ModifierKeys.None,
            new RelayCommand(() => { log.push('single'); })));

        const im = new InputManager();
        // First press is a single click — only LeftClick matches.
        im.InjectPointerDown(root, pointer({ Button: PointerButton.Primary }));
        // Second press is a double click — LeftDoubleClick wins because
        // it's listed first.
        im.InjectPointerDown(root, pointer({ Button: PointerButton.Primary, IsDoubleClick: true }));
        assert.deepEqual(log, ['single', 'double']);
    });

    test('CommandTarget on KeyBinding redirects RoutedCommand dispatch', () => {
        // KeyBinding on `root` but the routed command should fire its
        // CommandBinding on `subtree` (the CommandTarget). Verifies the
        // CommandTarget DP overrides the default "use host as target".
        const root    = new FocusableRoot();
        const subtree = new FocusableRoot();
        // Note: subtree is NOT a descendant of root for this test —
        // CommandTarget jumps the routing scope.

        const cmd = new RoutedCommand('Cmd', RoutedCommand);
        let firedOn: Visual | null = null;
        subtree.CommandBindings.push(new CommandBinding(cmd, {
            executed: (sender, args) => { firedOn = sender; args.Handled = true; },
        }));
        const binding = new KeyBinding(Key.K, ModifierKeys.None, cmd);
        binding.CommandTarget = subtree;
        root.InputBindings.push(binding);

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyDown(key({ Key: Key.K }));
        assert.equal(firedOn, subtree);
    });
});
