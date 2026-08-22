import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Color, Pen, SolidColorBrush } from '../../../visual-engine/index.js';
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
    test('content-tile card fill/stroke: visuals only when SizeToContent, round-tripped, transparent omitted', () => {
        const store = new NodeVisualStore();
        // A geometric shape's fill rides its node record, NOT the visuals section.
        const shape = fig(); shape.Fill = new SolidColorBrush(Color.FromHex('#3b82f6ff'));
        assert.equal('fill' in store.Read(shape), false);

        // A content tile persists a visible card fill + border...
        const tile = fig(); tile.SizeToContent = true;
        tile.Fill   = new SolidColorBrush(Color.FromHex('#3b82f6ff'));
        tile.Stroke = new Pen(new SolidColorBrush(Color.FromHex('#1e40afff')), 2);
        const v = store.Read(tile);
        assert.ok(typeof v.fill === 'string');
        assert.ok(typeof v.stroke === 'string');
        assert.equal(v.strokeWidth, 2);
        // ...restored onto a fresh tile.
        const g = fig(); g.SizeToContent = true;
        store.Apply(v, g);
        assert.equal((g.Fill as SolidColorBrush).Color.ToHex(), (tile.Fill as SolidColorBrush).Color.ToHex());
        assert.equal((g.Stroke!.Brush as SolidColorBrush).Color.ToHex(), (tile.Stroke!.Brush as SolidColorBrush).Color.ToHex());
        assert.equal(g.Stroke!.Thickness, 2);

        // A transparent (unstyled) content tile writes nothing.
        const bare = fig(); bare.SizeToContent = true;
        bare.Fill   = new SolidColorBrush(Color.FromHex('#00000000'));
        bare.Stroke = new Pen(new SolidColorBrush(Color.FromHex('#00000000')), 1);
        const bv = store.Read(bare);
        assert.equal('fill' in bv, false);
        assert.equal('stroke' in bv, false);
    });
    test('parentId: omitted when unset, captured + round-tripped when set', () => {
        const store = new NodeVisualStore();
        // Unset → omitted.
        const bare = fig();
        assert.equal('parentId' in store.Read(bare), false);
        // Set → captured...
        const child = fig(); child.ParentId = 'container-7';
        const v = store.Read(child);
        assert.equal(v.parentId, 'container-7');
        // ...and restored onto a fresh node.
        const g = fig();
        store.Apply(v, g);
        assert.equal(g.ParentId, 'container-7');
    });
    test('Seed → Snapshot round-trips the map', () => {
        const s = new NodeVisualStore();
        const map = { a: { left: 1, top: 2, w: 3, h: 4 } };
        s.Seed(map);
        assert.deepEqual(s.Snapshot(), map);
        assert.deepEqual(s.Get('a'), map.a);
    });
});
