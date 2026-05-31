import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix, Point } from '../../runtime/index.js';
import { Transform, TranslateTransform, MatrixTransform } from '../index.js';

// Pins the v1 Transform hierarchy delivered by build-order step 12.2:
// Identity singleton, TranslateTransform (X/Y), MatrixTransform
// (escape hatch). Scale / Rotate / Group are intentionally deferred.

describe('Transform.Identity singleton', () => {
    test('exposes Matrix.Identity as its matrix', () => {
        assert.equal(Transform.Identity.Matrix, Matrix.Identity);
    });

    test('is the same instance on repeated access', () => {
        assert.equal(Transform.Identity, Transform.Identity);
    });

    test('IsIdentity short-circuit on the underlying Matrix is true', () => {
        assert.equal(Transform.Identity.Matrix.IsIdentity, true);
    });
});

describe('TranslateTransform', () => {
    test('defaults to X=0, Y=0 — Matrix is identity (zero translation)', () => {
        const t = new TranslateTransform();
        assert.equal(t.X, 0);
        assert.equal(t.Y, 0);
        assert.equal(t.Matrix.IsIdentity, true);
    });

    test('constructor accepts X and Y; Matrix.OffsetX / OffsetY reflect them', () => {
        const t = new TranslateTransform(5, 10);
        assert.equal(t.X, 5);
        assert.equal(t.Y, 10);
        const m = t.Matrix;
        assert.equal(m.OffsetX, 5);
        assert.equal(m.OffsetY, 10);
        assert.equal(m.M11, 1);
        assert.equal(m.M12, 0);
        assert.equal(m.M21, 0);
        assert.equal(m.M22, 1);
    });

    test('updating X or Y produces a freshly-computed Matrix', () => {
        const t = new TranslateTransform(1, 2);
        t.X = 100;
        const m1 = t.Matrix;
        assert.equal(m1.OffsetX, 100);
        assert.equal(m1.OffsetY, 2);

        t.Y = 200;
        const m2 = t.Matrix;
        assert.equal(m2.OffsetX, 100);
        assert.equal(m2.OffsetY, 200);
    });

    test('Matrix.Transform(point) translates the point by X, Y', () => {
        const t = new TranslateTransform(10, 20);
        const p = t.Matrix.Transform(new Point(5, 5));
        assert.equal(p.X, 15);
        assert.equal(p.Y, 25);
    });

    test('partial constructor — single arg sets X only, Y stays default', () => {
        const t = new TranslateTransform(5);
        assert.equal(t.X, 5);
        assert.equal(t.Y, 0);
    });
});

describe('MatrixTransform', () => {
    test('defaults to Matrix.Identity', () => {
        const t = new MatrixTransform();
        assert.equal(t.Matrix, Matrix.Identity);
    });

    test('constructor accepts a Matrix and exposes it', () => {
        const m = new Matrix(2, 0, 0, 2, 0, 0); // uniform 2× scale
        const t = new MatrixTransform(m);
        assert.equal(t.Matrix, m);
    });

    test('Matrix setter replaces the value', () => {
        const t = new MatrixTransform();
        const m = Matrix.Translate(7, 11);
        t.Matrix = m;
        assert.equal(t.Matrix, m);
    });

    test('a non-affine combined matrix (rotate+translate) round-trips through Transform.Matrix', () => {
        const m = Matrix.Rotate(Math.PI / 2).Multiply(Matrix.Translate(10, 20));
        const t = new MatrixTransform(m);
        assert.equal(t.Matrix, m);
    });
});
