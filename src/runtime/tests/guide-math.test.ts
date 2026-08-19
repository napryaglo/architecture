import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Rect } from '../../visual-engine/primitives.js';
import { AlignmentAxis, EdgeKind } from '../alignment-math.js';
import {
    snapGuidePosition, snapRectToGuides, chooseTickInterval, ticksInRange,
    type PersistentGuide,
} from '../guide-math.js';

const guide = (axis: AlignmentAxis, position: number): PersistentGuide => ({ axis, position, glued: [] });

describe('snapGuidePosition', () => {
    test('snaps a placed guide onto a nearby node edge (within tolerance)', () => {
        const rects = [new Rect(100, 40, 60, 30)];  // left=100, mid=130, right=160
        assert.equal(snapGuidePosition(AlignmentAxis.X, 103, rects, 5), 100);  // snap to left edge
        assert.equal(snapGuidePosition(AlignmentAxis.X, 128, rects, 5), 130);  // snap to mid
    });
    test('leaves the position unchanged when no edge is within tolerance', () => {
        const rects = [new Rect(100, 40, 60, 30)];
        assert.equal(snapGuidePosition(AlignmentAxis.X, 200, rects, 5), 200);
    });
});

describe('snapRectToGuides', () => {
    test('snaps a node edge onto a guide and reports the glued edge + guide index', () => {
        const guides = [guide(AlignmentAxis.X, 300), guide(AlignmentAxis.Y, 80)];
        const r = new Rect(297, 100, 50, 40);   // left=297 near x-guide 300; top=100, bottom=140 far from y-guide 80
        const res = snapRectToGuides(r, guides, 5);
        assert.equal(res.snapped.X, 300);       // left snapped to the x guide
        assert.deepEqual(res.x, { edge: EdgeKind.Min, guide: 0 });
        assert.equal(res.y, undefined);         // no y edge within 5 of 80
    });
    test('no snap when nothing is close', () => {
        const guides = [guide(AlignmentAxis.X, 300)];
        const r = new Rect(0, 0, 50, 40);
        const res = snapRectToGuides(r, guides, 5);
        assert.equal(res.snapped.X, 0);
        assert.equal(res.x, undefined);
    });
});

describe('tick math', () => {
    test('chooseTickInterval keeps on-screen spacing >= minPx using a 1/2/5 ladder', () => {
        assert.equal(chooseTickInterval(1, 50), 50);
        assert.equal(chooseTickInterval(2, 50), 50);
        assert.equal(chooseTickInterval(0.5, 50), 100);
    });
    test('ticksInRange enumerates multiples of interval covering [min,max]', () => {
        assert.deepEqual(ticksInRange(50, 90, 210), [100, 150, 200]);
        assert.deepEqual(ticksInRange(50, -30, 60), [0, 50]);
    });
});
