import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Adorner,
    AdornerDecorator,
    AdornerLayer,
    Application,
    Rect,
    Size,
    Visual,
    type DrawingContext,
} from '../index.js';
import { Border } from '../../basic/border.js';
import { Canvas } from '../../basic/panels/canvas.js';

// Concrete leaf for placement/size assertions. Reports the size given
// to its constructor and paints nothing.
class FixedSquare extends Visual
{
    constructor(side: number)
    {
        super();
        this.Width  = side;
        this.Height = side;
    }
    protected override MeasureOverride(_a: Size): Size { return Size.Zero; }
    protected override RenderOverride(_dc: DrawingContext): void {}
}

// Concrete adorner with a chosen natural size and an optional inset.
// Default Placement returns the adorned rect; subclassing here lets us
// inspect what the layer arranged it at without mocking the abstract
// base.
class TestAdorner extends Adorner
{
    constructor(adornedElement: Visual, private readonly natural: Size = new Size(10, 10))
    { super(adornedElement); }
    protected override MeasureOverride(_a: Size): Size { return this.natural; }
    protected override RenderOverride(_dc: DrawingContext): void {}
}

// Materialise a decorator with a Canvas containing the given squares
// at explicit (x, y) positions, run a synchronous layout pass, and
// return both the decorator and the squares so tests can adorn them.
// Canvas + Canvas.Left/Top puts each square at a known coordinate —
// deterministic input for placement assertions, without the alignment-
// related arithmetic StackPanel would introduce.
function layout(...placements: Array<{ x: number; y: number; side: number }>)
{
    const decorator = new AdornerDecorator();
    const canvas = new Canvas();
    decorator.Child = canvas;
    const squares: FixedSquare[] = [];
    for (const p of placements)
    {
        const sq = new FixedSquare(p.side);
        Canvas.SetLeft(sq, p.x);
        Canvas.SetTop(sq,  p.y);
        canvas.AddChild(sq);
        squares.push(sq);
    }
    const host = new Border();
    host.SetChild(decorator);
    host.Measure(new Size(400, 400));
    host.Arrange(new Rect(0, 0, 400, 400));
    return { decorator, canvas, squares };
}

describe('AdornerDecorator', () => {
    beforeEach(() => { Application.current = null; });

    test('exposes an AdornerLayer that paints AFTER the Child', () => {
        const { decorator } = layout({ x: 0, y: 0, side: 20 });
        assert.ok(decorator.AdornerLayer instanceof AdornerLayer);
        // visualChildren ordering: Child first (renderer walks first =
        // paints first = sits BEHIND), AdornerLayer second.
        const order = decorator.visualChildren;
        assert.equal(order.length, 2);
        assert.equal(order[1], decorator.AdornerLayer);
    });

    test('logicalChildren contains only Child — the layer is a visual-only host', () => {
        const { decorator } = layout({ x: 0, y: 0, side: 20 });
        assert.equal(decorator.logicalChildren.length, 1);
    });

    test('clearing Child detaches it', () => {
        const { decorator } = layout({ x: 0, y: 0, side: 20 });
        const child = decorator.Child!;
        decorator.Child = undefined;
        assert.equal(decorator.Child, undefined);
        assert.equal(child.GetVisualParent(), undefined);
    });
});

describe('AdornerLayer.GetAdornerLayer', () => {
    beforeEach(() => { Application.current = null; });

    test('walks up to the nearest AdornerDecorator', () => {
        const { decorator, squares } = layout({ x: 0, y: 0, side: 20 });
        const layer = AdornerLayer.GetAdornerLayer(squares[0]!);
        assert.equal(layer, decorator.AdornerLayer);
    });

    test('returns undefined when no ancestor is an AdornerDecorator', () => {
        const square = new FixedSquare(20);
        const host = new Border();
        host.SetChild(square);
        assert.equal(AdornerLayer.GetAdornerLayer(square), undefined);
    });
});

