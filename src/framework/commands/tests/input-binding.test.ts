import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Application, NoModifiers, PointerButton, RelayCommand, Visual, type KeyEventInit, type PointerEventInit } from '../../../runtime/index.js';
import { Control, InputManager } from '../../../framework/index.js';;
import {
    CommandBinding,
    CommandManager,
    KeyBinding,
    MouseBinding,
    MouseGesture,
    RoutedCommand,
} from '../../index.js';;

function key(overrides: Partial<KeyEventInit> = {}): KeyEventInit
{
    return {
        Key: 'A', Code: 'KeyA',
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
        root.InputBindings.push(new KeyBinding('S', { Control: true }, cmd));

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyDown(key({ Key: 'S', Code: 'KeyS', Modifiers: { ...NoModifiers, Control: true } }));
        assert.equal(fired, 1);
    });

    test('Gesture mismatch leaves command unfired', () => {
        const root = new FocusableRoot();
        let fired = 0;
        const cmd = new RelayCommand(() => { fired++; });
        root.InputBindings.push(new KeyBinding('S', { Control: true }, cmd));

        const im = new InputManager();
        im.SetFocus(root);
        // Wrong key — modifiers match but Key doesn't.
        im.InjectKeyDown(key({ Key: 'X', Modifiers: { ...NoModifiers, Control: true } }));
        // Wrong modifier — Key matches but Control not down.
        im.InjectKeyDown(key({ Key: 'S', Code: 'KeyS' }));
        assert.equal(fired, 0);
    });

    test('Modifier "don\'t care" only constrains the specified modifiers', () => {
        // Modifiers: { Control: true } — Shift unspecified, so both
        // Ctrl+S and Ctrl+Shift+S match.
        const root = new FocusableRoot();
        let fired = 0;
        root.InputBindings.push(new KeyBinding('S', { Control: true }, new RelayCommand(() => { fired++; })));

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyDown(key({ Key: 'S', Modifiers: { ...NoModifiers, Control: true } }));
        im.InjectKeyDown(key({ Key: 'S', Modifiers: { ...NoModifiers, Control: true, Shift: true } }));
        assert.equal(fired, 2);
    });

    test('Modifier "must NOT be down" is enforceable with explicit false', () => {
        // Modifiers: { Control: true, Shift: false } — Ctrl+S yes,
        // Ctrl+Shift+S no.
        const root = new FocusableRoot();
        let fired = 0;
        root.InputBindings.push(new KeyBinding('S', { Control: true, Shift: false }, new RelayCommand(() => { fired++; })));

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyDown(key({ Key: 'S', Modifiers: { ...NoModifiers, Control: true } }));
        im.InjectKeyDown(key({ Key: 'S', Modifiers: { ...NoModifiers, Control: true, Shift: true } }));
        assert.equal(fired, 1);
    });

    test('Case-insensitive match on single-character keys', () => {
        const root = new FocusableRoot();
        let fired = 0;
        root.InputBindings.push(new KeyBinding('s', { Control: true }, new RelayCommand(() => { fired++; })));

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyDown(key({ Key: 'S', Modifiers: { ...NoModifiers, Control: true } }));
        assert.equal(fired, 1);
    });

    test('Innermost binding wins when multiple ancestors handle the gesture', () => {
        const outer = new FocusableRoot();
        const inner = new FocusableRoot();
        outer.AddChild(inner);

        const log: string[] = [];
        outer.InputBindings.push(new KeyBinding('S', { Control: true },
            new RelayCommand(() => { log.push('outer'); })));
        inner.InputBindings.push(new KeyBinding('S', { Control: true },
            new RelayCommand(() => { log.push('inner'); })));

        const im = new InputManager();
        im.SetFocus(inner);
        im.InjectKeyDown(key({ Key: 'S', Modifiers: { ...NoModifiers, Control: true } }));
        assert.deepEqual(log, ['inner']);
    });

    test('Bound RoutedCommand routes to a CommandBinding on the host', () => {
        const root = new FocusableRoot();
        const cmd = new RoutedCommand('Save', RoutedCommand);
        let executed = 0;
        root.CommandBindings.push(new CommandBinding(cmd, {
            executed: (_s, args) => { executed++; args.Handled = true; },
        }));
        root.InputBindings.push(new KeyBinding('S', { Control: true }, cmd));

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyDown(key({ Key: 'S', Modifiers: { ...NoModifiers, Control: true } }));
        assert.equal(executed, 1);
    });

    test('Class-level InputBinding fires for every instance', () => {
        let fired = 0;
        CommandManager.RegisterClassInputBinding(FocusableRoot,
            new KeyBinding('S', { Control: true }, new RelayCommand(() => { fired++; })));

        const a = new FocusableRoot();
        const b = new FocusableRoot();
        const im = new InputManager();
        im.SetFocus(a);
        im.InjectKeyDown(key({ Key: 'S', Modifiers: { ...NoModifiers, Control: true } }));
        im.SetFocus(b);
        im.InjectKeyDown(key({ Key: 'S', Modifiers: { ...NoModifiers, Control: true } }));
        assert.equal(fired, 2);
    });

    test('KeyUp does NOT fire KeyBindings (KeyDown only)', () => {
        const root = new FocusableRoot();
        let fired = 0;
        root.InputBindings.push(new KeyBinding('S', { Control: true }, new RelayCommand(() => { fired++; })));

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyUp(key({ Key: 'S', Modifiers: { ...NoModifiers, Control: true } }));
        assert.equal(fired, 0);
    });

    test('Multiple KeyBindings on one Visual — first matching wins', () => {
        const root = new FocusableRoot();
        const log: string[] = [];
        root.InputBindings.push(new KeyBinding('A', {}, new RelayCommand(() => { log.push('plain'); })));
        root.InputBindings.push(new KeyBinding('A', { Control: true }, new RelayCommand(() => { log.push('ctrl'); })));

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyDown(key({ Key: 'A', Modifiers: { ...NoModifiers, Control: true } }));
        // 'plain' has Control unspecified — it matches Ctrl+A and fires first.
        assert.deepEqual(log, ['plain']);
    });

    test('MouseBinding(LeftClick) fires on a single primary PointerDown', () => {
        const root = new FocusableRoot();
        let fired = 0;
        root.InputBindings.push(new MouseBinding(MouseGesture.LeftClick, {},
            new RelayCommand(() => { fired++; })));

        const im = new InputManager();
        im.InjectPointerDown(root, pointer({ Button: PointerButton.Primary }));
        assert.equal(fired, 1);
    });

    test('MouseBinding(LeftDoubleClick) only fires when IsDoubleClick=true', () => {
        const root = new FocusableRoot();
        let fired = 0;
        root.InputBindings.push(new MouseBinding(MouseGesture.LeftDoubleClick, {},
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
        root.InputBindings.push(new MouseBinding(MouseGesture.LeftDoubleClick, {},
            new RelayCommand(() => { log.push('double'); })));
        root.InputBindings.push(new MouseBinding(MouseGesture.LeftClick, {},
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
        const binding = new KeyBinding('K', {}, cmd);
        binding.CommandTarget = subtree;
        root.InputBindings.push(binding);

        const im = new InputManager();
        im.SetFocus(root);
        im.InjectKeyDown(key({ Key: 'K' }));
        assert.equal(firedOn, subtree);
    });
});
