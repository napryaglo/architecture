import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    CURRENT_COLOR,
    Icon,
    parsePathData,
    parseSvgIcon,
} from '../index.js';
import {
    CubicBezierSegment,
    EllipseGeometry,
    LineSegment,
    PathGeometry,
    PathFigure,
    RectangleGeometry,
    Size,
} from '../../visual-engine/index.js';

// ── Path-data parser ─────────────────────────────────────────────────

describe('parsePathData', () =>
{
    test('M + L + Z produces a closed line figure', () =>
    {
        const figures = parsePathData('M 10 20 L 30 40 Z');
        assert.equal(figures.length, 1);
        const f = figures[0]!;
        assert.equal(f.StartPoint.X, 10);
        assert.equal(f.StartPoint.Y, 20);
        assert.equal(f.IsClosed, true);
        assert.equal(f.Segments.length, 1);
        assert.ok(f.Segments[0] instanceof LineSegment);
        assert.equal((f.Segments[0] as LineSegment).Point.X, 30);
    });

    test('relative l accumulates from current point', () =>
    {
        const figures = parsePathData('M 10 10 l 5 5 l 5 0');
        const seg0 = figures[0]!.Segments[0] as LineSegment;
        const seg1 = figures[0]!.Segments[1] as LineSegment;
        assert.equal(seg0.Point.X, 15);
        assert.equal(seg0.Point.Y, 15);
        assert.equal(seg1.Point.X, 20);
        assert.equal(seg1.Point.Y, 15);
    });

    test('H / V emit horizontal / vertical lines', () =>
    {
        const figures = parsePathData('M 0 0 H 10 V 20');
        const segs = figures[0]!.Segments;
        assert.equal((segs[0] as LineSegment).Point.X, 10);
        assert.equal((segs[0] as LineSegment).Point.Y, 0);
        assert.equal((segs[1] as LineSegment).Point.X, 10);
        assert.equal((segs[1] as LineSegment).Point.Y, 20);
    });

    test('C cubic bezier', () =>
    {
        const figures = parsePathData('M 0 0 C 10 0 20 10 30 10');
        const seg = figures[0]!.Segments[0] as CubicBezierSegment;
        assert.equal(seg.Point1.X, 10);
        assert.equal(seg.Point3.X, 30);
    });

    test('S reflects previous cubic control point', () =>
    {
        // After "C 10 0 20 10 30 10" the second cubic ctrl is (20,10);
        // reflecting about the new pen (30,10) gives (40,10).
        const figures = parsePathData('M 0 0 C 10 0 20 10 30 10 S 50 30 60 30');
        const segs = figures[0]!.Segments;
        const s = segs[1] as CubicBezierSegment;
        assert.equal(s.Point1.X, 40);
        assert.equal(s.Point1.Y, 10);
        assert.equal(s.Point2.X, 50);
        assert.equal(s.Point3.X, 60);
    });

    test('implicit-repeat M-then-numbers treats follow-on pairs as L', () =>
    {
        // "M 10 10 20 20 30 30" — two implicit Ls.
        const figures = parsePathData('M 10 10 20 20 30 30');
        const segs = figures[0]!.Segments;
        assert.equal(segs.length, 2);
        assert.equal((segs[0] as LineSegment).Point.X, 20);
        assert.equal((segs[1] as LineSegment).Point.X, 30);
    });

    test('multiple M commands open separate figures', () =>
    {
        const figures = parsePathData('M 0 0 L 10 10 Z M 50 50 L 60 60 Z');
        assert.equal(figures.length, 2);
        assert.equal(figures[0]!.StartPoint.X, 0);
        assert.equal(figures[1]!.StartPoint.X, 50);
    });

    test('tokenizer handles negative numbers without separators', () =>
    {
        // "M10-20-30 40" — minus is its own separator.
        const figures = parsePathData('M10-20-30 40');
        assert.equal(figures[0]!.StartPoint.X, 10);
        assert.equal(figures[0]!.StartPoint.Y, -20);
        const seg = figures[0]!.Segments[0] as LineSegment;
        assert.equal(seg.Point.X, -30);
        assert.equal(seg.Point.Y, 40);
    });
});

// ── SVG element parser ──────────────────────────────────────────────

