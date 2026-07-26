import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { svgToGeometryJs, svgToIconJs } from '../svg-geometry.js';
import { IconDefinition } from '../../basic/index.js';
import { Color, Rect, RectangleGeometry } from '../../visual-engine/index.js';

// svgToGeometryJs lifts build-icons' geometry serialization: SVG → a JS
// expression constructing ONE Geometry (paint dropped), plus the exact
// visual-engine names it references.

describe('svgToGeometryJs', () => {

    test('single-shape SVG → the geometry directly (no GeometryGroup wrap)', () => {
        const svg = `<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20"/></svg>`;
        const { valueJs, names } = svgToGeometryJs(svg);
        assert.match(valueJs, /^new RectangleGeometry\(new Rect\(2, 2, 20, 20\)/);
        assert.doesNotMatch(valueJs, /GeometryGroup/);
        // Reports exactly the names it used — nothing more.
        assert.deepEqual([...names], ['Rect', 'RectangleGeometry']);
    });

    test('multi-shape SVG → a GeometryGroup, names include GeometryGroup', () => {
        const svg = `<svg viewBox="0 0 24 24">
            <rect x="0" y="0" width="10" height="10"/>
            <circle cx="18" cy="18" r="4"/>
        </svg>`;
        const { valueJs, names } = svgToGeometryJs(svg);
        assert.match(valueJs, /^new GeometryGroup\(\[/);
        assert.match(valueJs, /RectangleGeometry/);
        assert.match(valueJs, /EllipseGeometry/);
        assert.ok(names.includes('GeometryGroup'));
        assert.ok(names.includes('Point'));   // ellipse center
    });

    test('path data → PathGeometry with figures/segments', () => {
        const svg = `<svg viewBox="0 0 24 24"><path d="M2,2 L20,2 L20,20 Z"/></svg>`;
        const { valueJs, names } = svgToGeometryJs(svg);
        assert.match(valueJs, /new PathGeometry\(\[new PathFigure\(/);
        assert.match(valueJs, /new LineSegment\(/);
        assert.ok(names.includes('PathGeometry'));
        assert.ok(names.includes('PathFigure'));
        assert.ok(names.includes('LineSegment'));
    });

    test('emitted expression is valid JS (parses without throwing)', () => {
        const svg = `<svg viewBox="0 0 24 24"><path d="M2,2 L20,20"/></svg>`;
        const { valueJs } = svgToGeometryJs(svg);
        // new Function over the bare-name expression with the referenced
        // names stubbed proves it's syntactically well-formed.
        const ctorStub = function (this: unknown) { /* no-op */ };
        assert.doesNotThrow(() => new Function(
            'PathGeometry', 'PathFigure', 'Point', 'LineSegment',
            `return (${valueJs});`,
        )(ctorStub, ctorStub, ctorStub, ctorStub));
    });
});

describe('svgToIconJs', () => {

    test('colored multi-shape SVG → an IconDefinition preserving each fill', () => {
        const svg = `<svg viewBox="0 0 24 24">
            <rect x="0" y="0" width="10" height="10" fill="#ff0000"/>
            <circle cx="18" cy="18" r="4" fill="rgb(0,128,0)"/>
        </svg>`;
        const { valueJs, imports } = svgToIconJs(svg);
        assert.match(valueJs, /^new IconDefinition\(24, 24, \[/);
        assert.match(valueJs, /Fill: new Color\(255, 0, 0, 255\)/);
        assert.match(valueJs, /Fill: new Color\(0, 128, 0, 255\)/);
        // IconDefinition imported from basic; Color + geometry from visual-engine.
        const basic = imports.find(i => i.module === '@pragmatic-lab/mural/basic');
        const ve    = imports.find(i => i.module === '@pragmatic-lab/mural/visual-engine');
        assert.deepEqual([...basic!.names], ['IconDefinition']);
        assert.ok(ve!.names.includes('Color'));
        assert.ok(ve!.names.includes('RectangleGeometry'));
        assert.ok(ve!.names.includes('EllipseGeometry'));
    });

    test('unspecified / currentColor fill → black; fill="none" → undefined', () => {
        const svg = `<svg viewBox="0 0 24 24">
            <path d="M0 0L1 1"/>
            <path d="M2 2L3 3" fill="none"/>
        </svg>`;
        const { valueJs } = svgToIconJs(svg);
        assert.match(valueJs, /Fill: new Color\(0, 0, 0, 255\)/);
        assert.match(valueJs, /Fill: undefined/);
    });

    test('emitted expression evaluates to a faithful IconDefinition', () => {
        const svg = `<svg viewBox="0 0 24 24"><rect x="1" y="1" width="8" height="8" fill="#0000ff"/></svg>`;
        const { valueJs } = svgToIconJs(svg);
        // Evaluate the bare-name expression against the real ctors.
        const factory = new Function(
            'IconDefinition', 'Color', 'RectangleGeometry', 'Rect',
            `return (${valueJs});`);
        const def = factory(IconDefinition, Color, RectangleGeometry, Rect);
        assert.equal(def.ViewBoxWidth, 24);
        assert.equal(def.Shapes.length, 1);
        assert.equal(def.Shapes[0].Fill.B, 255);
        assert.equal(def.Shapes[0].Fill.R, 0);
    });
});
