import {
    MetaData,
    Matrix,
    Model,
    ObservableCollection,
    type PropertyDescriptor,
    type ITransform,
} from '../../runtime/index.js';

// Renderer-agnostic transform node. Implements ITransform so it can
// drop into Visual.RenderTransform — the SVG renderer reads `Matrix`
// and composes it with ArrangedRect + RenderTransformOrigin into the
// outer <g>'s transform attribute. Same Transform tree also feeds
// Geometry.Transform for shape-local affines.
//
// Concrete subclasses:
//
//   * Identity            — shared singleton; no-op transform
//   * TranslateTransform  — X / Y offset
//   * RotateTransform     — Angle (degrees) around (CenterX, CenterY)
//   * ScaleTransform      — ScaleX / ScaleY around (CenterX, CenterY)
//   * SkewTransform       — AngleX / AngleY (degrees) around (CenterX, CenterY)
//   * MatrixTransform     — arbitrary 2D affine matrix (escape hatch)
//   * TransformGroup      — composition of an ordered Children list
//
// Per-frame inner-DP changes (Angle tweening from 0 → 45,
// ScaleX bound to a slider, Children.Add on a TransformGroup) reach
// the owning Visual through the ITransform `_setRenderInvalidator`
// hook, installed by Visual when the DP is set and cleared on swap-
// out. Single-consumer: assigning the same Transform instance to
// two Visuals' RenderTransform clobbers the first owner's
// invalidator. Match WPF Freezable: clone before sharing.
//
// Identity's Matrix is precomputed once (`Matrix.Identity`), so the
// renderer's `if (transform === Transform.Identity) skip` short-circuit
// is a single reference compare on the hot path.
export abstract class Transform extends Model implements ITransform
{
    public abstract get Matrix(): Matrix;

    public static readonly Identity: Transform;

    // Bound to the owning Visual's render-invalidator when this
    // Transform is assigned to Visual.RenderTransform. Inner-DP
    // changes fire it via the OnPropertyChanged override below.
    // Undefined when this Transform isn't currently driving any
    // Visual (a fresh instance, a value held in a setter pipeline,
    // or one detached by RenderTransform = undefined).
    private _invalidator: (() => void) | undefined;

    public _setRenderInvalidator(fn: (() => void) | undefined): void
    {
        this._invalidator = fn;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        old_value:  any,
        new_value:  any,
    ): void
    {
        super.OnPropertyChanged(descriptor, old_value, new_value);
        // Any property change on this Transform — Angle, ScaleX, X,
        // CenterY, Matrix — pushes a render invalidation up to the
        // owning Visual when one is attached. The invalidator
        // identity comparison in the install path keeps this from
        // double-firing on the same Visual.
        this._invalidator?.();
    }
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

// Rotation by `Angle` degrees around (CenterX, CenterY). CenterX and
// CenterY are absolute coordinates in the Transform's local space (NOT
// fractions — that role is played by Visual.RenderTransformOrigin when
// the Transform feeds Visual.RenderTransform). For a rotation around
// the visual's center, set the Visual's RenderTransformOrigin to
// (0.5, 0.5) and leave CenterX / CenterY at zero — the origin shift
// already handles centering. CenterX / CenterY are mostly useful for
// Geometry.Transform consumers that need a pivot in their own
// coordinate frame. WPF parity — RotateTransform.Angle is degrees.
export class RotateTransform extends Transform
{
    public static readonly AngleKey   = Model.RegisterProperty<number>(RotateTransform, 'Angle',   0, MetaData.Render);
    public static readonly CenterXKey = Model.RegisterProperty<number>(RotateTransform, 'CenterX', 0, MetaData.Render);
    public static readonly CenterYKey = Model.RegisterProperty<number>(RotateTransform, 'CenterY', 0, MetaData.Render);

