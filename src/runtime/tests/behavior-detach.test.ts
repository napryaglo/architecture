import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Behavior,
    Panel,
    type Visual,
} from '../index.js';

// Tracks every OnAttached / OnDetached fire so tests can assert order
// and counts. Subclass holds plain mutable fields; behaviors aren't
// required to do this — most real behaviors store nothing externally
// visible.
class TraceBehavior extends Behavior
{
    public attaches: Visual[] = [];
    public detaches: Visual[] = [];

    public override OnAttached(visual: Visual): void
    {
        this.attaches.push(visual);
    }

    public override OnDetached(visual: Visual): void
    {
        this.detaches.push(visual);
    }
}

describe('Visual.AddUnloadedListener — visualParent transition', () => {
    test('fires when visualParent transitions from defined to undefined', () => {
        const parent = new Panel();
        const child  = new Panel();
        let unloadedCount = 0;
        child.AddUnloadedListener(() => { unloadedCount++; });

        parent.AddChild(child);
        assert.equal(unloadedCount, 0, 'no fire on the attach edge');

        parent.RemoveChild(child);
        assert.equal(unloadedCount, 1, 'one fire on the detach edge');
    });

    test('does NOT fire when the visual is constructed without ever being attached', () => {
        const child = new Panel();
        let unloadedCount = 0;
        child.AddUnloadedListener(() => { unloadedCount++; });
        // No attach, no detach.
        assert.equal(unloadedCount, 0);
    });

    test('fires again on the second detach (NOT one-shot)', () => {
        const parent = new Panel();
        const child  = new Panel();
        let unloadedCount = 0;
        child.AddUnloadedListener(() => { unloadedCount++; });

        parent.AddChild(child);
        parent.RemoveChild(child);
        parent.AddChild(child);
        parent.RemoveChild(child);
        assert.equal(unloadedCount, 2);
    });

    test('does NOT cascade — detaching a parent does not fire on its children', () => {
        const grandparent = new Panel();
        const parent      = new Panel();
        const child       = new Panel();
        let childUnloaded = 0;
        let parentUnloaded = 0;
        child.AddUnloadedListener(() => { childUnloaded++; });
        parent.AddUnloadedListener(() => { parentUnloaded++; });

        grandparent.AddChild(parent);
        parent.AddChild(child);

        // Detach the parent from the grandparent. The child's
        // visualParent still points at `parent`, so its listener does
        // NOT fire — per the "fire on any tree detachment" semantics
        // documented for Behaviors v2.
        grandparent.RemoveChild(parent);
        assert.equal(parentUnloaded, 1);
        assert.equal(childUnloaded, 0);
    });

    test('RemoveUnloadedListener silences the listener', () => {
        const parent = new Panel();
        const child  = new Panel();
        let unloadedCount = 0;
        const listener = (): void => { unloadedCount++; };
        child.AddUnloadedListener(listener);

        parent.AddChild(child);
        parent.RemoveChild(child);
        assert.equal(unloadedCount, 1);

        child.RemoveUnloadedListener(listener);
        parent.AddChild(child);
        parent.RemoveChild(child);
        assert.equal(unloadedCount, 1, 'listener was removed before the second detach');
    });
});

describe('Visual.AddBehavior — auto-wires OnDetached via the Unloaded listener', () => {
    test('OnDetached fires when the host is detached from its parent', () => {
        const parent = new Panel();
        const child  = new Panel();
        const b = new TraceBehavior();

        child.AddBehavior(b);
        parent.AddChild(child);
        assert.deepEqual(b.attaches.length, 1);
        assert.deepEqual(b.detaches.length, 0);

        parent.RemoveChild(child);
        assert.deepEqual(b.detaches.length, 1, 'OnDetached fires on detach');
        assert.equal(b.detaches[0], child, 'and receives the host visual');
    });

    test('multiple behaviors on one host each receive OnDetached', () => {
        const parent = new Panel();
        const child  = new Panel();
        const b0 = new TraceBehavior();
        const b1 = new TraceBehavior();
        child.AddBehavior(b0);
        child.AddBehavior(b1);

        parent.AddChild(child);
        parent.RemoveChild(child);
        assert.equal(b0.detaches.length, 1);
        assert.equal(b1.detaches.length, 1);
    });

    test('OnDetached re-fires on a second detach (matches Unloaded re-fire semantics)', () => {
        const parent = new Panel();
        const child  = new Panel();
        const b = new TraceBehavior();
        child.AddBehavior(b);

        parent.AddChild(child);
        parent.RemoveChild(child);
        parent.AddChild(child);
        parent.RemoveChild(child);
        assert.equal(b.detaches.length, 2);
    });

    test('a behavior attached before the host is ever parented does not fire OnDetached on construction', () => {
        const child = new Panel();
        const b = new TraceBehavior();
        child.AddBehavior(b);
        // Never parented, never detached.
        assert.equal(b.attaches.length, 1);
        assert.equal(b.detaches.length, 0);
    });

    test('OnDetached default is a no-op (behaviors that only need OnAttached compile cleanly)', () => {
        // Subclasses that don't override OnDetached use the base
        // no-op. Construct one inline and verify it doesn't throw on
        // detach.
        class AttachOnlyBehavior extends Behavior
        {
            public touched = false;
            public override OnAttached(_v: Visual): void { this.touched = true; }
        }
        const b = new AttachOnlyBehavior();
        const parent = new Panel();
        const child  = new Panel();
        child.AddBehavior(b);
        parent.AddChild(child);
        parent.RemoveChild(child);   // does not throw — base OnDetached is void
        assert.equal(b.touched, true);
    });
});
