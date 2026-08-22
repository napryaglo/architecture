import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Figure } from '../figure.js';
import { NodeVisualStore } from '../node-visual-store.js';
import { PositionAnchor } from '../position-anchor.js';

function fig(): Figure { Application.current = null; new Application(); return Figure.fromKind('rectangle', 10, 20, { width: 100, height: 50 }); }

describe('NodeVisualStore', () => {
    test('Read captures geometry; rotation/flags omitted when default', () => {
        const f = fig();
        const v = new NodeVisualStore().Read(f);
        assert.deepEqual(v, { left: 10, top: 20, w: 100, h: 50, baseWidth: 100, baseHeight: 50 });
    });
    test('Read includes rotation + flags when set', () => {
        const f = fig(); f.Rotation = 30; f.UserSized = true;
        const v = new NodeVisualStore().Read(f);
        assert.equal(v.rotation, 30);
        assert.equal(v.userSized, true);
    });
    test('lock aspect + position anchor: omitted at default, captured when set, round-tripped', () => {
        const store = new NodeVisualStore();
        // Defaults (lock off, Top-Left anchor) are omitted.
        const def = store.Read(fig());
        assert.equal('lockAspect' in def, false);
        assert.equal('anchor' in def, false);
        // Non-default values are captured...
        const f = fig(); f.LockAspectRatio = true; f.PositionFrom = PositionAnchor.Center;
        const v = store.Read(f);
        assert.equal(v.lockAspect, true);
        assert.equal(v.anchor, PositionAnchor.Center);
        // ...and restored onto a fresh node.
        const g = fig();
        store.Apply(v, g);
        assert.equal(g.LockAspectRatio, true);
        assert.equal(g.PositionFrom, PositionAnchor.Center);
    });
    test('Apply writes a record onto a node', () => {
        const f = fig();
        new NodeVisualStore().Apply({ left: 5, top: 6, w: 70, h: 40, rotation: 15 }, f);
        assert.equal(f.Left, 5); assert.equal(f.Top, 6);
        assert.equal(f.Width, 70); assert.equal(f.Height, 40);
        assert.equal(f.Rotation, 15);
    });
    test('Seed → Snapshot round-trips the map', () => {
        const s = new NodeVisualStore();
        const map = { a: { left: 1, top: 2, w: 3, h: 4 } };
        s.Seed(map);
        assert.deepEqual(s.Snapshot(), map);
        assert.deepEqual(s.Get('a'), map.a);
    });
});
