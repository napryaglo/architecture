import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Color, Point, Rect, Size } from '../../runtime/index.js';
import {
    ArcSegment,
    EllipseGeometry,
    GeometryGroup,
    LineGeometry,
    LineSegment,
    PathFigure,
    PathGeometry,
    Pen,
    RectangleGeometry,
    SolidColorBrush,
    SweepDirection,
    SvgDrawingContext,
} from '../index.js';

// Covers the DrawGeometry surface — ellipse, line, rectangle. The
// rect / text / transform paths are exercised through the existing
// HeadlessTarget tests; this file pins the geometry shapes.
describe('SvgDrawingContext.DrawGeometry', () => {
    test('EllipseGeometry emits <ellipse> with cx/cy/rx/ry plus fill & stroke', () => {
        const dc = new SvgDrawingContext();
        dc.DrawGeometry(
            new SolidColorBrush(Color.Red),
            new Pen(new SolidColorBrush(Color.Black), 2),
            new EllipseGeometry(new Point(50, 30), 20, 10),
        );
        const out = dc.ToFragment();
        assert.ok(out.startsWith('<ellipse '));
        assert.ok(out.includes('cx="50"'));
        assert.ok(out.includes('cy="30"'));
        assert.ok(out.includes('rx="20"'));
        assert.ok(out.includes('ry="10"'));
        assert.ok(out.includes('fill="rgb(255,0,0)"'));
        assert.ok(out.includes('stroke="rgb(0,0,0)"'));
        assert.ok(out.includes('stroke-width="2"'));
    });

    test('LineGeometry emits <line> with stroke and no fill attribute', () => {
        const dc = new SvgDrawingContext();
        dc.DrawGeometry(
            undefined,
            new Pen(new SolidColorBrush(Color.Blue), 3),
            new LineGeometry(new Point(0, 0), new Point(100, 100)),
        );
        const out = dc.ToFragment();
        assert.ok(out.startsWith('<line '));
        assert.ok(out.includes('x1="0"'));
        assert.ok(out.includes('y1="0"'));
        assert.ok(out.includes('x2="100"'));
        assert.ok(out.includes('y2="100"'));
        assert.ok(out.includes('stroke="rgb(0,0,255)"'));
        assert.ok(out.includes('stroke-width="3"'));
        // SVG <line> ignores fill — confirm we don't paint one.
        assert.equal(out.includes('fill='), false);
    });

    test('RectangleGeometry with zero radii emits a plain <rect>', () => {
        const dc = new SvgDrawingContext();
        dc.DrawGeometry(
            new SolidColorBrush(Color.Green),
            undefined,
            new RectangleGeometry(new Rect(10, 20, 30, 40)),
        );
        const out = dc.ToFragment();
        assert.ok(out.startsWith('<rect '));
        assert.ok(out.includes('x="10"'));
        assert.ok(out.includes('y="20"'));
        assert.ok(out.includes('width="30"'));
        assert.ok(out.includes('height="40"'));
        assert.ok(out.includes('fill="rgb(0,128,0)"'));
        // No rounded corners — rx / ry attributes must not appear.
        assert.equal(out.includes('rx='), false);
        assert.equal(out.includes('ry='), false);
    });

    test('RectangleGeometry with non-zero radii adds rx and ry', () => {
        const dc = new SvgDrawingContext();
        dc.DrawGeometry(
            new SolidColorBrush(Color.White),
            undefined,
            new RectangleGeometry(new Rect(0, 0, 50, 50), 8, 4),
        );
        const out = dc.ToFragment();
        assert.ok(out.includes('rx="8"'));
        assert.ok(out.includes('ry="4"'));
    });

    test('PathGeometry lowers to <path d="…"> with line + arc segments', () => {
        // Round-trip a closed figure with a LineSegment and a clockwise
        // ArcSegment — the canonical shape Border's non-uniform
        // CornerRadius path uses. Asserts the path emits and the
        // d-string contains both `L` and `A` commands plus the closing
        // `Z` from IsClosed=true.
        const dc = new SvgDrawingContext();
        dc.DrawGeometry(
            new SolidColorBrush(Color.Red), undefined,
            new PathGeometry([
                new PathFigure(
                    new Point(0, 0),
                    [
                        new LineSegment(new Point(10, 0)),
                        new ArcSegment(
                            new Point(20, 10),
                            new Size(10, 10), 0, false, SweepDirection.Clockwise),
                    ],
                    true,
                ),
            ]),
        );
        const out = dc.ToFragment();
        assert.ok(out.includes('<path '), 'emitted a <path> element');
        assert.match(out, /d="M 0 0 L 10 0 A 10 10 0 0 1 20 10 Z"/);
    });

    test('GeometryGroup still throws clearly — lowering deferred', () => {
        // PathGeometry now lowers to <path>; the remaining unsupported
        // geometry that should throw clearly is GeometryGroup
        // (deferred until a consumer needs CSG-style composition).
        const dc = new SvgDrawingContext();
        assert.throws(
            () => dc.DrawGeometry(undefined, undefined, new GeometryGroup()),
            /GeometryGroup not implemented/,
        );
    });
});
