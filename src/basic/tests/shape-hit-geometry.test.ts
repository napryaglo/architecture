import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Point, Rect, Size } from '../../runtime/index.js';
import { EllipseGeometry, RectangleGeometry } from '../../visual-engine/index.js';
import { Shape } from '../shapes/shape.js';

describe('Shape base — HitTestGeometry from buildGeometry', () => {
    test('1:1 Geometry becomes the hit region; a bbox corner falls through', () => {
        const s = new Shape();
        // Ellipse whose bounds are exactly the 100×100 slot (1:1, no fit).
        s.Geometry = new EllipseGeometry(new Point(50, 50), 50, 50);
        s.Width = 100; s.Height = 100;
        s.Measure(new Size(100, 100));
        s.Arrange(new Rect(0, 0, 100, 100));

        const hit = s.HitTestGeometry;
        assert.ok(hit !== undefined, 'HitTestGeometry set after arrange');
        assert.equal(hit, s.Geometry, 'the 1:1 geometry is the hit region');
        assert.ok(hit!.Contains(new Point(50, 50)), 'centre is inside');
        assert.ok(!hit!.Contains(new Point(2, 2)), 'bbox corner is outside the ellipse');
    });

    test('a geometry that needs a fit transform is deferred (no hit region)', () => {
        const s = new Shape();
        // 24×24 geometry in a 12×12 slot → needs a 0.5 fit → deferred.
        s.Geometry = new RectangleGeometry(new Rect(0, 0, 24, 24));
        s.Width = 12; s.Height = 12;
        s.Measure(new Size(12, 12));
        s.Arrange(new Rect(0, 0, 12, 12));
        assert.equal(s.HitTestGeometry, undefined);
    });

    test('HitTestStrokeWidth > 0 opts out (keeps the transparent hit band)', () => {
        const s = new Shape();
        s.Geometry = new RectangleGeometry(new Rect(0, 0, 100, 100));
        s.Width = 100; s.Height = 100;
        s.HitTestStrokeWidth = 8;
        s.Measure(new Size(100, 100));
        s.Arrange(new Rect(0, 0, 100, 100));
        assert.equal(s.HitTestGeometry, undefined);
    });

    test('degenerate arranged size yields no hit region', () => {
        const s = new Shape();
        s.Geometry = new RectangleGeometry(new Rect(0, 0, 100, 100));
        s.Measure(new Size(800, 600));
        s.Arrange(new Rect(0, 0, 0, 0));
        assert.equal(s.HitTestGeometry, undefined);
    });

    test('no Geometry set yields no hit region (Line/Arc case)', () => {
        const s = new Shape();
        s.Width = 100; s.Height = 40;
        s.Measure(new Size(100, 40));
        s.Arrange(new Rect(0, 0, 100, 40));
        assert.equal(s.HitTestGeometry, undefined);
    });
});
