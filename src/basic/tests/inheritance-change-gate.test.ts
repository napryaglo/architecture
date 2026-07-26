// Regression for the change-gated inheritance cascade (element.ts
// `_refresh_inheritance_subtree`). The subtree refresh now recurses into a
// node's children ONLY when refreshing that node changed one of its
// descendant-visible ("provided") inherited values — the optimization that
// stops bottom-up assembly from re-walking a subtree at every attach.
//
// These pin the correctness the optimization must NOT break: an ancestor
// value still reaches a deep leaf through bare intermediate nodes, and a
// nearer local value still shadows a farther ancestor. Foreground is an
// inheritable cross-class DP, so a plain Border carries it down to a
// TextBlock leaf through the global inheritable registry.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SolidColorBrush, Color } from '../../visual-engine/index.js';
import { TextBlock } from '../text-block.js';
import { Border } from '../border.js';
import { initTestApp } from './test-app.js';

const FG = TextBlock.ForegroundKey;
const read = (m: object): unknown => (m as { get_property_value(k: unknown): unknown }).get_property_value(FG);

describe('inheritance — change-gated cascade', () => {

    test('bottom-up assembly: an ancestor value flows through a bare mid to a deep leaf', () => {
        initTestApp();
        const ink = new SolidColorBrush(Color.FromHex('#00ff00'));
        const root = new Border();
        const mid = new Border();          // bare — provides nothing of its own
        const leaf = new TextBlock();
        // Assemble leaf→mid→root in the bottom-up order that used to re-walk
        // the accumulated subtree at every attach. The mid provides nothing,
        // so its own attach must skip the subtree; the root's attach (which
        // introduces the inherited value) must cascade all the way down.
        mid.SetChild(leaf);
        root.set_property_value(FG, ink);
        root.SetChild(mid);
        assert.equal(read(leaf), ink, 'root Foreground reaches the leaf through the bare mid');
    });

    test('a nearer local value shadows a farther ancestor', () => {
        initTestApp();
        const rootInk = new SolidColorBrush(Color.FromHex('#ff0000'));
        const midInk = new SolidColorBrush(Color.FromHex('#0000ff'));
        const root = new Border(); root.set_property_value(FG, rootInk);
        const mid = new Border(); mid.set_property_value(FG, midInk);
        const leaf = new TextBlock();
        mid.SetChild(leaf);
        root.SetChild(mid);
        assert.equal(read(leaf), midInk, 'leaf inherits the nearer (mid) value, not the root');
    });

    test('deep chain: the value reaches every level, not just the first child', () => {
        initTestApp();
        const ink = new SolidColorBrush(Color.FromHex('#abcdef'));
        const root = new Border(); root.set_property_value(FG, ink);
        const a = new Border(); const b = new Border(); const c = new Border();
        const leaf = new TextBlock();
        // Fully assemble the chain detached, then connect it under the root in
        // one attach — the single attach must cascade through a..c to the leaf.
        c.SetChild(leaf); b.SetChild(c); a.SetChild(b);
        root.SetChild(a);
        assert.equal(read(a), ink);
        assert.equal(read(c), ink);
        assert.equal(read(leaf), ink, 'the inherited value reached the bottom of the chain');
    });
});
