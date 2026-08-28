import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Border } from '../../basic/index.js';
import { Panel } from '../../runtime/index.js';

class TestPanel extends Panel {}

describe('Panel.ZIndex reactivity', () => {
    test('SetZIndex on an attached child re-sorts visualChildren immediately', () => {
        const p = new TestPanel();
        const a = new Border(); const b = new Border();
        p.AddChild(a); p.AddChild(b);
        assert.deepEqual([...p.visualChildren], [a, b]);   // both 0 -> insertion
        Panel.SetZIndex(a, 5);                             // a now on top
        assert.deepEqual([...p.visualChildren], [b, a]);   // snapshot rebuilt
    });

    test('SetZIndex requests a render on the parent panel', () => {
        const p = new TestPanel();
        const a = new Border();
        p.AddChild(a);
        let invalidated = 0;
        const orig = (p as unknown as { InvalidateVisual(): void }).InvalidateVisual.bind(p);
        (p as unknown as { InvalidateVisual(): void }).InvalidateVisual = () => { invalidated++; orig(); };
        Panel.SetZIndex(a, 3);
        assert.equal(invalidated, 1);
    });
});