describe('AdornerLayer arrange', () => {
    beforeEach(() => { Application.current = null; });

    test('positions an adorner at its adorned element\'s rect in the layer frame', () => {
        const { decorator, squares } = layout(
            { x: 10, y: 20, side: 30 },
            { x: 80, y: 90, side: 40 },
        );
        const second = squares[1]!;
        const adorner = new TestAdorner(second);
        decorator.AdornerLayer.Add(adorner);
        decorator.InvalidateMeasure();
        decorator.Measure(new Size(400, 400));
        decorator.Arrange(new Rect(0, 0, 400, 400));
        const r = adorner.ArrangedRect;
        assert.equal(r.X, 80);
        assert.equal(r.Y, 90);
        assert.equal(r.Width,  40);
        assert.equal(r.Height, 40);
    });

    test('multiple adorners on the same target both arrange at that target\'s rect', () => {
        const { decorator, squares } = layout(
            { x: 0,  y: 0,  side: 20 },
            { x: 50, y: 60, side: 30 },
        );
        const target = squares[1]!;
        const a = new TestAdorner(target);
        const b = new TestAdorner(target);
        decorator.AdornerLayer.Add(a);
        decorator.AdornerLayer.Add(b);
        decorator.InvalidateMeasure();
        decorator.Measure(new Size(400, 400));
        decorator.Arrange(new Rect(0, 0, 400, 400));
        assert.equal(a.ArrangedRect.X, 50);
        assert.equal(a.ArrangedRect.Y, 60);
        assert.equal(b.ArrangedRect.X, 50);
        assert.equal(b.ArrangedRect.Y, 60);
    });

    test('GetAdorners returns adorners scoped to the requested element', () => {
        const { decorator, squares } = layout(
            { x: 0, y: 0, side: 20 },
            { x: 0, y: 30, side: 20 },
            { x: 0, y: 60, side: 20 },
        );
        const a0 = new TestAdorner(squares[0]!);
        const a1 = new TestAdorner(squares[1]!);
        const a1b = new TestAdorner(squares[1]!);
        decorator.AdornerLayer.Add(a0);
        decorator.AdornerLayer.Add(a1);
        decorator.AdornerLayer.Add(a1b);
        const forFirst = decorator.AdornerLayer.GetAdorners(squares[0]!);
        const forSecond = decorator.AdornerLayer.GetAdorners(squares[1]!);
        assert.deepEqual([...forFirst!], [a0]);
        assert.deepEqual([...forSecond!], [a1, a1b]);
        assert.equal(decorator.AdornerLayer.GetAdorners(squares[2]!), undefined);
    });

    test('Adorner.Placement override repositions away from the adorned rect', () => {
        const { decorator, squares } = layout({ x: 0, y: 0, side: 40 });
        const target = squares[0]!;
        class OffsetAdorner extends Adorner
        {
            protected override MeasureOverride(_a: Size): Size { return new Size(8, 8); }
            public override Placement(adorned: Rect, desired: Size): Rect
            {
                // Sit at the bottom-right corner.
                return new Rect(
                    adorned.X + adorned.Width  - desired.Width,
                    adorned.Y + adorned.Height - desired.Height,
                    desired.Width, desired.Height);
            }
            protected override RenderOverride(_dc: DrawingContext): void {}
        }
        const adorner = new OffsetAdorner(target);
        decorator.AdornerLayer.Add(adorner);
        decorator.InvalidateMeasure();
        decorator.Measure(new Size(400, 400));
        decorator.Arrange(new Rect(0, 0, 400, 400));
        const r = adorner.ArrangedRect;
        assert.equal(r.X, 32);
        assert.equal(r.Y, 32);
        assert.equal(r.Width,  8);
        assert.equal(r.Height, 8);
    });

    test('Remove drops the adorner from the layer', () => {
        const { decorator, squares } = layout({ x: 0, y: 0, side: 20 });
        const a = new TestAdorner(squares[0]!);
        decorator.AdornerLayer.Add(a);
        assert.equal(decorator.AdornerLayer.visualChildren.length, 1);
        decorator.AdornerLayer.Remove(a);
        assert.equal(decorator.AdornerLayer.visualChildren.length, 0);
    });

    test('adorned element not under the decorator falls back to layer origin', () => {
        const { decorator } = layout({ x: 0, y: 0, side: 20 });
        const orphan = new FixedSquare(20);
        const adorner = new TestAdorner(orphan);
        decorator.AdornerLayer.Add(adorner);
        decorator.InvalidateMeasure();
        decorator.Measure(new Size(400, 400));
        decorator.Arrange(new Rect(0, 0, 400, 400));
        const r = adorner.ArrangedRect;
        assert.equal(r.X, 0);
        assert.equal(r.Y, 0);
    });
});
