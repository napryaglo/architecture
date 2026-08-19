import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Size } from '../../../runtime/index.js';
import { PathGeometry, RectangleGeometry, type Geometry } from '../../../visual-engine/index.js';
import { Figure } from '../figure.js';

// The design contract lives on the geometry seams the inherited Visual paint +
// child-clip read: buildPaintGeometry (own paint), buildChildClipGeometry
// (children mask), buildClipGeometry (hit / clip-to-bounds). A catalog Figure
// surfaces its scaled silhouette (a PathGeometry) through all three; a shapeless
// container falls back to the base bounds rect (a RectangleGeometry) and paints
// nothing (RenderOverride guard). Own-paint emission itself is exercised by the
// base Visual/Border tests — a headless Figure has RenderSize 0 (no theme).

interface Seams {
    buildPaintGeometry(size: Size, inset: number): Geometry;
    buildClipGeometry(size: Size): Geometry;
    buildChildClipGeometry(size: Size): Geometry | undefined;
}
const seams = (f: Figure): Seams => f as unknown as Seams;

test('a catalog Figure surfaces its silhouette (a PathGeometry) as paint + clip geometry', () => {
    const f = Figure.fromKind('ellipse', 0, 0, { width: 80, height: 60 });
    f.Width = 80; f.Height = 60;
    const paint = seams(f).buildPaintGeometry(new Size(80, 60), 0);
    const clip = seams(f).buildClipGeometry(new Size(80, 60));
    assert.ok(paint instanceof PathGeometry, 'paint geometry is the silhouette, not a bounds rect');
    assert.ok(clip instanceof PathGeometry);
    const b = paint.GetBounds();
    assert.ok(Math.abs(b.Width - 80) < 1 && Math.abs(b.Height - 60) < 1);
});

test('a bare Figure has no shape: clips its content to the bounds rect (ClipToBounds default true)', () => {
    const f = new Figure();
    assert.equal(f.ClipToBounds, true);
    assert.equal(f._getSource(), undefined);
    const paint = seams(f).buildPaintGeometry(new Size(40, 40), 0);
    assert.ok(paint instanceof RectangleGeometry, 'no silhouette → base bounds rect (guard paints nothing)');
    const childClip = seams(f).buildChildClipGeometry(new Size(40, 40));
    assert.ok(childClip instanceof RectangleGeometry, 'shapeless node clips children to the bounds rect');
});

test('a shaped Figure turns ClipToBounds on and clips children to the silhouette', () => {
    const f = Figure.fromKind('ellipse', 0, 0, { width: 80, height: 60 });
    f.Width = 80; f.Height = 60;
    assert.equal(f.ClipToBounds, true);
    const childClip = seams(f).buildChildClipGeometry(new Size(80, 60));
    assert.ok(childClip instanceof PathGeometry);
});

test('resize rescales the silhouette', () => {
    const f = Figure.fromKind('rectangle', 0, 0, { width: 40, height: 40 });
    f.Width = 120; f.Height = 30;
    const b = seams(f).buildPaintGeometry(new Size(120, 30), 0).GetBounds();
    assert.ok(Math.abs(b.Width - 120) < 1 && Math.abs(b.Height - 30) < 1);
});
