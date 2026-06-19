import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Rect, Size, Visual } from '../../runtime/index.js';
import { resolveKey } from '../../runtime/model-internals.js';
import { Canvas } from '../panels/canvas.js';

// Minimal leaf — MeasureOverride returns a fixed box so DesiredSize is
// predictable in the assertions below.
class FixedSizeLeaf extends Visual
{
    constructor(private box: Size) { super(); }

    protected override MeasureOverride(_a: Size): Size { return this.box; }
}

describe('Canvas', () => {
    test('reports DesiredSize as the union bounding box of positioned children', () => {
        const a = new FixedSizeLeaf(new Size(30, 40));
        Canvas.SetLeft(a, 10);
        Canvas.SetTop(a,  20);                                     // covers up to (40, 60)
        const b = new FixedSizeLeaf(new Size(20, 10));
        Canvas.SetLeft(b, 50);
        Canvas.SetTop(b,  5);                                      // covers up to (70, 15)

        const canvas = new Canvas();
        canvas.AddChild(a);
        canvas.AddChild(b);
        canvas.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));

        assert.equal(canvas.DesiredSize.Width,  70);
        assert.equal(canvas.DesiredSize.Height, 60);
    });

    test('places each child at its (Left, Top) with its DesiredSize', () => {
        const a = new FixedSizeLeaf(new Size(30, 40));
        Canvas.SetLeft(a, 10);
        Canvas.SetTop(a,  20);
        const b = new FixedSizeLeaf(new Size(20, 10));
        Canvas.SetLeft(b, 50);
        Canvas.SetTop(b,  5);

        const canvas = new Canvas();
        canvas.AddChild(a);
        canvas.AddChild(b);
        canvas.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
        canvas.Arrange(new Rect(0, 0, 100, 100));

        assert.equal(a.ArrangedRect.X,      10);
        assert.equal(a.ArrangedRect.Y,      20);
        assert.equal(a.ArrangedRect.Width,  30);
        assert.equal(a.ArrangedRect.Height, 40);
        assert.equal(b.ArrangedRect.X,      50);
        assert.equal(b.ArrangedRect.Y,      5);
    });

    test('children without explicit Canvas.Left / Top default to (0, 0)', () => {
        const a = new FixedSizeLeaf(new Size(15, 25));
        // No Canvas.SetLeft / SetTop calls — defaults to 0.
        const canvas = new Canvas();
        canvas.AddChild(a);
        canvas.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));

        assert.equal(canvas.DesiredSize.Width,  15);
        assert.equal(canvas.DesiredSize.Height, 25);

        canvas.Arrange(new Rect(0, 0, 100, 100));
        assert.equal(a.ArrangedRect.X, 0);
        assert.equal(a.ArrangedRect.Y, 0);
    });

    test('empty canvas has zero size', () => {
        const canvas = new Canvas();
        canvas.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
        assert.equal(canvas.DesiredSize.Width,  0);
        assert.equal(canvas.DesiredSize.Height, 0);
    });

    test('Canvas.GetLeft / GetTop round-trip the values set via SetLeft / SetTop', () => {
        const leaf = new FixedSizeLeaf(new Size(10, 10));
        Canvas.SetLeft(leaf, 42);
        Canvas.SetTop(leaf,  17);
        assert.equal(Canvas.GetLeft(leaf), 42);
        assert.equal(Canvas.GetTop(leaf),  17);
    });

    test('attached properties are stored under Canvas, not on the Visual itself', () => {
        // Composite-key storage means setting Canvas.Left does not clash
        // with any 'Left' property a Visual subclass might register on
        // itself — they live in different namespaces ('Canvas.Left' vs
        // '<SubclassName>.Left').
        const leaf = new FixedSizeLeaf(new Size(10, 10));
        Canvas.SetLeft(leaf, 5);
        // Explicit-owner get goes to Canvas's slot — value comes back.
        assert.equal(leaf.get_property_value(resolveKey(leaf, Canvas, 'Left')), 5);
    });
});