    constructor(angle?: number, centerX?: number, centerY?: number)
    {
        super();
        if (angle   !== undefined) this.Angle   = angle;
        if (centerX !== undefined) this.CenterX = centerX;
        if (centerY !== undefined) this.CenterY = centerY;
    }

    public get Angle():   number { return this.get_property_value(RotateTransform.AngleKey); }
    public set Angle(v:   number) { this.set_property_value(RotateTransform.AngleKey, v); }

    public get CenterX(): number { return this.get_property_value(RotateTransform.CenterXKey); }
    public set CenterX(v: number) { this.set_property_value(RotateTransform.CenterXKey, v); }

    public get CenterY(): number { return this.get_property_value(RotateTransform.CenterYKey); }
    public set CenterY(v: number) { this.set_property_value(RotateTransform.CenterYKey, v); }

    public override get Matrix(): Matrix
    {
        const radians = (this.Angle * Math.PI) / 180;
        const r = Matrix.Rotate(radians);
        const cx = this.CenterX;
        const cy = this.CenterY;
        if (cx === 0 && cy === 0) return r;
        // T(-cx,-cy) · R · T(cx,cy)  — row-vector multiplication, so
        // the leftmost factor applies first to a point.
        return Matrix.Translate(-cx, -cy).Multiply(r).Multiply(Matrix.Translate(cx, cy));
    }
}

// Non-uniform scale by (ScaleX, ScaleY) around (CenterX, CenterY).
// Defaults: ScaleX = ScaleY = 1 (identity), CenterX = CenterY = 0
// (top-left pivot in local space). Same CenterX / CenterY note as
// RotateTransform: when feeding Visual.RenderTransform, prefer
// Visual.RenderTransformOrigin = (0.5, 0.5) for center-pivot scales.
export class ScaleTransform extends Transform
{
    public static readonly ScaleXKey  = Model.RegisterProperty<number>(ScaleTransform, 'ScaleX',  1, MetaData.Render);
    public static readonly ScaleYKey  = Model.RegisterProperty<number>(ScaleTransform, 'ScaleY',  1, MetaData.Render);
    public static readonly CenterXKey = Model.RegisterProperty<number>(ScaleTransform, 'CenterX', 0, MetaData.Render);
    public static readonly CenterYKey = Model.RegisterProperty<number>(ScaleTransform, 'CenterY', 0, MetaData.Render);

    constructor(scaleX?: number, scaleY?: number, centerX?: number, centerY?: number)
    {
        super();
        if (scaleX  !== undefined) this.ScaleX  = scaleX;
        if (scaleY  !== undefined) this.ScaleY  = scaleY;
        if (centerX !== undefined) this.CenterX = centerX;
        if (centerY !== undefined) this.CenterY = centerY;
    }

    public get ScaleX():  number { return this.get_property_value(ScaleTransform.ScaleXKey); }
    public set ScaleX(v:  number) { this.set_property_value(ScaleTransform.ScaleXKey, v); }

    public get ScaleY():  number { return this.get_property_value(ScaleTransform.ScaleYKey); }
    public set ScaleY(v:  number) { this.set_property_value(ScaleTransform.ScaleYKey, v); }

    public get CenterX(): number { return this.get_property_value(ScaleTransform.CenterXKey); }
    public set CenterX(v: number) { this.set_property_value(ScaleTransform.CenterXKey, v); }

    public get CenterY(): number { return this.get_property_value(ScaleTransform.CenterYKey); }
    public set CenterY(v: number) { this.set_property_value(ScaleTransform.CenterYKey, v); }

