import { MetaData, Matrix, Model } from '../../runtime/index.js';

// Renderer-agnostic transform node. Concrete subclasses:
//
//   * Identity            — shared singleton; no-op transform
//   * TranslateTransform  — X/Y offset
//   * MatrixTransform     — arbitrary 2D affine matrix (escape hatch)
//
// Deferred per build-order step 12.2 (skip scale/rotate/group for v1):
//   * ScaleTransform, RotateTransform, TransformGroup
//
// Identity's Matrix is precomputed once (`Matrix.Identity`), so the
// renderer's `if (transform === Transform.Identity) skip` short-circuit
// is a single reference compare on the hot path.
export abstract class Transform extends Model
{
    public abstract get Matrix(): Matrix;

    public static readonly Identity: Transform;
}

class IdentityTransform extends Transform
{
    public override get Matrix(): Matrix { return Matrix.Identity; }
}

// Initialized after IdentityTransform is defined to avoid a forward-ref
// error in the static initializer.
(Transform as { Identity: Transform }).Identity = new IdentityTransform();

// Pure translation by (X, Y). X and Y are bindable Model properties
// flagged Render — animating either fires the consumer Visual's render
// invalidation through the existing property-change pipeline.
export class TranslateTransform extends Transform
{
    public static readonly XKey = Model.RegisterProperty<number>(TranslateTransform, 'X', 0, MetaData.Render);
    public static readonly YKey = Model.RegisterProperty<number>(TranslateTransform, 'Y', 0, MetaData.Render);

    constructor(x?: number, y?: number)
    {
        super();
        if (x !== undefined) this.X = x;
        if (y !== undefined) this.Y = y;
    }

    public get X(): number { return this.get_property_value(TranslateTransform.XKey); }
    public set X(value: number) { this.set_property_value(TranslateTransform.XKey, value); }

    public get Y(): number { return this.get_property_value(TranslateTransform.YKey); }
    public set Y(value: number) { this.set_property_value(TranslateTransform.YKey, value); }

    public override get Matrix(): Matrix { return Matrix.Translate(this.X, this.Y); }
}

// Arbitrary 2D affine transform — the escape hatch when no specialized
// Transform subclass fits. Wraps a Matrix value type as a single bindable
// property. Combine with the TransformGroup pattern (deferred) for
// composed transforms; for now, multiply matrices yourself and assign
// the result.
export class MatrixTransform extends Transform
{
    public static readonly MatrixKey = Model.RegisterProperty<Matrix>(
        MatrixTransform, 'Matrix', Matrix.Identity, MetaData.Render);

    constructor(matrix?: Matrix)
    {
        super();
        if (matrix !== undefined) this.Matrix = matrix;
    }

    public override get Matrix(): Matrix { return this.get_property_value(MatrixTransform.MatrixKey); }
    public set Matrix(value: Matrix) { this.set_property_value(MatrixTransform.MatrixKey, value); }
}
