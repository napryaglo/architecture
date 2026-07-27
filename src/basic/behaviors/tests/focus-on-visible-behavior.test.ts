import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Panel, Visibility } from '../../../runtime/index.js';
import { FocusOnVisibleBehavior } from '../focus-on-visible-behavior.js';

// A host that records Focus() / SelectAll() calls instead of routing to a real
// InputManager (which needs a mounted target). Keyboard.Focus(v) delegates to
// v.Focus(), so overriding it captures the behavior's intent without a host.
class SpyHost extends Panel
{
    public focusCount  = 0;
    public selectCount = 0;
    public constructor() { super(); this.Focusable = true; }
    public override Focus(): void { this.focusCount++; }
    public SelectAll(): void { this.selectCount++; }
}

// A focusable host with no SelectAll() — exercises the duck-typed guard.
class PlainSpyHost extends Panel
{
    public focusCount = 0;
    public constructor() { super(); this.Focusable = true; }
    public override Focus(): void { this.focusCount++; }
}

describe('FocusOnVisibleBehavior', () => {
    test('focuses + selects a host that is already visible at attach', () => {
        const host = new SpyHost();               // Panels default to Visible
        host.AddBehavior(new FocusOnVisibleBehavior());
        assert.equal(host.focusCount, 1);
        assert.equal(host.selectCount, 1);
    });

    test('does not focus while collapsed, focuses on the transition to visible', () => {
        const host = new SpyHost();
        host.Visibility = Visibility.Collapsed;
        host.AddBehavior(new FocusOnVisibleBehavior());
        assert.equal(host.focusCount, 0, 'no focus while collapsed');

        host.Visibility = Visibility.Visible;
        assert.equal(host.focusCount, 1, 'focus on becoming visible');
        assert.equal(host.selectCount, 1);
    });

    test('re-focuses on every re-entry to visible', () => {
        const host = new SpyHost();
        host.Visibility = Visibility.Collapsed;
        host.AddBehavior(new FocusOnVisibleBehavior());

        host.Visibility = Visibility.Visible;
        host.Visibility = Visibility.Collapsed;
        host.Visibility = Visibility.Visible;
        assert.equal(host.focusCount, 2);
    });

    test('SelectAll=false focuses without selecting', () => {
        const host = new SpyHost();
        const b = new FocusOnVisibleBehavior();
        b.SelectAll = false;
        host.AddBehavior(b);
        assert.equal(host.focusCount, 1);
        assert.equal(host.selectCount, 0);
    });

    test('is a no-op on a host without SelectAll() (still focuses)', () => {
        const host = new PlainSpyHost();   // defaults to Visible
        host.AddBehavior(new FocusOnVisibleBehavior());
        assert.equal(host.focusCount, 1);
    });

    test('attached to a non-focusable wrapper, focuses the first focusable descendant', () => {
        const wrapper = new Panel();          // not focusable
        wrapper.Visibility = Visibility.Collapsed;
        const editor = new SpyHost();         // focusable child
        wrapper.AddChild(editor);
        wrapper.AddBehavior(new FocusOnVisibleBehavior());

        wrapper.Visibility = Visibility.Visible;
        assert.equal(editor.focusCount, 1, 'the descendant editor is focused');
        assert.equal(editor.selectCount, 1, 'and selected');
    });

    test('stamped-on-demand: focuses on the mount edge when the child arrives after the behavior', () => {
        // Mirrors the compiler's emit order for a stamped editor
        // (`Border { Behaviors {..}; TextBox }`): AddBehavior runs BEFORE the
        // child is attached and before the host mounts, so the immediate focus
        // attempt finds nothing (regression: the editor appeared unfocused).
        // Focus must land on the attach edge, once the subtree exists + is live.
        const wrapper = new Panel();          // not focusable, Visible
        wrapper.AddBehavior(new FocusOnVisibleBehavior());
        const editor = new SpyHost();         // focusable child added AFTER
        wrapper.AddChild(editor);
        assert.equal(editor.focusCount, 0, 'not focused before mount');

        // Simulate mounting into a live tree (fires the attach edge).
        (wrapper as unknown as { SetTarget: (t: unknown) => void }).SetTarget({});
        assert.equal(editor.focusCount, 1, 'focused on the mount edge');
        assert.equal(editor.selectCount, 1, 'and selected');
    });

    test('OnDetached stops focusing on later visibility changes', () => {
        const host = new SpyHost();
        host.Visibility = Visibility.Collapsed;
        const b = new FocusOnVisibleBehavior();
        host.AddBehavior(b);
        host.RemoveBehavior(b);

        host.Visibility = Visibility.Visible;
        assert.equal(host.focusCount, 0, 'no focus after detach');
    });
});
