import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Border } from '../../basic/index.js';
import { Panel } from '../../runtime/index.js';

// A concrete Panel for testing — isolates the base ZIndex behavior.
class TestPanel extends Panel {}

describe('Panel.ZIndex', () => {
    test('GetZIndex defaults to 0', () => {
        const a = new Border();
        assert.equal(Panel.GetZIndex(a), 0);
    });

    test('visualChildren is stable-sorted by ZIndex ascending; ties keep insertion order', () => {
        const p = new TestPanel();
        const a = new Border(); const b = new Border(); const c = new Border();
        p.AddChild(a); p.AddChild(b); p.AddChild(c);          // insertion: a, b, c
        Panel.SetZIndex(a, 2);
        Panel.SetZIndex(c, 2);                                // a and c tie at 2
        // b (0) below; a,c tie at 2 keep insertion order (a before c)
        assert.deepEqual([...p.visualChildren], [b, a, c]);
    });

    test('logicalChildren stays in insertion order regardless of ZIndex', () => {
        const p = new TestPanel();
        const a = new Border(); const b = new Border();
        p.AddChild(a); p.AddChild(b);
        Panel.SetZIndex(a, 10);
        assert.deepEqual([...p.logicalChildren], [a, b]);
        assert.deepEqual([...p.visualChildren],  [b, a]);
    });
});
