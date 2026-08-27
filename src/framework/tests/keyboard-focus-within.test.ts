import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Application, Visual } from '../../runtime/index.js';
import { Control, InputManager } from '../index.js';

// Minimal Control container that parents children in both trees, so focus can
// travel a real visual-parent chain (mirrors focus-scopes-tabnav.test.ts).
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

describe('IsKeyboardFocusWithin', () => {
    beforeEach(() => { Application.current = null; });

    test('is true on the focused element and every visual-parent ancestor', () => {
        const outer = new Container();
        const inner = new Container();
        const leaf = new Focusable();
        outer.AddChild(inner); inner.AddChild(leaf);

        const im = new InputManager();
        im.SetFocus(leaf);

        assert.equal(leaf.IsKeyboardFocusWithin, true, 'the focused element');
        assert.equal(inner.IsKeyboardFocusWithin, true, 'its parent contains focus');
        assert.equal(outer.IsKeyboardFocusWithin, true, 'the root contains focus');
    });

    test('moving focus to another subtree clears the old chain and sets the new', () => {
        const root = new Container();
        const paneA = new Container(); const leafA = new Focusable();
        const paneB = new Container(); const leafB = new Focusable();
        root.AddChild(paneA); paneA.AddChild(leafA);
        root.AddChild(paneB); paneB.AddChild(leafB);

        const im = new InputManager();
        im.SetFocus(leafA);
        assert.equal(paneA.IsKeyboardFocusWithin, true);
        assert.equal(paneB.IsKeyboardFocusWithin, false);

        im.SetFocus(leafB);
        assert.equal(paneA.IsKeyboardFocusWithin, false, 'old pane no longer contains focus');
        assert.equal(paneB.IsKeyboardFocusWithin, true,  'new pane now contains focus');
        assert.equal(root.IsKeyboardFocusWithin, true,   'the shared root still contains focus');
    });

    test('blurring (focus undefined) clears the whole chain', () => {
        const pane = new Container(); const leaf = new Focusable();
        pane.AddChild(leaf);

        const im = new InputManager();
        im.SetFocus(leaf);
        assert.equal(pane.IsKeyboardFocusWithin, true);

        im.SetFocus(undefined);
        assert.equal(pane.IsKeyboardFocusWithin, false);
        assert.equal(leaf.IsKeyboardFocusWithin, false);
    });
});
