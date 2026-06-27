import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    FocusNavigationDirection,
    Key,
    Keyboard,
    KeyboardNavigation,
    NoModifiers,
    ModifierKeys,
    Rect,
    TraversalRequest,
    Visual,
    type KeyEventInit,
} from '../../runtime/index.js';
import { HeadlessTarget } from '../../visual-engine/index.js';
import { StackPanel } from '../../basic/index.js';
import { Button, Control } from '../index.js';

function key(k: Key, mods = NoModifiers): KeyEventInit
{
    return { Key: k, KeyText: '', Code: '', Modifiers: mods, IsRepeat: false };
}

class Container extends Control
{
    private readonly _kids: Visual[] = [];
    public AddChild(child: Visual): void
    {
        this._kids.push(child);
        (this as unknown as { AttachLogical(v: Visual): void }).AttachLogical(child);
        (this as unknown as { AttachVisual(v: Visual): void }).AttachVisual(child);
    }
    public override get visualChildren():  readonly Visual[] { return this._kids; }
    public override get logicalChildren(): readonly Visual[] { return this._kids; }
    public place(x: number, y: number, w: number, h: number): void
    {
        this.Measure({ Width: w, Height: h } as never);
        this.Arrange(new Rect(x, y, w, h));
    }
}

class Focusable extends Container
{
    constructor(tabIndex = Number.POSITIVE_INFINITY, isTabStop = true)
    {
        super();
        this.Focusable = true;
        this.TabIndex  = tabIndex;
        this.IsTabStop = isTabStop;
    }
}

describe('KeyboardNavigation.PredictFocus — tab order', () => {
    beforeEach(() => { Application.current = null; });

    test('Next / Previous walk document order when TabIndex is unset', () => {
        const root = new Container();
        const a = new Focusable(), b = new Focusable(), c = new Focusable();
        root.AddChild(a); root.AddChild(b); root.AddChild(c);
        assert.equal(KeyboardNavigation.PredictFocus(FocusNavigationDirection.Next, a), b);
        assert.equal(KeyboardNavigation.PredictFocus(FocusNavigationDirection.Next, b), c);
        assert.equal(KeyboardNavigation.PredictFocus(FocusNavigationDirection.Previous, b), a);
    });

    test('Next wraps from last back to first (Cycle)', () => {
        const root = new Container();
        const a = new Focusable(), b = new Focusable();
        root.AddChild(a); root.AddChild(b);
        assert.equal(KeyboardNavigation.PredictFocus(FocusNavigationDirection.Next, b), a);
        assert.equal(KeyboardNavigation.PredictFocus(FocusNavigationDirection.Previous, a), b);
    });

    test('TabIndex orders the sequence ahead of document order', () => {
        const root = new Container();
        const a = new Focusable(3), b = new Focusable(1), c = new Focusable(2);
        root.AddChild(a); root.AddChild(b); root.AddChild(c);   // doc order a,b,c
        // Tab order by index: b(1), c(2), a(3).
        assert.equal(KeyboardNavigation.PredictFocus(FocusNavigationDirection.First, b), b);
        assert.equal(KeyboardNavigation.PredictFocus(FocusNavigationDirection.Next, b), c);
        assert.equal(KeyboardNavigation.PredictFocus(FocusNavigationDirection.Next, c), a);
        assert.equal(KeyboardNavigation.PredictFocus(FocusNavigationDirection.Last, b), a);
    });

    test('IsTabStop=false and non-Focusable elements are skipped', () => {
        const root = new Container();
        const a = new Focusable();
        const skip = new Focusable(Number.POSITIVE_INFINITY, /*isTabStop*/ false);
        const c = new Focusable();
        root.AddChild(a); root.AddChild(skip); root.AddChild(c);
        assert.equal(KeyboardNavigation.PredictFocus(FocusNavigationDirection.Next, a), c);
    });
});

describe('KeyboardNavigation.PredictFocus — directional', () => {
    beforeEach(() => { Application.current = null; });

    test('Right / Down pick the nearest stop in that direction', () => {
        const root = new Container();
        const left  = new Focusable();
        const right = new Focusable();
        const below = new Focusable();
        root.AddChild(left); root.AddChild(right); root.AddChild(below);
        // Arrange in a small grid (positions are relative to root at 0,0).
        root.place(0, 0, 300, 300);
        left.place(0, 0, 50, 50);
        right.place(100, 0, 50, 50);
        below.place(0, 100, 50, 50);
        assert.equal(KeyboardNavigation.PredictFocus(FocusNavigationDirection.Right, left), right);
        assert.equal(KeyboardNavigation.PredictFocus(FocusNavigationDirection.Down, left), below);
        assert.equal(KeyboardNavigation.PredictFocus(FocusNavigationDirection.Left, right), left);
    });
});

describe('KeyboardNavigation — Tab auto-wiring through InputManager', () => {
    beforeEach(() => { Application.current = null; });

    test('Tab / Shift+Tab move keyboard focus across tab stops', () => {
        // Real controls so the host back-pointer cascades through the
        // tree (Element.Focus(), used by MoveFocus, routes through it).
        const root = new StackPanel();
        const a = new Button(), b = new Button(), c = new Button();
        for (const x of [a, b, c]) x.Focusable = true;
        root.AddChild(a); root.AddChild(b); root.AddChild(c);
        const target = new HeadlessTarget(300, 300, root);
        const im = target.InputManager;

        im.SetFocus(a);
        assert.equal(im.InjectKeyDown(key(Key.Tab)), true);
        assert.equal(Keyboard.FocusedElement, b);
        im.InjectKeyDown(key(Key.Tab));
        assert.equal(Keyboard.FocusedElement, c);
        // Shift+Tab goes back.
        im.InjectKeyDown(key(Key.Tab, ModifierKeys.Shift));
        assert.equal(Keyboard.FocusedElement, b);
    });
});
