import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Element, Visual, Rect, Size, Color } from '../../runtime/index.js';
import { Pen, RectangleGeometry, SolidColorBrush } from '../index.js';

// ClipToBounds drives the CHILDREN-only clip: at arrange it fills the internal
// ChildClip slot from buildChildClipGeometry (the outline inset by the full
// stroke), never masking the Visual's own paint. The whole-subtree Clip DP is
// independent — hand-authored only, never touched by ClipToBounds.

// Minimal Visual leaf with a known DesiredSize so arrange produces a known
// RenderSize.
class Leaf extends Element
{
    constructor(private readonly desired: Size) { super(); }
    protected override MeasureOverride(_available: Size): Size { return this.desired; }
}

const arranged = (v: Visual, w: number, h: number): void => {
    v.Measure(new Size(w, h));
    v.Arrange(new Rect(0, 0, w, h));
};

describe('Visual ClipToBounds → ChildClip', () => {
    test('off by default → no child clip', () => {
        const v = new Leaf(new Size(40, 20));
        arranged(v, 40, 20);
        assert.equal(v.ChildClip, undefined);
    });

    test('on → ChildClip is the outline inset by the full pen; own paint (Clip) untouched', () => {
        const v = new (class extends Visual {})();
        v.Stroke = new Pen(new SolidColorBrush(Color.FromHex('#000000')), 10);
        v.ClipToBounds = true;
        arranged(v, 100, 100);
        assert.ok(v.ChildClip, 'ChildClip present when on');
        // Base outline is the bounds rect; child clip insets by the full pen (10).
        const bounds = (v.ChildClip as unknown as { GetBounds(): Rect }).GetBounds();
        assert.equal(bounds.X, 10);
        assert.equal(bounds.Y, 10);
        assert.equal(bounds.Width, 80);
        assert.equal(bounds.Height, 80);
        // ClipToBounds never touches the whole-subtree Clip DP — own paint is not masked.
        assert.equal(v.Clip, undefined);
    });

    test('with no stroke → ChildClip is the full bounds rect', () => {
        const v = new Leaf(new Size(40, 20));
        v.ClipToBounds = true;
        arranged(v, 40, 20);
        const clip = v.ChildClip as RectangleGeometry;
        assert.ok(clip instanceof RectangleGeometry);
        assert.equal(clip.Rect.Width, 40);
        assert.equal(clip.Rect.Height, 20);
    });

    test('toggling ClipToBounds off re-arranges and clears the child clip it applied', () => {
        const v = new Leaf(new Size(40, 20));
        v.ClipToBounds = true;
        arranged(v, 40, 20);
        assert.ok(v.ChildClip !== undefined);
        v.ClipToBounds = false;                 // Arrange-metadata → invalidates arrange
        v.Arrange(new Rect(0, 0, 40, 20));
        assert.equal(v.ChildClip, undefined);
    });

    test('a hand-set Clip is independent of ClipToBounds and survives an arrange', () => {
        const v = new Leaf(new Size(40, 20));
        const hand = new RectangleGeometry(new Rect(0, 0, 5, 5));
        v.Clip = hand;
        v.ClipToBounds = true;                  // drives ChildClip, not Clip
        arranged(v, 40, 20);
        assert.equal(v.Clip, hand, 'hand-set whole-subtree Clip untouched');
        assert.ok(v.ChildClip !== undefined, 'ChildClip filled separately');
    });

    test('a degenerate arranged size yields no child clip', () => {
        const v = new Leaf(new Size(0, 0));
        v.ClipToBounds = true;
        v.Measure(new Size(0, 0));
        v.Arrange(new Rect(0, 0, 0, 0));
        assert.equal(v.ChildClip, undefined);
    });
});