    public override get Matrix(): Matrix
    {
        const sx = this.ScaleX;
        const sy = this.ScaleY;
        const s  = Matrix.Scale(sx, sy);
        const cx = this.CenterX;
        const cy = this.CenterY;
        if (cx === 0 && cy === 0) return s;
        return Matrix.Translate(-cx, -cy).Multiply(s).Multiply(Matrix.Translate(cx, cy));
    }
}

// Shear by AngleX degrees horizontally (X-shift proportional to Y) and
// AngleY degrees vertically (Y-shift proportional to X), around
// (CenterX, CenterY). WPF parity — SkewTransform.AngleX / AngleY in
// degrees. Useful for slanted-card chrome, italic-style emphasis, and
// any "skew tile" effect a shape language wants. Combine with
// RenderTransformOrigin for visually-centered shears when the
// Transform is set as Visual.RenderTransform.
//
// Matrix layout (row-vector form, our M11/M12/M21/M22 convention):
//
//     | 1            tan(AngleY)  0 |
//     | tan(AngleX)  1            0 |
//     | 0            0            1 |
//
// AngleX shears horizontally: x' = x + y · tan(AngleX). AngleY shears
// vertically: y' = x · tan(AngleY) + y. CenterX / CenterY pivot the
// shear via a T(-c) · Skew · T(c) sandwich, same as Rotate / Scale.
export class SkewTransform extends Transform
{
    public static readonly AngleXKey  = Model.RegisterProperty<number>(SkewTransform, 'AngleX',  0, MetaData.Render);
    public static readonly AngleYKey  = Model.RegisterProperty<number>(SkewTransform, 'AngleY',  0, MetaData.Render);
    public static readonly CenterXKey = Model.RegisterProperty<number>(SkewTransform, 'CenterX', 0, MetaData.Render);
    public static readonly CenterYKey = Model.RegisterProperty<number>(SkewTransform, 'CenterY', 0, MetaData.Render);

    constructor(angleX?: number, angleY?: number, centerX?: number, centerY?: number)
    {
        super();
        if (angleX  !== undefined) this.AngleX  = angleX;
        if (angleY  !== undefined) this.AngleY  = angleY;
        if (centerX !== undefined) this.CenterX = centerX;
        if (centerY !== undefined) this.CenterY = centerY;
    }

    public get AngleX():  number { return this.get_property_value(SkewTransform.AngleXKey); }
    public set AngleX(v:  number) { this.set_property_value(SkewTransform.AngleXKey, v); }

    public get AngleY():  number { return this.get_property_value(SkewTransform.AngleYKey); }
    public set AngleY(v:  number) { this.set_property_value(SkewTransform.AngleYKey, v); }

    public get CenterX(): number { return this.get_property_value(SkewTransform.CenterXKey); }
    public set CenterX(v: number) { this.set_property_value(SkewTransform.CenterXKey, v); }

    public get CenterY(): number { return this.get_property_value(SkewTransform.CenterYKey); }
    public set CenterY(v: number) { this.set_property_value(SkewTransform.CenterYKey, v); }

    public override get Matrix(): Matrix
    {
        const tx = Math.tan((this.AngleX * Math.PI) / 180);
        const ty = Math.tan((this.AngleY * Math.PI) / 180);
        const skew = new Matrix(1, ty, tx, 1, 0, 0);
        const cx = this.CenterX;
        const cy = this.CenterY;
        if (cx === 0 && cy === 0) return skew;
        return Matrix.Translate(-cx, -cy).Multiply(skew).Multiply(Matrix.Translate(cx, cy));
    }
}

// Arbitrary 2D affine transform — the escape hatch when no specialized
// Transform subclass fits. Wraps a Matrix value type as a single
// bindable property. For composed transforms prefer TransformGroup
// (correct inner-property animation); use MatrixTransform when the
// matrix is computed externally and assigned wholesale.
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

// Composition of multiple Transforms applied in order. Children[0]
// is applied FIRST to a point (it's the innermost / rightmost factor
// in the composed matrix), then Children[1], and so on. Matches WPF's
// TransformGroup semantics.
//
// Matrix is recomputed on every read by folding `Multiply` over the
// children list — there's no per-instance matrix cache. The cost is
// linear in Children.Count plus a 6-mul-and-3-add per pair, which is
// negligible for the typical 2–4 children case.
//
// Inner-property changes on child Transforms (a nested RotateTransform.
// Angle tweening from 0 → 45) reach the owning Visual's render-
// invalidator through the group's _setRenderInvalidator forwarding:
// when a group is set on a Visual, the invalidator is fanned out to
// every child. Children added later (Children.Add after the group is
// installed) also inherit the same invalidator. Removed children get
// their invalidator cleared so a popped Transform stops keeping its
// former host alive.
export class TransformGroup extends Transform
{
    private readonly _children: ObservableCollection<Transform>;
    // Captured invalidator forwarded to every child. Mirrors the base
    // _invalidator slot so reads stay synchronous (no super-call into
    // a getter); the override _setRenderInvalidator below keeps the
    // two in lockstep.
    private _ownInvalidator: (() => void) | undefined;
    // Children we've called _setRenderInvalidator on. Tracked here so
    // a 'cleared' or 'removed' collection event can clear the
    // invalidator on departing children without having to reason about
    // the post-mutation collection state.
    private readonly _attachedChildren: Set<Transform> = new Set();

