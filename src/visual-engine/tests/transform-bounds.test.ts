import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Size, Matrix, transformBounds } from '../index.js';

test('scale grows the bounding box by the scale factors', () => {
    const b = transformBounds(new Size(100, 50), Matrix.Scale(2, 3));
    assert.equal(b.Width, 200);
    assert.equal(b.Height, 150);
});

test('90-degree rotation swaps width and height', () => {
    const b = transformBounds(new Size(100, 50), Matrix.Rotate(Math.PI / 2));
    assert.ok(Math.abs(b.Width - 50) < 1e-9);
    assert.ok(Math.abs(b.Height - 100) < 1e-9);
});

test('identity leaves the size unchanged', () => {
    const b = transformBounds(new Size(100, 50), Matrix.Identity);
    assert.equal(b.Width, 100);
    assert.equal(b.Height, 50);
});
