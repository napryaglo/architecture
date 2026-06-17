import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Rect } from '../../visual-engine/primitives.js';
import { findAlignmentGuides } from '../alignment-math.js';

describe('findAlignmentGuides — no candidates', () => {
    test('empty others → no guides, unchanged snap', () => {
        const m = new Rect(10, 20, 30, 40);
        const r = findAlignmentGuides(m, []);
        assert.equal(r.guides.length, 0);
        assert.deepEqual(
            { x: r.snapped.X, y: r.snapped.Y, w: r.snapped.Width, h: r.snapped.Height },
            { x: 10, y: 20, w: 30, h: 40 });
    });

    test('all peers outside tolerance → no guides', () => {
        const moving = new Rect(0, 0, 10, 10);
        // others' edges are 100 away — way out of the default 5 px tolerance
        const others = [new Rect(100, 100, 10, 10)];
        const r = findAlignmentGuides(moving, others);
        assert.equal(r.guides.length, 0);
        assert.equal(r.snapped.X, 0);
        assert.equal(r.snapped.Y, 0);
    });
});

describe('findAlignmentGuides — single edge match', () => {
    test('moving.left == other.left → one X guide, X-snap zero', () => {
        const moving = new Rect(50, 100, 20, 20);
        const other  = new Rect(50, 200, 20, 20);
        const r = findAlignmentGuides(moving, [other]);
        // Multiple edges might match — moving.left aligns with other.left
        // (delta 0). Min-min is the expected hit.
        assert.ok(r.guides.length >= 1);
        const xGuide = r.guides.find(g => g.axis === 'x' && g.movingEdge === 'min' && g.otherEdge === 'min');
        assert.ok(xGuide !== undefined);
        assert.equal(xGuide.position, 50);
        // X snap is 0; Y stays 100.
        assert.equal(r.snapped.X, 50);
        assert.equal(r.snapped.Y, 100);
    });

    test('moving.left within tolerance of other.left → snaps to other.left', () => {
        const moving = new Rect(53, 100, 20, 20);   // 3 px from 50, inside tolerance 5
        const other  = new Rect(50, 200, 20, 20);
        const r = findAlignmentGuides(moving, [other]);
        const xGuide = r.guides.find(g => g.axis === 'x' && g.movingEdge === 'min' && g.otherEdge === 'min');
        assert.ok(xGuide !== undefined);
        // Snap shifts moving by -3 → X = 50.
        assert.equal(r.snapped.X, 50);
        assert.equal(r.snapped.Y, 100);
    });
});

describe('findAlignmentGuides — closest-wins per axis', () => {
    test('two candidates on X axis, closest delta wins the snap', () => {
        // moving has edges at X = {50 (left), 60 (mid), 70 (right)}.
        // otherA edges {53, 63, 73} — every alignment is delta +3.
        // otherB edges {54, 64, 74} — every alignment is delta +4.
        // Both in tolerance; closest +3 wins.
        const moving = new Rect(50, 0, 20, 20);
        const otherA = new Rect(53, 100, 20, 20);
        const otherB = new Rect(54, 200, 20, 20);
        const r = findAlignmentGuides(moving, [otherA, otherB]);
        assert.equal(r.snapped.X, 53);
    });

    test('two ties — first-wins (iteration order)', () => {
        const moving = new Rect(50, 0, 20, 20);
        // Both have left at 53 — delta is +3 from moving.X=50.
        // First-encountered wins; iteration is `others` in array order.
        const a = new Rect(53, 100, 20, 20);
        const b = new Rect(53, 200, 20, 20);
        const r = findAlignmentGuides(moving, [a, b]);
        // Either way snap X = 53. The "first-wins" matters for the
        // guide that's reported; both should show up.
        assert.equal(r.snapped.X, 53);
        const xMinGuides = r.guides.filter(g => g.axis === 'x' && g.movingEdge === 'min' && g.otherEdge === 'min');
        assert.equal(xMinGuides.length, 2);
    });
});

describe('findAlignmentGuides — independent X and Y snap', () => {
    test('diagonal drag — both axes snap independently', () => {
        const moving = new Rect(52, 103, 20, 20);
        // other.left at 50 → delta -2 on X
        // other.top at 100 → delta -3 on Y
        const other = new Rect(50, 100, 20, 20);
        const r = findAlignmentGuides(moving, [other]);
        // Snap should move X by -2 (X = 50) and Y by -3 (Y = 100).
        assert.equal(r.snapped.X, 50);
        assert.equal(r.snapped.Y, 100);
    });
});

describe('findAlignmentGuides — tolerance boundary', () => {
    test('just-inside tolerance fires', () => {
        const moving = new Rect(54.999, 0, 20, 20);
        const other  = new Rect(50, 100, 20, 20);
        const r = findAlignmentGuides(moving, [other], { tolerance: 5 });
        const xMin = r.guides.find(g => g.axis === 'x' && g.movingEdge === 'min' && g.otherEdge === 'min');
        assert.ok(xMin !== undefined);
    });

    test('just-outside tolerance does not fire', () => {
        const moving = new Rect(55.001, 0, 20, 20);
        const other  = new Rect(50, 100, 20, 20);
        const r = findAlignmentGuides(moving, [other], { tolerance: 5 });
        const xMin = r.guides.find(g => g.axis === 'x' && g.movingEdge === 'min' && g.otherEdge === 'min');
        assert.equal(xMin, undefined);
    });
});

describe('findAlignmentGuides — edges option', () => {
    test('edges = [\'mid\'] only fires center-line guides', () => {
        const moving = new Rect(0, 0, 100, 100);     // mid X = 50
        const other  = new Rect(0, 200, 100, 100);   // mid X = 50, also left/right line up
        const r = findAlignmentGuides(moving, [other], { edges: ['mid'] });
        // All emitted guides must be mid×mid pairings.
        for (const g of r.guides)
        {
            assert.equal(g.movingEdge, 'mid');
            assert.equal(g.otherEdge,  'mid');
        }
        assert.ok(r.guides.length >= 1);
    });

    test('edges = [\'min\', \'max\'] suppresses mid guides', () => {
        const moving = new Rect(0, 0, 100, 100);
        const other  = new Rect(0, 200, 100, 100);
        const r = findAlignmentGuides(moving, [other], { edges: ['min', 'max'] });
        for (const g of r.guides)
        {
            assert.notEqual(g.movingEdge, 'mid');
            assert.notEqual(g.otherEdge,  'mid');
        }
    });
});

describe('findAlignmentGuides — Y axis', () => {
    test('top-edge alignment fires a Y guide', () => {
        const moving = new Rect(0, 53, 20, 20);
        const other  = new Rect(100, 50, 20, 20);
        const r = findAlignmentGuides(moving, [other]);
        const yMin = r.guides.find(g => g.axis === 'y' && g.movingEdge === 'min' && g.otherEdge === 'min');
        assert.ok(yMin !== undefined);
        assert.equal(yMin.position, 50);
        assert.equal(r.snapped.Y, 50);
    });
});

describe('findAlignmentGuides — guide carries the other rect', () => {
    test('AlignmentGuide.otherRect points at the source peer', () => {
        const moving = new Rect(50, 100, 20, 20);
        const other  = new Rect(50, 200, 20, 20);
        const r = findAlignmentGuides(moving, [other]);
        const xMin = r.guides.find(g => g.axis === 'x' && g.movingEdge === 'min' && g.otherEdge === 'min');
        assert.ok(xMin !== undefined);
        assert.equal(xMin.otherRect, other);
    });
});
