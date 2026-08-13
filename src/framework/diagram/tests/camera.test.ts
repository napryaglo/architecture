import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Point, Rect, Size } from '../../../visual-engine/primitives.js';
import { cameraMatrix, zoomAtPoint, fitBounds, clampZoom, CAMERA_MIN, CAMERA_MAX } from '../camera.js';

test('cameraMatrix maps content->screen as content*zoom + pan', () => {
    const m = cameraMatrix({ zoom: 2, panX: 30, panY: 50 });
    const s = m.Transform(new Point(10, 10));
    assert.equal(s.X, 10 * 2 + 30);
    assert.equal(s.Y, 10 * 2 + 50);
});

test('zoomAtPoint keeps the content point under the pivot fixed', () => {
    const before = { zoom: 1, panX: 0, panY: 0 };
    const pivot = new Point(100, 80);
    const after = zoomAtPoint(before, pivot, 2);
    // The screen point that was at `pivot` must still be at `pivot`.
    const contentUnderPivot = cameraMatrix(before).Invert()!.Transform(pivot);
    const s = cameraMatrix(after).Transform(contentUnderPivot);
    assert.ok(Math.abs(s.X - pivot.X) < 1e-9);
    assert.ok(Math.abs(s.Y - pivot.Y) < 1e-9);
    assert.equal(after.zoom, 2);
});

test('zoomAtPoint clamps zoom to the interactive range', () => {
    assert.equal(zoomAtPoint({ zoom: CAMERA_MAX, panX: 0, panY: 0 }, new Point(0, 0), 2).zoom, CAMERA_MAX);
    assert.equal(zoomAtPoint({ zoom: CAMERA_MIN, panX: 0, panY: 0 }, new Point(0, 0), 0.5).zoom, CAMERA_MIN);
    assert.equal(clampZoom(99), CAMERA_MAX);
});

test('fitBounds centers content in the viewport with padding', () => {
    // 100x100 content, 500x300 viewport, 20 padding. Limiting axis is height:
    // (300-40)/100 = 2.6.
    const c = fitBounds(new Rect(0, 0, 100, 100), new Size(500, 300), 20);
    assert.ok(Math.abs(c.zoom - 2.6) < 1e-9);
    // content center (50,50) must map to the viewport center (250,150).
    const center = cameraMatrix(c).Transform(new Point(50, 50));
    assert.ok(Math.abs(center.X - 250) < 1e-9);
    assert.ok(Math.abs(center.Y - 150) < 1e-9);
});