    constructor()
    {
        super();
        this._children = new ObservableCollection<Transform>();
        // Per-mutation reconciliation: each kind clears or installs the
        // invalidator on exactly the affected children. Runs synchronously
        // inside the mutating call, then flags the owning Visual render-
        // dirty so the structural change re-paints. Tracking attached
        // children in _attachedChildren lets 'cleared' fire without
        // re-walking the post-mutation (empty) collection.
        this._children.Subscribe((change) =>
        {
            const fn = this._ownInvalidator;
            switch (change.kind)
            {
                case 'inserted':
                    for (const c of change.items)
                    {
                        c._setRenderInvalidator(fn);
                        this._attachedChildren.add(c);
                    }
                    break;
                case 'removed':
                    for (const c of change.items)
                    {
                        c._setRenderInvalidator(undefined);
                        this._attachedChildren.delete(c);
                    }
                    break;
                case 'replaced':
                    change.oldItem._setRenderInvalidator(undefined);
                    this._attachedChildren.delete(change.oldItem);
                    change.newItem._setRenderInvalidator(fn);
                    this._attachedChildren.add(change.newItem);
                    break;
                case 'cleared':
                    for (const c of this._attachedChildren)
                    {
                        c._setRenderInvalidator(undefined);
                    }
                    this._attachedChildren.clear();
                    break;
                case 'moved':
                    // Identity preserved; invalidator state already
                    // correct for this child.
                    break;
            }
            fn?.();
        });
    }

    /** Ordered list of child transforms. Children[0] applies FIRST
     *  to a point, then Children[1], and so on (WPF TransformGroup
     *  semantics). Mutations fire render invalidation on the owning
     *  Visual when this group is set as Visual.RenderTransform. */
    public get Children(): ObservableCollection<Transform>
    {
        return this._children;
    }

    public override get Matrix(): Matrix
    {
        let m = Matrix.Identity;
        for (let i = 0; i < this._children.Count; i++)
        {
            const child = this._children.Get(i);
            if (child === undefined) continue;
            m = m.Multiply(child.Matrix);
        }
        return m;
    }

    public override _setRenderInvalidator(fn: (() => void) | undefined): void
    {
        super._setRenderInvalidator(fn);
        this._ownInvalidator = fn;
        // Mirror the new invalidator out to every currently-attached
        // child. _attachedChildren is the source of truth for which
        // children currently have an installed invalidator; iterating
        // it (rather than the collection) keeps the two in sync even
        // when a child was added before this group was set on a Visual.
        for (let i = 0; i < this._children.Count; i++)
        {
            const child = this._children.Get(i);
            if (child !== undefined)
            {
                child._setRenderInvalidator(fn);
                this._attachedChildren.add(child);
            }
        }
    }
}