describe('parseSvgIcon', () =>
{
    test('extracts viewBox + paths', () =>
    {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M 0 0 L 24 24"/>
        </svg>`;
        const def = parseSvgIcon(svg);
        assert.equal(def.ViewBoxWidth,  24);
        assert.equal(def.ViewBoxHeight, 24);
        assert.equal(def.Shapes.length, 1);
        assert.ok(def.Shapes[0]!.Geometry instanceof PathGeometry);
    });

    test('rect / circle / ellipse / line lower to native geometries', () =>
    {
        const svg = `<svg viewBox="0 0 100 100">
            <rect x="10" y="10" width="20" height="30" rx="2"/>
            <circle cx="50" cy="50" r="10"/>
            <ellipse cx="80" cy="80" rx="5" ry="3"/>
            <line x1="0" y1="0" x2="100" y2="100"/>
        </svg>`;
        const def = parseSvgIcon(svg);
        assert.equal(def.Shapes.length, 4);
        assert.ok(def.Shapes[0]!.Geometry instanceof RectangleGeometry);
        assert.ok(def.Shapes[1]!.Geometry instanceof EllipseGeometry);  // circle
        assert.ok(def.Shapes[2]!.Geometry instanceof EllipseGeometry);
    });

    test('default-fill becomes currentColor (Recolor-friendly)', () =>
    {
        const svg = `<svg viewBox="0 0 24 24"><path d="M0 0L1 1"/></svg>`;
        const def = parseSvgIcon(svg);
        assert.equal(def.Shapes[0]!.Fill, CURRENT_COLOR);
    });

    test('fill="none" becomes undefined', () =>
    {
        const svg = `<svg viewBox="0 0 24 24"><path d="M0 0L1 1" fill="none"/></svg>`;
        const def = parseSvgIcon(svg);
        assert.equal(def.Shapes[0]!.Fill, undefined);
    });

    test('group fill inherits to child shape', () =>
    {
        const svg = `<svg viewBox="0 0 24 24">
            <g fill="#ff0000">
                <path d="M0 0L1 1"/>
            </g>
        </svg>`;
        const def = parseSvgIcon(svg);
        assert.equal(def.Shapes.length, 1);
        // Authored color: should NOT be currentColor.
        assert.notEqual(def.Shapes[0]!.Fill, CURRENT_COLOR);
        assert.notEqual(def.Shapes[0]!.Fill, undefined);
    });

    test('child shape overrides group fill', () =>
    {
        const svg = `<svg viewBox="0 0 24 24">
            <g fill="#ff0000">
                <path d="M0 0L1 1" fill="none"/>
            </g>
        </svg>`;
        const def = parseSvgIcon(svg);
        assert.equal(def.Shapes[0]!.Fill, undefined);
    });
});

// ── Icon control ────────────────────────────────────────────────────

describe('Icon control', () =>
{
    test('MeasureOverride returns viewBox size for unsized icon', () =>
    {
        const svg = `<svg viewBox="0 0 24 24"><path d="M0 0L24 24"/></svg>`;
        const def = parseSvgIcon(svg);
        const icon = new Icon();
        icon.Source = def;
        icon.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
        assert.equal(icon.DesiredSize.Width,  24);
        assert.equal(icon.DesiredSize.Height, 24);
    });

    test('explicit Width / Height override viewBox size', () =>
    {
        const svg = `<svg viewBox="0 0 24 24"><path d="M0 0L24 24"/></svg>`;
        const def = parseSvgIcon(svg);
        const icon = new Icon();
        icon.Source = def;
        icon.Width  = 48;
        icon.Height = 48;
        icon.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
        assert.equal(icon.DesiredSize.Width,  48);
        assert.equal(icon.DesiredSize.Height, 48);
    });

    test('undefined Source falls back to 24×24 icon-grid size', () =>
    {
        // Reserve the standard icon footprint even before the binding
        // resolves — otherwise a StackPanel allocates 0 to the icon at
        // first measure and doesn't reflow when Source eventually
        // populates.
        const icon = new Icon();
        icon.Measure(new Size(100, 100));
        assert.equal(icon.DesiredSize.Width,  24);
        assert.equal(icon.DesiredSize.Height, 24);
    });

    test('Recolor default is true', () =>
    {
        assert.equal(new Icon().Recolor, true);
    });
});
