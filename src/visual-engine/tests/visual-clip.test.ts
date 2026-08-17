import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Element, Rect, Size } from '../../runtime/index.js';
import { RectangleGeometry } from '../index.js';

// Minimal Visual leaf: reports a fixed DesiredSize so arrange produces a
// known RenderSize. ClipToBounds lives on Visual, so a plain Element exercises it.
class Leaf extends Element
{
    constructor(private readonly desired: Size) { super(); }
    protected override MeasureOverride(_available: Size): Size { return this.desired; }
}

const arranged = (v: Element, w: number, h: number): void => {
    v.Measure(new Size(w, h));
    v.Arrange(new Rect(0, 0, w, h));
};

describe('Visual ClipToBounds', () => {
    test('off by default → no clip', () => {
        const v = new Leaf(new Size(40, 20));
        arranged(v, 40, 20);
        assert.equal(v.Clip, undefined);
    });

    test('on → a bounds RectangleGeometry (no radius) after arrange', () => {
        const v = new Leaf(new Size(40, 20));
        v.ClipToBounds = true;
        arranged(v, 40, 20);
        const clip = v.Clip as RectangleGeometry;
        assert.ok(clip instanceof RectangleGeometry);
        assert.equal(clip.Rect.Width, 40);
        assert.equal(clip.Rect.Height, 20);
        assert.equal(clip.RadiusX, 0);
    });

    test('toggling ClipToBounds off re-arranges and clears the clip it applied', () => {
        const v = new Leaf(new Size(40, 20));
        v.ClipToBounds = true;
        arranged(v, 40, 20);
        assert.ok(v.Clip !== undefined);
        v.ClipToBounds = false;                 // Arrange-metadata → invalidates arrange
        v.Arrange(new Rect(0, 0, 40, 20));
        assert.equal(v.Clip, undefined);
    });

    test('a hand-set Clip with ClipToBounds off survives an arrange (latch invariant)', () => {
        const v = new Leaf(new Size(40, 20));
        const hand = new RectangleGeometry(new Rect(0, 0, 5, 5));
        v.Clip = hand;
        arranged(v, 40, 20);
        assert.equal(v.Clip, hand);
    });

    test('a degenerate arranged size yields no clip', () => {
        const v = new Leaf(new Size(0, 0));
        v.ClipToBounds = true;
        v.Measure(new Size(0, 0));
        v.Arrange(new Rect(0, 0, 0, 0));
        assert.equal(v.Clip, undefined);
    });
});
