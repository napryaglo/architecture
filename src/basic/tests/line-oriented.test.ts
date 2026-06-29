// Line shape — oriented (stretch-and-fill) mode vs. two-point mode.
//
// Orientation unset → endpoints (X1,Y1)-(X2,Y2). Orientation set →
// endpoints ignored; the line stretches to its slot and draws across the
// slot centre (Horizontal spans width at mid-height, Vertical spans
// height at mid-width). Cross-axis desired size is the stroke thickness.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Color, Point, Rect, Size, type DrawingContext } from '../../runtime/index.js';
import { Brush, Pen, SolidColorBrush, LineGeometry } from '../../visual-engine/index.js';
import type { Transform } from '../../visual-engine/drawing/transform.js';
import { Orientation } from '../panels/stack-panel.js';
import { Line } from '../shapes/line.js';

class CapturingContext implements DrawingContext
{
    public geoms: LineGeometry[] = [];
    DrawGeometry(_b: Brush | undefined, _p: Pen | undefined, g: unknown): void
    { this.geoms.push(g as LineGeometry); }
    DrawRectangle(): void { throw new Error('not used'); }
    DrawText():      void { throw new Error('not used'); }
    PushTransform(_t: Transform): void { /* no-op */ }
    PushClip():      void { /* no-op */ }
    Pop():           void { /* no-op */ }
}

function makeLine(thickness: number): Line
{
    const l = new Line();
    l.Stroke = new Pen(new SolidColorBrush(Color.Black), thickness);
    return l;
}

function render(l: Line): LineGeometry
{
    const dc = new CapturingContext();
    l.Render(dc);
    assert.equal(dc.geoms.length, 1, 'one geometry painted');
    return dc.geoms[0]!;
}

describe('Line — oriented (stretch-and-fill) mode', () => {

    test('Horizontal: cross-axis desire is the stroke thickness, main axis zero (Stretch fills)', () => {
        const l = makeLine(2);
        l.Orientation = Orientation.Horizontal;
        l.Measure(new Size(500, 50));
        assert.equal(l.DesiredSize.Width, 0, 'main axis collapses so Stretch fills it');
        assert.equal(l.DesiredSize.Height, 2, 'cross axis = stroke thickness');
    });

    test('Vertical: cross-axis desire is the stroke thickness, main axis zero', () => {
        const l = makeLine(3);
        l.Orientation = Orientation.Vertical;
        l.Measure(new Size(50, 500));
        assert.equal(l.DesiredSize.Width, 3, 'cross axis = stroke thickness');
        assert.equal(l.DesiredSize.Height, 0, 'main axis collapses so Stretch fills it');
    });

    test('Horizontal: draws across the full slot width at mid-height', () => {
        const l = makeLine(2);
        l.Orientation = Orientation.Horizontal;
        l.Measure(new Size(200, 2));
        l.Arrange(new Rect(0, 0, 200, 40));
        const g = render(l);
        assert.deepEqual([g.StartPoint.X, g.StartPoint.Y], [0, 20], 'starts at left edge, mid-height');
        assert.deepEqual([g.EndPoint.X, g.EndPoint.Y], [200, 20], 'ends at right edge, mid-height');
    });

    test('Vertical: draws across the full slot height at mid-width', () => {
        const l = makeLine(2);
        l.Orientation = Orientation.Vertical;
        l.Measure(new Size(2, 200));
        l.Arrange(new Rect(0, 0, 30, 200));
        const g = render(l);
        assert.deepEqual([g.StartPoint.X, g.StartPoint.Y], [15, 0], 'starts at top edge, mid-width');
        assert.deepEqual([g.EndPoint.X, g.EndPoint.Y], [15, 200], 'ends at bottom edge, mid-width');
    });

    test('oriented mode ignores the endpoint DPs', () => {
        const l = makeLine(2);
        l.X1 = 99; l.Y1 = 99; l.X2 = 7; l.Y2 = 7;
        l.Orientation = Orientation.Horizontal;
        l.Arrange(new Rect(0, 0, 100, 10));
        const g = render(l);
        assert.deepEqual([g.StartPoint.X, g.StartPoint.Y], [0, 5]);
        assert.deepEqual([g.EndPoint.X, g.EndPoint.Y], [100, 5]);
    });
});

describe('Line — two-point mode (Orientation unset) is unchanged', () => {

    test('measures to the endpoint bounding box + half stroke each side', () => {
        const l = makeLine(4);
        l.X1 = 10; l.Y1 = 0; l.X2 = 60; l.Y2 = 30;
        l.Measure(new Size(1000, 1000));
        assert.equal(l.DesiredSize.Width, 64, 'max(X)=60 + half(2)*2');
        assert.equal(l.DesiredSize.Height, 34, 'max(Y)=30 + half(2)*2');
    });

    test('draws from (X1,Y1) to (X2,Y2)', () => {
        const l = makeLine(2);
        l.X1 = 5; l.Y1 = 8; l.X2 = 40; l.Y2 = 8;
        l.Measure(new Size(1000, 1000));
        l.Arrange(new Rect(0, 0, 42, 10));
        const g = render(l);
        assert.deepEqual([g.StartPoint.X, g.StartPoint.Y], [5, 8]);
        assert.deepEqual([g.EndPoint.X, g.EndPoint.Y], [40, 8]);
    });
});
