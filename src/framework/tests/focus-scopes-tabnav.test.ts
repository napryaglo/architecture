import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    FocusManager,
    FocusNavigationDirection,
    KeyboardNavigation,
    KeyboardNavigationMode,
    Visual,
} from '../../runtime/index.js';
import { Control, InputManager } from '../index.js';

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
}

class Focusable extends Container
{
    constructor() { super(); this.Focusable = true; }
}

describe('FocusManager — focus scopes', () => {
    beforeEach(() => { Application.current = null; });

    test('GetFocusedElement(scope) tracks the logical focus within a scope', () => {
        const scope = new Container();
        FocusManager.SetIsFocusScope(scope, true);
        assert.equal(FocusManager.GetIsFocusScope(scope), true);

        const a = new Focusable(), b = new Focusable();
        scope.AddChild(a); scope.AddChild(b);

        const im = new InputManager();
        im.SetFocus(a);
        assert.equal(FocusManager.GetFocusedElement(scope), a);
        assert.equal(FocusManager.GetFocusedElement(), a);          // global keyboard focus

        im.SetFocus(b);
        assert.equal(FocusManager.GetFocusedElement(scope), b);     // scope remembers latest

        // Leaving the scope entirely doesn't erase its remembered focus.
        im.SetFocus(undefined);
        assert.equal(FocusManager.GetFocusedElement(scope), b);
        assert.equal(FocusManager.GetFocusedElement(), undefined);
    });

    test('nested scopes each remember their own focused element', () => {
        const outer = new Container(); FocusManager.SetIsFocusScope(outer, true);
        const inner = new Container(); FocusManager.SetIsFocusScope(inner, true);
        const leaf = new Focusable();
        outer.AddChild(inner); inner.AddChild(leaf);

        const im = new InputManager();
        im.SetFocus(leaf);
        // Both enclosing scopes record the leaf as their logical focus.
        assert.equal(FocusManager.GetFocusedElement(inner), leaf);
        assert.equal(FocusManager.GetFocusedElement(outer), leaf);
    });
});

describe('KeyboardNavigation — TabNavigation modes', () => {
    beforeEach(() => { Application.current = null; });

    function next(from: Focusable): unknown { return KeyboardNavigation.PredictFocus(FocusNavigationDirection.Next, from); }
    function prev(from: Focusable): unknown { return KeyboardNavigation.PredictFocus(FocusNavigationDirection.Previous, from); }

    test('Cycle wraps within the container and never escapes it', () => {
        const root = new Container();
        const outside = new Focusable();
        const group = new Container();
        KeyboardNavigation.SetTabNavigation(group, KeyboardNavigationMode.Cycle);
        const a = new Focusable(), b = new Focusable();
        root.AddChild(outside); root.AddChild(group); group.AddChild(a); group.AddChild(b);

        assert.equal(next(a), b);          // a → b within group
        assert.equal(next(b), a);          // b → wraps to a (does NOT go to outside)
        assert.equal(prev(a), b);          // a → wraps back to b
    });

    test('Contained clamps at the container boundary (no move past the end)', () => {
        const root = new Container();
        const group = new Container();
        KeyboardNavigation.SetTabNavigation(group, KeyboardNavigationMode.Contained);
        const a = new Focusable(), b = new Focusable();
        root.AddChild(group); group.AddChild(a); group.AddChild(b);

        assert.equal(next(a), b);          // a → b
        assert.equal(next(b), b);          // b is last → clamped (stays)
        assert.equal(prev(a), a);          // a is first → clamped
    });

    test('None skips the container subtree in the global order', () => {
        const root = new Container();
        const a = new Focusable();
        const group = new Container();
        KeyboardNavigation.SetTabNavigation(group, KeyboardNavigationMode.None);
        const skipped = new Focusable();
        const c = new Focusable();
        root.AddChild(a); root.AddChild(group); group.AddChild(skipped); root.AddChild(c);

        // a → c, the group's child is not reachable by Tab.
        assert.equal(next(a), c);
    });

    test('Once enters the container only at its first stop', () => {
        const root = new Container();
        const a = new Focusable();
        const group = new Container();
        KeyboardNavigation.SetTabNavigation(group, KeyboardNavigationMode.Once);
        const first = new Focusable(), second = new Focusable();
        const c = new Focusable();
        root.AddChild(a); root.AddChild(group); group.AddChild(first); group.AddChild(second); root.AddChild(c);

        // a → first (enter once) → c (skip the rest of the group).
        assert.equal(next(a), first);
        assert.equal(next(first), c);
    });
});
