import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rect, Point, Matrix } from '../../primitives.js';
import { buildTransformAttr } from '../svg-renderer.js';

test('no transforms and no offset -> undefined (no attribute)', () => {
    assert.equal(buildTransformAttr(new Rect(0, 0, 10, 10), undefined, undefined, Point.Zero), undefined);
});

test('layout matrix is emitted inner to the arrange offset', () => {
    const s = buildTransformAttr(new Rect(30, 40, 200, 150), Matrix.Scale(2, 3), undefined, Point.Zero);
    // translate to position (outer), then the layout matrix (rightmost = applied first)
    assert.equal(s, 'translate(30,40) matrix(2,0,0,3,0,0)');
});

test('offset only (no matrices) still emits a translate (regression)', () => {
    const s = buildTransformAttr(new Rect(5, 6, 10, 10), undefined, undefined, Point.Zero);
    assert.equal(s, 'translate(5,6)');
});

test('render transform (no layout) matches the legacy composition (regression)', () => {
    const s = buildTransformAttr(new Rect(0, 0, 10, 10), undefined, Matrix.Scale(2, 2), Point.Zero);
    assert.equal(s, 'matrix(2,0,0,2,0,0)');
});
